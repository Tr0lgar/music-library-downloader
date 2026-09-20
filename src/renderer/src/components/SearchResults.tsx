import { ChevronRight, Disc3, Music2, User } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Spinner } from '@heroui/react'
import type { AlbumResult, ArtistResult, SearchType, TrackResult } from '@shared/types'
import { formatDuration } from '../utils/format'

// Written for this app's actual (always-dark) background directly, not via
// `dark:` — that variant needs a `.dark` class or `data-theme="dark"` on the
// document, which nothing here ever sets, so `dark:`-only utilities are
// silently dead regardless of the OS's own color-scheme preference.
const RESULT_ICON_CLASS =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-400'
const RESULT_ROW_CLASS = 'flex items-center gap-3 rounded-lg border border-neutral-800 px-4 py-3'

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
              className={`${RESULT_ROW_CLASS} transition-colors hover:bg-neutral-900`}
            >
              <div className={RESULT_ICON_CLASS}>
                <User className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{artist.name}</p>
                <p className="truncate text-sm text-neutral-500">
                  {[artist.type, artist.country, artist.disambiguation].filter(Boolean).join(' · ')}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
            </Link>
          </li>
        ))}

      {type === 'album' &&
        (results as AlbumResult[]).map((album) => (
          <li key={album.id} className={RESULT_ROW_CLASS}>
            <div className={RESULT_ICON_CLASS}>
              <Disc3 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{album.title}</p>
              <p className="truncate text-sm text-neutral-500">
                {[album.artist, album.primaryType, album.firstReleaseDate?.slice(0, 4)]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </li>
        ))}

      {type === 'track' &&
        (results as TrackResult[]).map((track) => (
          <li key={track.id} className={RESULT_ROW_CLASS}>
            <div className={RESULT_ICON_CLASS}>
              <Music2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{track.title}</p>
              <p className="truncate text-sm text-neutral-500">
                {[track.artist, formatDuration(track.length)].filter(Boolean).join(' · ')}
              </p>
            </div>
          </li>
        ))}
    </ul>
  )
}

export default SearchResults
