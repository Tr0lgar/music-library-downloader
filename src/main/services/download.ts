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

// Search and stream download are throttled separately rather than under one
// shared limit: they're different network operations against YouTube, and
// bundling them meant a slot stayed occupied for a track's entire download +
// tagging just to keep the search step in check — blocking the next track's
// search for no reason, since tagging/cover art don't touch YouTube at all.
const MAX_CONCURRENT_SEARCHES = 4
const MAX_CONCURRENT_STREAM_DOWNLOADS = 5

// yt-dlp reports progress up to ~10x/second per track; with several tracks
// downloading at once that's dozens of IPC messages (and renderer state
// updates) per second, which visibly bogged the whole UI down during album
// downloads. 5 updates/second per track is indistinguishable to the eye on
// a bar this small.
const PROGRESS_EMIT_INTERVAL_MS = 200

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

// Cover art is usually cached and tagFile() is just local disk I/O, so this
// step can finish in well under 1s — too fast to see DownloadStatusSteps'
// tag icon play its own ~850ms animation before the UI jumps to 'done'.
// Padding the step out to a fixed minimum gives it room to actually be seen.
const MIN_TAGGING_DISPLAY_MS = 1200

const searchLimiter = new ConcurrencyLimiter(MAX_CONCURRENT_SEARCHES)
const downloadLimiter = new ConcurrencyLimiter(MAX_CONCURRENT_STREAM_DOWNLOADS)

// Cover Art Archive — same source as the discography grid. Its image
// endpoint (unlike the rest of archive.org) has been intermittently
// returning 500s — observed ~40% failure rate on otherwise identical
// requests — so a single attempt isn't reliable enough on its own.
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
      // A 404 means this release-group genuinely has no cover art on file —
      // retrying won't change that, unlike a 5xx or a network hiccup.
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

// Every track on an album shares the same cover, so fetch it once per
// release-group and let every track in the batch reuse it — this both cuts
// the request count and, since the cache holds the in-flight promise itself,
// coalesces concurrent tracks of the same album onto a single request
// instead of each racing the flaky endpoint independently.
//
// A confirmed "no art" (404) result is cached indefinitely — that's stable
// MusicBrainz data. A transient failure is evicted after it settles instead,
// so it doesn't permanently deny a cover to an album that just happened to
// hit a bad request; a later call (a retry, or the next batch) gets a fresh
// attempt rather than replaying a stale failure.
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

interface CancellationToken {
  canceled: boolean
  activeDownload: Download | null
  destinationDir: string
  fileBaseName: string
}

// One entry per track currently inside downloadTrack(), keyed by track id —
// lets cancelDownload() (called from the UI, completely out-of-band from
// this function's own control flow) reach in and kill whatever's running.
const cancellationTokens = new Map<string, CancellationToken>()

// Give the just-killed process a moment to actually release its file
// handles before deleting what it was writing — doing it immediately after
// kill() can race the OS into an EBUSY/EPERM, especially on Windows.
const CANCEL_CLEANUP_DELAY_MS = 500

// yt-dlp's own temp-file naming (`.part` while downloading, intermediate
// container before ffmpeg extracts audio, ...) isn't worth replicating here
// — anything in the destination folder sharing the track's file base name
// belongs to this download and nothing else, so it's safe to sweep by
// prefix rather than track exact filenames through every stage.
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

// Called from the UI when the user cancels an in-progress track. Kills
// whatever yt-dlp process is currently running for it, if any — it might
// still be searching, with nothing to kill yet — and best-effort deletes
// anything already written. downloadTrack() notices the cancellation on its
// own and stops retrying or emitting further progress for this id.
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

  // Emitted immediately, before waiting on a concurrency slot, so every
  // requested track shows up in the sidebar right away instead of only
  // once it's actually its turn to run.
  emit('queued', 0)

  // Ordered browser list, tried in the download loop below — and reused in
  // the catch block, so the friendly message can name every browser we
  // actually attempted rather than just one guess.
  const browserCandidates = getBrowserCandidates()

  // Destination is derived purely from the request, so it's known before
  // search even starts — registered immediately so a cancellation arriving
  // at any point, including while still searching, knows what to clean up.
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
    // Status flips to 'searching' only once the limiter actually grants a
    // slot — emitting it earlier would show every queued track as
    // "searching" while most of them are really just waiting in line.
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

    // Filed under the album's artist, not this track's own artist-credit —
    // otherwise a collab/feature track would land in its own separate
    // "Artist A, Artist B" folder instead of alongside the rest of the album.
    const { destinationDir, fileBaseName } = token
    mkdirSync(destinationDir, { recursive: true })

    // No track number prefix — it's already in the TRCK ID3 tag, and
    // duplicating it in the filename was redundant.
    const outputTemplate = join(destinationDir, `${fileBaseName}.%(ext)s`)

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
          // Only announced when there's actually a slot to wait for.
          // Emitting it unconditionally on every retry reset the UI to
          // 'queued'/0% even when the next attempt started immediately —
          // visible as the progress bar jumping backward and its wave
          // flattening out on every failed candidate, not just genuine
          // queueing.
          if (!downloadLimiter.hasAvailableSlot()) emit('queued', 0)
          filePath = await downloadLimiter.run(async () => {
            const download = new Download(candidate.url, { ffmpegPath: ffmpegPath ?? undefined })
              .setOutputTemplate(outputTemplate)
              .extractAudio('mp3')
              .audioQuality(AUDIO_QUALITY)
              .cookiesFromBrowser(browser)

            // Handed to cancelDownload() the instant it exists — a cancel
            // arriving while this attempt was merely queued for a slot (no
            // process yet) falls through to the check just below instead.
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
              // yt-dlp computes this tick's percentage from downloaded_bytes
              // over total_bytes — falling back to total_bytes_estimate when
              // the exact size isn't known yet. That estimate gets revised
              // as more of the stream arrives, which retroactively raises or
              // lowers the percentage for the same downloaded_bytes — seen
              // as the bar filling up, then jumping backward. Once shown, a
              // download's progress should only ever move forward.
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

    // Cover art and tagging are local/cached work with no YouTube traffic,
    // so they run unthrottled once the download slot above has freed up.
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
