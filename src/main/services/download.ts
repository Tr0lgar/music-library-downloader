import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { Download } from 'ytdlp-nodejs'
import ffmpegPath from 'ffmpeg-static'
import { ID3Writer } from 'browser-id3-writer'
import type { DownloadProgress, DownloadRequest } from '@shared/types'
import { searchYoutube } from './youtube'
import { findBestMatch } from './matching'
import { sanitizeFileName } from '../utils/sanitize'
import { getBrowserCandidates } from '../utils/defaultBrowser'

// yt-dlp/ffmpeg --audio-quality: 0 (best) - 10 (worst) VBR, or a bitrate like "192K".
const AUDIO_QUALITY = '192K'

// Downloads run concurrently up to this limit — high enough to feel parallel,
// low enough to avoid tripping YouTube's anti-bot throttling further.
const MAX_CONCURRENT_DOWNLOADS = 3

function getDownloadRoot(): string {
  return join(app.getPath('music'), 'Music Library Downloader')
}

// Both patterns boil down to the same fix: yt-dlp couldn't use an
// authenticated YouTube session. Either the video needs sign-in and no valid
// cookies were found (first pattern), or it couldn't even read the target
// browser's cookie database at all — e.g. it's not logged in, has no
// profile data, or is still running and locking the file (second pattern).
const AUTH_FAILURE_PATTERNS = [
  /sign in to confirm your age/i,
  /could not copy .*cookie.*database/i,
  /could not find .*cookies?/i
]

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function isAuthFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return AUTH_FAILURE_PATTERNS.some((pattern) => pattern.test(message))
}

// yt-dlp's own message is accurate but assumes a CLI user (mentions
// --cookies-from-browser flags); translate it into something actionable in
// the app's UI instead. By the time this fires we've already tried every
// browser in `browsers` (see the download loop below), so this genuinely
// means none of them had a valid session — not just the first guess.
function toFriendlyError(error: unknown, browsers: string[]): Error {
  if (isAuthFailure(error)) {
    const browserList = browsers.map(capitalize).join(', ')
    return new Error(
      `This track needs a signed-in YouTube session. Log into YouTube in one of these browsers — ${browserList} — then try again.`
    )
  }

  return error instanceof Error ? error : new Error(String(error))
}

class ConcurrencyLimiter {
  private active = 0
  private readonly queue: (() => void)[] = []

  constructor(private readonly maxConcurrent: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve))
    }
    this.active++
    try {
      return await task()
    } finally {
      this.active--
      this.queue.shift()?.()
    }
  }
}

const limiter = new ConcurrencyLimiter(MAX_CONCURRENT_DOWNLOADS)

// Cover Art Archive — same source as the discography grid.
async function fetchCoverArt(releaseGroupId: string): Promise<ArrayBuffer | undefined> {
  try {
    const response = await fetch(
      `https://coverartarchive.org/release-group/${releaseGroupId}/front-500`
    )
    if (!response.ok) return undefined
    return await response.arrayBuffer()
  } catch {
    return undefined
  }
}

// Deliberately not using yt-dlp's --embed-metadata/--embed-thumbnail: those
// pull the video's own title/uploader/thumbnail. We want the MusicBrainz +
// Cover Art Archive data instead.
function tagFile(filePath: string, request: DownloadRequest, cover?: ArrayBuffer): void {
  const fileBuffer = readFileSync(filePath)
  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  )

  const writer = new ID3Writer(arrayBuffer)
  writer.setFrame('TIT2', request.title)
  writer.setFrame('TPE1', [request.artist])
  writer.setFrame('TALB', request.album)
  writer.setFrame('TRCK', String(request.trackNumber))
  if (request.year) writer.setFrame('TYER', Number(request.year))
  if (request.genres?.length) writer.setFrame('TCON', request.genres)
  if (cover) {
    writer.setFrame('APIC', {
      // ImageType.CoverFront from browser-id3-writer — inlined as a literal
      // because it's an ambient `const enum`, which isolatedModules forbids
      // importing as a value.
      type: 3,
      data: cover,
      description: 'Cover'
    })
  }

  writeFileSync(filePath, Buffer.from(writer.addTag()))
}

// Search -> match -> download -> tag, for a single track.
export async function downloadTrack(
  request: DownloadRequest,
  onProgress: (update: DownloadProgress) => void
): Promise<void> {
  const emit = (status: DownloadProgress['status'], progress: number, error?: string): void =>
    onProgress({
      id: request.id,
      title: request.title,
      artist: request.artist,
      album: request.album,
      status,
      progress,
      error
    })

  // Emitted immediately, before waiting on a concurrency slot, so every
  // requested track shows up in the sidebar right away instead of only
  // once it's actually its turn to run.
  emit('queued', 0)

  // Ordered browser list, tried in the download loop below — and reused in
  // the catch block, so the friendly message can name every browser we
  // actually attempted rather than just one guess.
  const browserCandidates = getBrowserCandidates()

  await limiter.run(async () => {
    try {
      emit('searching', 0)
      const candidates = await searchYoutube(request.artist, request.title)
      if (candidates.length === 0) {
        throw new Error('No YouTube result found for this track.')
      }

      const match = findBestMatch(
        { title: request.title, artist: request.artist, durationMs: request.durationMs },
        candidates
      )

      const destinationDir = join(
        getDownloadRoot(),
        sanitizeFileName(request.artist),
        sanitizeFileName(request.album)
      )
      mkdirSync(destinationDir, { recursive: true })

      // No track number prefix — it's already in the TRCK ID3 tag, and
      // duplicating it in the filename was redundant.
      const fileBaseName = sanitizeFileName(request.title)
      const outputTemplate = join(destinationDir, `${fileBaseName}.%(ext)s`)

      emit('downloading', 0)

      // `match.candidates` is already sorted best-first (and includes the
      // best pick at index 0 either way). A given YouTube video can fail for
      // reasons unrelated to how good a match it is — geo/age restriction,
      // a transient 403, etc. — so fall through to the next-best candidate
      // instead of giving up on the whole track.
      //
      // Nested inside that: we don't know which browser (if any) has a
      // valid YouTube login, so the outer loop tries each supported browser
      // in turn against every candidate, and only moves on to the next
      // browser if the failure actually looked auth-related — a network
      // blip or bad format isn't going to be fixed by switching browsers.
      let filePath: string | undefined
      let lastError: unknown

      browserLoop: for (const browser of browserCandidates) {
        for (const candidate of match.candidates) {
          try {
            const download = new Download(candidate.url, { ffmpegPath: ffmpegPath ?? undefined })
              .setOutputTemplate(outputTemplate)
              .extractAudio('mp3')
              .audioQuality(AUDIO_QUALITY)
              .cookiesFromBrowser(browser)

            download.on('progress', (progress) => {
              emit('downloading', progress.percentage ?? 0)
            })

            const result = await download.run()
            filePath = result.filePaths[0]
            if (filePath) break browserLoop
          } catch (error) {
            lastError = error
            console.warn(
              `[download] candidate failed (browser=${browser}): ${candidate.url}`,
              error
            )
          }
        }

        if (!isAuthFailure(lastError)) break
      }

      if (!filePath) {
        throw lastError ?? new Error('All candidate sources failed.')
      }

      emit('tagging', 100)
      const cover = await fetchCoverArt(request.releaseGroupId)
      tagFile(filePath, request, cover)

      emit('done', 100)
    } catch (error) {
      const friendly = toFriendlyError(error, browserCandidates)
      emit('error', 0, friendly.message)
    }
  })
}
