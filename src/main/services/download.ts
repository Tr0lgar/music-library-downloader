import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
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

// Throttled separately from downloads: search and stream are different
// YouTube operations, and one shared limit kept a slot occupied through
// tagging for no reason.
const MAX_CONCURRENT_SEARCHES = 4
const MAX_CONCURRENT_STREAM_DOWNLOADS = 5

// yt-dlp reports progress ~10x/second per track, which bogged down the UI
// across several concurrent downloads.
const PROGRESS_EMIT_INTERVAL_MS = 200

function getDownloadRoot(): string {
  return join(app.getPath('music'), 'Music Library Downloader')
}

// Both mean yt-dlp couldn't use an authenticated YouTube session: either the
// video needs sign-in with no valid cookies found, or it couldn't read the
// browser's cookie database at all.
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

// yt-dlp's own error assumes a CLI user (--cookies-from-browser flags);
// translate it into something actionable in the UI instead.
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

  hasAvailableSlot(): boolean {
    return this.active < this.maxConcurrent
  }

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

// Tagging is fast local I/O — often under 1s, too fast to see the tag icon's
// own ~850ms animation before the UI jumps to 'done'.
const MIN_TAGGING_DISPLAY_MS = 1200

const searchLimiter = new ConcurrencyLimiter(MAX_CONCURRENT_SEARCHES)
const downloadLimiter = new ConcurrencyLimiter(MAX_CONCURRENT_STREAM_DOWNLOADS)

// Cover Art Archive's image endpoint intermittently 500s (~40% observed
// failure rate), so a single attempt isn't reliable enough.
const COVER_ART_ATTEMPTS = 3
const COVER_ART_RETRY_DELAY_MS = 800

const COVER_NOT_FOUND = Symbol('cover-not-found')

async function downloadCoverArt(
  releaseGroupId: string
): Promise<ArrayBuffer | typeof COVER_NOT_FOUND> {
  const url = `https://coverartarchive.org/release-group/${releaseGroupId}/front-500`
  let lastError: unknown

  for (let attempt = 1; attempt <= COVER_ART_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url)
      // A 404 means no cover art on file — retrying won't change that.
      if (response.status === 404) return COVER_NOT_FOUND
      if (response.ok) return await response.arrayBuffer()
      lastError = new Error(`Cover Art Archive responded ${response.status}`)
    } catch (error) {
      lastError = error
    }

    if (attempt < COVER_ART_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, COVER_ART_RETRY_DELAY_MS * attempt))
    }
  }

  throw lastError ?? new Error('Cover Art Archive request failed')
}

// One fetch per release-group, shared by every track in the batch — the
// cache holds the in-flight promise itself, so concurrent tracks of the same
// album coalesce onto a single request. A confirmed 404 is cached
// indefinitely; a transient failure is evicted so a later call gets a fresh
// attempt.
const coverCache = new Map<string, Promise<ArrayBuffer | typeof COVER_NOT_FOUND>>()

async function fetchCoverArt(releaseGroupId: string): Promise<ArrayBuffer | undefined> {
  let pending = coverCache.get(releaseGroupId)
  if (!pending) {
    pending = downloadCoverArt(releaseGroupId)
    coverCache.set(releaseGroupId, pending)
  }

  try {
    const result = await pending
    return result === COVER_NOT_FOUND ? undefined : result
  } catch (error) {
    coverCache.delete(releaseGroupId)
    console.warn(`[cover] giving up on release-group ${releaseGroupId}:`, error)
    return undefined
  }
}

// Not using yt-dlp's --embed-metadata/--embed-thumbnail: those pull the
// video's own title/uploader/thumbnail instead of the MusicBrainz data.
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
      // ImageType.CoverFront — inlined since it's an ambient `const enum`,
      // which isolatedModules forbids importing as a value.
      type: 3,
      data: cover,
      description: 'Cover'
    })
  }

  writeFileSync(filePath, Buffer.from(writer.addTag()))
}

interface CancellationToken {
  canceled: boolean
  activeDownload: Download | null
  destinationDir: string
  fileBaseName: string
}

// One entry per track currently inside downloadTrack(), keyed by track id —
// lets cancelDownload() reach in and kill whatever's running.
const cancellationTokens = new Map<string, CancellationToken>()

// A just-killed process needs a moment to release its file handles before
// deleting what it was writing, or deletion can race into an EBUSY/EPERM.
const CANCEL_CLEANUP_DELAY_MS = 500

// Sweeps anything in the destination folder sharing the track's file base
// name, rather than tracking yt-dlp/ffmpeg's exact intermediate filenames.
function cleanupPartialFiles(destinationDir: string, fileBaseName: string): void {
  let entries: string[]
  try {
    entries = readdirSync(destinationDir)
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.startsWith(fileBaseName)) continue
    try {
      unlinkSync(join(destinationDir, entry))
    } catch (error) {
      console.warn(`[download] failed to remove partial file "${entry}":`, error)
    }
  }
}

// Kills whatever yt-dlp process is running for this track, if any, and
// best-effort deletes anything already written. downloadTrack() notices the
// cancellation on its own and stops.
export function cancelDownload(id: string): void {
  const token = cancellationTokens.get(id)
  if (!token) return

  token.canceled = true
  token.activeDownload?.kill()
  setTimeout(
    () => cleanupPartialFiles(token.destinationDir, token.fileBaseName),
    CANCEL_CLEANUP_DELAY_MS
  )
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

  // Emitted before waiting on a concurrency slot, so the track shows up in
  // the sidebar right away rather than only once it's its turn to run.
  emit('queued', 0)

  const browserCandidates = getBrowserCandidates()

  // Registered immediately (destination is derivable from the request
  // alone) so a cancellation arriving while still searching knows what to
  // clean up.
  const token: CancellationToken = {
    canceled: false,
    activeDownload: null,
    destinationDir: join(
      getDownloadRoot(),
      sanitizeFileName(request.albumArtist),
      sanitizeFileName(request.album)
    ),
    fileBaseName: sanitizeFileName(request.title)
  }
  cancellationTokens.set(request.id, token)

  try {
    // Only flips to 'searching' once the limiter grants a slot, or every
    // queued track would show as "searching" while waiting in line.
    const candidates = await searchLimiter.run(() => {
      emit('searching', 0)
      return searchYoutube(request.artist, request.title)
    })
    if (token.canceled) return
    if (candidates.length === 0) {
      throw new Error('No YouTube result found for this track.')
    }

    const match = findBestMatch(
      { title: request.title, artist: request.artist, durationMs: request.durationMs },
      candidates
    )

    // Filed under the album's artist, not this track's artist-credit — a
    // collab/feature track otherwise lands in its own separate folder.
    const { destinationDir, fileBaseName } = token
    mkdirSync(destinationDir, { recursive: true })

    const outputTemplate = join(destinationDir, `${fileBaseName}.%(ext)s`)

    // Falls through to the next-best candidate on failure (geo/age
    // restriction, a transient 403, ...) instead of giving up on the track.
    // The outer loop only moves to the next browser if the failure looked
    // auth-related — a network blip isn't fixed by switching browsers.
    let filePath: string | undefined
    let lastError: unknown

    browserLoop: for (const browser of browserCandidates) {
      for (const candidate of match.candidates) {
        try {
          // Only announced when there's actually a slot to wait for —
          // emitting it on every retry made the bar jump backward on every
          // failed candidate, not just genuine queueing.
          if (!downloadLimiter.hasAvailableSlot()) emit('queued', 0)
          filePath = await downloadLimiter.run(async () => {
            const download = new Download(candidate.url, { ffmpegPath: ffmpegPath ?? undefined })
              .setOutputTemplate(outputTemplate)
              .extractAudio('mp3')
              .audioQuality(AUDIO_QUALITY)
              .cookiesFromBrowser(browser)

            token.activeDownload = download
            if (token.canceled) {
              download.kill()
              throw new Error('Download canceled')
            }

            emit('downloading', 0)
            let lastProgressEmit = 0
            let bestPercentage = 0
            download.on('progress', (progress) => {
              const now = Date.now()
              if (now - lastProgressEmit < PROGRESS_EMIT_INTERVAL_MS) return
              lastProgressEmit = now
              // yt-dlp falls back to total_bytes_estimate when the exact
              // size isn't known yet, and revises it mid-stream — clamped
              // here so progress never visibly jumps backward.
              bestPercentage = Math.max(bestPercentage, progress.percentage ?? 0)
              emit('downloading', bestPercentage)
            })

            const result = await download.run()
            return result.filePaths[0]
          })
          if (filePath) break browserLoop
        } catch (error) {
          if (token.canceled) break browserLoop
          lastError = error
          console.warn(`[download] candidate failed (browser=${browser}): ${candidate.url}`, error)
        }
      }

      if (!isAuthFailure(lastError)) break
    }

    if (token.canceled) return

    if (!filePath) {
      throw lastError ?? new Error('All candidate sources failed.')
    }

    emit('tagging', 100)
    const taggingStartedAt = Date.now()
    const cover = await fetchCoverArt(request.releaseGroupId)
    tagFile(filePath, request, cover)
    if (token.canceled) return

    const taggingElapsedMs = Date.now() - taggingStartedAt
    if (taggingElapsedMs < MIN_TAGGING_DISPLAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_TAGGING_DISPLAY_MS - taggingElapsedMs))
    }

    emit('done', 100)
  } catch (error) {
    if (!token.canceled) {
      const friendly = toFriendlyError(error, browserCandidates)
      emit('error', 0, friendly.message)
    }
  } finally {
    cancellationTokens.delete(request.id)
  }
}
