import type { AlbumTrack } from '@shared/types'

export function albumTracksQueryOptions(releaseGroupId: string): {
  queryKey: readonly ['album-tracks', string]
  queryFn: () => Promise<AlbumTrack[]>
} {
  return {
    queryKey: ['album-tracks', releaseGroupId] as const,
    queryFn: () => window.api.getAlbumTracks(releaseGroupId)
  }
}
