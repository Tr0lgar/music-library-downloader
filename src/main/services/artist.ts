import type { ArtistDetails } from '@shared/types'
import { getArtistWithReleaseGroups } from './musicbrainz'
import { getArtistBiography } from './wikipedia'

export async function getArtistDetails(id: string): Promise<ArtistDetails> {
  const artist = await getArtistWithReleaseGroups(id)
  const biography = await getArtistBiography(artist.wikidataId)

  return {
    id: artist.id,
    name: artist.name,
    type: artist.type,
    country: artist.country,
    disambiguation: artist.disambiguation,
    biography,
    releaseGroups: artist.releaseGroups
  }
}
