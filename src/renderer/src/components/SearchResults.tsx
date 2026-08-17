import { Link } from 'react-router-dom'
import { Spinner } from '@heroui/react'
import type { AlbumResult, ArtistResult, SearchType, TrackResult } from '@shared/types'
import { formatDuration } from '../utils/format'

interface SearchResultsProps {
  type: SearchType
  results?: ArtistResult[] | AlbumResult[] | TrackResult[]
  isLoading: boolean
  isError: boolean
  errorMessage?: string
}

function SearchResults({
  type,
  results,
  isLoading,
  isError,
  errorMessage
}: SearchResultsProps): React.JSX.Element {
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    )
  }

  if (isError) {
    return (
      <p className="py-8 text-center text-sm text-red-500">{errorMessage ?? 'Search failed.'}</p>
    )
  }

  if (!results || results.length === 0) {
    return <p className="py-8 text-center text-sm text-neutral-500">No results.</p>
  }

  return (
    <ul className="flex w-full max-w-xl flex-col gap-2">
      {type === 'artist' &&
        (results as ArtistResult[]).map((artist) => (
          <li key={artist.id}>
            <Link
              to={`/artist/${artist.id}`}
              state={{ artist }}
              className="block rounded-lg border border-neutral-200 px-4 py-3 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
            >
              <p className="font-medium">{artist.name}</p>
              <p className="text-sm text-neutral-500">
                {[artist.type, artist.country, artist.disambiguation].filter(Boolean).join(' · ')}
              </p>
            </Link>
          </li>
        ))}

      {type === 'album' &&
        (results as AlbumResult[]).map((album) => (
          <li
            key={album.id}
            className="rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800"
          >
            <p className="font-medium">{album.title}</p>
            <p className="text-sm text-neutral-500">
              {[album.artist, album.primaryType, album.firstReleaseDate?.slice(0, 4)]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </li>
        ))}

      {type === 'track' &&
        (results as TrackResult[]).map((track) => (
          <li
            key={track.id}
            className="rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800"
          >
            <p className="font-medium">{track.title}</p>
            <p className="text-sm text-neutral-500">
              {[track.artist, formatDuration(track.length)].filter(Boolean).join(' · ')}
            </p>
          </li>
        ))}
    </ul>
  )
}

export default SearchResults
