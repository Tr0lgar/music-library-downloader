import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Skeleton, Spinner } from '@heroui/react'
import type { AlbumResult, ArtistResult } from '@shared/types'
import AlbumCover from '../components/AlbumCover'
import AlbumModal from '../components/AlbumModal'
import { artistQueryOptions } from '../queries/artist'

interface LocationState {
  artist?: ArtistResult
}

const DISCOGRAPHY_SKELETON_COUNT = 8

function ArtistPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  // Passed by SearchResults when navigating here — lets the header render
  // instantly instead of waiting on the full artist:details round trip.
  const initialArtist = (location.state as LocationState | null)?.artist

  const { data, isError } = useQuery({
    ...artistQueryOptions(id as string),
    enabled: Boolean(id)
  })

  const [selectedAlbum, setSelectedAlbum] = useState<AlbumResult | null>(null)

  const header = data ?? initialArtist

  if (!header) {
    if (isError) {
      return <p className="py-16 text-center text-sm text-red-500">Failed to load this artist.</p>
    }
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <Link to="/" className="text-sm text-neutral-500 hover:underline">
        ← Back to search
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{header.name}</h1>
        <p className="text-sm text-neutral-500">
          {[header.type, header.country, header.disambiguation].filter(Boolean).join(' · ')}
        </p>
      </div>

      {data ? (
        data.biography && (
          <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            {data.biography}
          </p>
        )
      ) : isError ? (
        <p className="text-sm text-red-500">Failed to load the biography.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-2/3 rounded" />
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-medium">Discography</h2>
        {data ? (
          data.releaseGroups.length === 0 ? (
            <p className="text-sm text-neutral-500">No albums or EPs found.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {data.releaseGroups.map((releaseGroup) => (
                <button
                  key={releaseGroup.id}
                  type="button"
                  onClick={() => setSelectedAlbum(releaseGroup)}
                  className="flex flex-col gap-2 rounded-md text-left"
                >
                  <AlbumCover releaseGroupId={releaseGroup.id} title={releaseGroup.title} />
                  <div>
                    <p className="text-sm font-medium">{releaseGroup.title}</p>
                    <p className="text-xs text-neutral-500">
                      {[releaseGroup.primaryType, releaseGroup.firstReleaseDate?.slice(0, 4)]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : isError ? (
          <p className="text-sm text-red-500">Failed to load the discography.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: DISCOGRAPHY_SKELETON_COUNT }).map((_, index) => (
              <div key={index} className="flex flex-col gap-2">
                <Skeleton className="aspect-square w-full rounded-md" />
                <Skeleton className="h-3 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            ))}
          </div>
        )}
      </div>

      <AlbumModal album={selectedAlbum} onClose={() => setSelectedAlbum(null)} />
    </div>
  )
}

export default ArtistPage
