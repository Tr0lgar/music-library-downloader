import type { AlbumResult, AlbumTrack, ArtistResult, SearchType, TrackResult } from '@shared/types'

const MUSICBRAINZ_BASE_URL = 'https://musicbrainz.org/ws/2'

// MusicBrainz requires a descriptive User-Agent identifying the app and a
// contact (URL or email), otherwise requests get rate-limited more aggressively.
// Replace the contact info below with your own before shipping this anywhere.
const USER_AGENT = 'MusicLibraryDownloader/0.0.1 ( contact: replace-me@example.com )'

/**
 * MusicBrainz allows ~1 request/second without an API key. This queues every
 * call and waits at least `minIntervalMs` after each one finishes before the
 * next is allowed to start, regardless of how many calls come in at once.
 */
class RateLimiter {
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly minIntervalMs: number) {}

  schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const result = await task()
      await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs))
      return result
    })
    this.queue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }
}

const limiter = new RateLimiter(1000)

// Raw MusicBrainz API response shapes — kebab-case fields, as the API sends them.

interface MusicBrainzArtistCredit {
  name: string
}

interface MusicBrainzArtist {
  id: string
  name: string
  type?: string
  country?: string
  disambiguation?: string
}

interface MusicBrainzUrlRelation {
  type: string
  url: { resource: string }
}

interface MusicBrainzReleaseGroup {
  id: string
  title: string
  'primary-type'?: string
  'first-release-date'?: string
  'artist-credit'?: MusicBrainzArtistCredit[]
}

interface MusicBrainzRecording {
  id: string
  title: string
  length?: number
  'artist-credit'?: MusicBrainzArtistCredit[]
}

// The `?inc=release-groups+url-rels` lookup embeds both the discography and
// the relationship list (including a Wikidata link, if any) directly in the
// artist response, so we only need a single throttled MusicBrainz call.
interface MusicBrainzArtistLookup extends MusicBrainzArtist {
  relations?: MusicBrainzUrlRelation[]
  'release-groups'?: MusicBrainzReleaseGroup[]
}

export interface ArtistWithReleaseGroups {
  id: string
  name: string
  type?: string
  country?: string
  disambiguation?: string
  wikidataId?: string
  releaseGroups: AlbumResult[]
}

interface MusicBrainzTrack {
  id: string
  position: number
  title: string
  length?: number
  'artist-credit'?: MusicBrainzArtistCredit[]
  recording?: {
    id: string
    length?: number
  }
}

interface MusicBrainzRelease {
  id: string
  media: { tracks: MusicBrainzTrack[] }[]
}

async function mbRequest<T>(path: string, params: Record<string, string>): Promise<T> {
  return limiter.schedule(async () => {
    const searchParams = new URLSearchParams({ fmt: 'json', ...params })
    const url = `${MUSICBRAINZ_BASE_URL}/${path}?${searchParams.toString()}`
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
    })

    if (!response.ok) {
      throw new Error(`MusicBrainz responded ${response.status} for "${path}"`)
    }

    return response.json() as Promise<T>
  })
}

function joinArtistCredit(credits?: MusicBrainzArtistCredit[]): string {
  return credits && credits.length > 0 ? credits.map((c) => c.name).join(', ') : 'Unknown artist'
}

// Used by the search bar — artist / album / track.

async function searchArtists(term: string): Promise<ArtistResult[]> {
  const data = await mbRequest<{ artists: MusicBrainzArtist[] }>('artist', {
    query: term,
    limit: '15'
  })
  return data.artists.map((artist) => ({
    id: artist.id,
    name: artist.name,
    type: artist.type,
    country: artist.country,
    disambiguation: artist.disambiguation
  }))
}

async function searchAlbums(term: string): Promise<AlbumResult[]> {
  const data = await mbRequest<{ 'release-groups': MusicBrainzReleaseGroup[] }>('release-group', {
    query: term,
    limit: '15'
  })
  return data['release-groups'].map((releaseGroup) => ({
    id: releaseGroup.id,
    title: releaseGroup.title,
    artist: joinArtistCredit(releaseGroup['artist-credit']),
    primaryType: releaseGroup['primary-type'],
    firstReleaseDate: releaseGroup['first-release-date']
  }))
}

async function searchTracks(term: string): Promise<TrackResult[]> {
  const data = await mbRequest<{ recordings: MusicBrainzRecording[] }>('recording', {
    query: term,
    limit: '15'
  })
  return data.recordings.map((recording) => ({
    id: recording.id,
    title: recording.title,
    artist: joinArtistCredit(recording['artist-credit']),
    length: recording.length
  }))
}

export async function searchMusicBrainz(
  term: string,
  type: SearchType
): Promise<ArtistResult[] | AlbumResult[] | TrackResult[]> {
  switch (type) {
    case 'artist':
      return searchArtists(term)
    case 'album':
      return searchAlbums(term)
    case 'track':
      return searchTracks(term)
  }
}

const DISCOGRAPHY_PRIMARY_TYPES = new Set(['Album', 'EP'])

export async function getArtistWithReleaseGroups(id: string): Promise<ArtistWithReleaseGroups> {
  const data = await mbRequest<MusicBrainzArtistLookup>(`artist/${id}`, {
    inc: 'release-groups+url-rels'
  })

  const wikidataRelation = data.relations?.find((relation) => relation.type === 'wikidata')
  const wikidataId = wikidataRelation?.url.resource.split('/').pop()

  const releaseGroups = (data['release-groups'] ?? [])
    .filter((releaseGroup) => DISCOGRAPHY_PRIMARY_TYPES.has(releaseGroup['primary-type'] ?? ''))
    .map((releaseGroup) => ({
      id: releaseGroup.id,
      title: releaseGroup.title,
      // Embedded release-groups don't repeat the artist-credit (it's the
      // artist we just looked up), so use its name directly.
      artist: data.name,
      primaryType: releaseGroup['primary-type'],
      firstReleaseDate: releaseGroup['first-release-date']
    }))
    .sort((a, b) => (a.firstReleaseDate ?? '9999').localeCompare(b.firstReleaseDate ?? '9999'))

  return {
    id: data.id,
    name: data.name,
    type: data.type,
    country: data.country,
    disambiguation: data.disambiguation,
    wikidataId,
    releaseGroups
  }
}

// release-group -> its first release -> tracks, in one call.
export async function getAlbumTracks(releaseGroupId: string): Promise<AlbumTrack[]> {
  const data = await mbRequest<{ releases: MusicBrainzRelease[] }>('release', {
    'release-group': releaseGroupId,
    inc: 'recordings+artist-credits',
    limit: '1'
  })

  const release = data.releases[0]
  if (!release) return []

  return release.media.flatMap((medium) =>
    medium.tracks.map((track) => ({
      id: track.recording?.id ?? track.id,
      title: track.title,
      artist: joinArtistCredit(track['artist-credit']),
      length: track.length ?? track.recording?.length,
      position: track.position
    }))
  )
}
