import { YtDlp } from 'ytdlp-nodejs'
import ffmpegPath from 'ffmpeg-static'
import type { YoutubeCandidate } from '@shared/types'
import { getBrowserCandidates } from '../utils/defaultBrowser'

const ytDlp = new YtDlp({ ffmpegPath: ffmpegPath ?? undefined })

// A ytsearch call coming back with zero entries is usually YouTube briefly
// throttling/blocking the request (more likely now that several searches and
// downloads run concurrently), not a genuine "nothing exists" — so retry a
// couple of times with a short backoff before giving up.
const EMPTY_RESULT_RETRIES = 2
const RETRY_DELAY_MS = 1000

// Some queries return zero results outright — YouTube appears to apply
// search-level content filtering to certain words in the query text itself
// (confirmed by hand: a query containing the literal track title can return
// nothing at all even though the video exists, is unlisted nowhere, and
// shows up easily when browsing the artist's own uploads instead). When that
// happens, cast a much wider net on the artist alone and let the matching
// step pick the right video out of the larger pool.
const BROAD_SEARCH_LIMIT = 20

async function fetchSearchResults(
  query: string,
  limit: number,
  flatPlaylist: boolean
): Promise<YoutubeCandidate[]> {
  const result = await ytDlp.getInfoAsync<'playlist'>(`ytsearch${limit}:${query}`, {
    flatPlaylist,
    // Just the top candidate here — if cookies aren't readable, this whole
    // call throws and searchYoutubeOnce already falls back to a flat search,
    // which rarely needs auth anyway. The multi-browser retry lives in the
    // download step, where an auth failure is otherwise a dead end.
    cookiesFromBrowser: getBrowserCandidates()[0]
  })

  return result.entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    channel: entry.channel || entry.uploader || 'Unknown channel',
    durationSeconds: entry.duration,
    url: entry.webpage_url || `https://www.youtube.com/watch?v=${entry.id}`
  }))
}

async function searchYoutubeOnce(query: string, limit: number): Promise<YoutubeCandidate[]> {
  try {
    // Full extraction (flatPlaylist: false) visits every result's page to
    // read its duration, which matching needs. The catch is that if
    // any ONE result is age-restricted/unavailable, yt-dlp aborts the whole
    // batch instead of just skipping it.
    return await fetchSearchResults(query, limit, false)
  } catch (error) {
    // Fall back to a flat/shallow search — no per-video page visits, so one
    // bad result can't take out the others. Candidates from this path won't
    // have a duration (matching just treats that as neutral), but the actual
    // download step re-tries its pick with its own per-candidate fallback
    // and friendly error handling anyway, so this only affects match quality,
    // not whether a track can be found at all.
    console.warn(`[youtube] full search failed for "${query}", falling back to flat search:`, error)
    return fetchSearchResults(query, limit, true)
  }
}

/**
 * Searches YouTube via yt-dlp's built-in `ytsearchN:` pseudo-URL — no API
 * key needed. Fetches full metadata per result (not the fast/flat variant)
 * because matching needs each candidate's duration.
 */
export async function searchYoutube(
  artist: string,
  title: string,
  limit = 5
): Promise<YoutubeCandidate[]> {
  const query = `${artist} ${title}`

  for (let attempt = 0; attempt <= EMPTY_RESULT_RETRIES; attempt++) {
    const results = await searchYoutubeOnce(query, limit)
    if (results.length > 0) return results

    if (attempt < EMPTY_RESULT_RETRIES) {
      console.warn(`[youtube] empty search result for "${query}", retrying...`)
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)))
    }
  }

  console.warn(`[youtube] "${query}" returned nothing, broadening to an artist-only search`)
  return searchYoutubeOnce(artist, BROAD_SEARCH_LIMIT)
}
