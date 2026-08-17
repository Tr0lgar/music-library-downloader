export type SearchType = 'artist' | 'album' | 'track'

export interface ArtistResult {
  id: string
  name: string
  type?: string
  country?: string
  disambiguation?: string
}

export interface AlbumResult {
  id: string
  title: string
  artist: string
  primaryType?: string
  firstReleaseDate?: string
  genres?: string[]
}

export interface TrackResult {
  id: string
  title: string
  artist: string
  length?: number
}

export interface ArtistDetails {
  id: string
  name: string
  type?: string
  country?: string
  disambiguation?: string
  biography?: string
  releaseGroups: AlbumResult[]
}

export interface AlbumTrack {
  id: string
  title: string
  artist: string
  length?: number
  position: number
}

export interface YoutubeCandidate {
  id: string
  title: string
  channel: string
  durationSeconds?: number
  url: string
}

export interface MatchCandidate extends YoutubeCandidate {
  score: number
}

export type MatchStatus = 'matched' | 'ambiguous'

export interface MatchResult {
  status: MatchStatus
  best?: MatchCandidate
  candidates: MatchCandidate[]
}

export interface DownloadRequest {
  id: string
  title: string
  artist: string
  album: string
  releaseGroupId: string
  trackNumber: number
  year?: string
  durationMs?: number
  genres?: string[]
}

export type DownloadStatus = 'queued' | 'searching' | 'downloading' | 'tagging' | 'done' | 'error'

export interface DownloadProgress {
  id: string
  title: string
  artist: string
  album: string
  status: DownloadStatus
  progress: number
  error?: string
}
