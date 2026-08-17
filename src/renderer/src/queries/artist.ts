import type { ArtistDetails } from '@shared/types'

export function artistQueryOptions(id: string): {
  queryKey: readonly ['artist', string]
  queryFn: () => Promise<ArtistDetails>
} {
  return {
    queryKey: ['artist', id] as const,
    queryFn: () => window.api.getArtistDetails(id)
  }
}
