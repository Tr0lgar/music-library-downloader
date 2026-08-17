import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ArtistResult, SearchType } from '@shared/types'
import SearchBar from '../components/SearchBar'
import SearchResults from '../components/SearchResults'
import { artistQueryOptions } from '../queries/artist'

interface Query {
  term: string
  type: SearchType
}

function SearchPage(): React.JSX.Element {
  const [query, setQuery] = useState<Query | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['search', query?.term, query?.type],
    queryFn: () => window.api.search(query!.term, query!.type),
    enabled: query !== null
  })

  // Prefetch: speculatively warm the cache for the top artist result so clicking it
  // feels instant. This costs one extra throttled MusicBrainz request per
  // search, even if the user ends up clicking a different result (or none).
  useEffect(() => {
    if (query?.type !== 'artist' || !data || data.length === 0) return
    const topResult = (data as ArtistResult[])[0]
    queryClient.prefetchQuery(artistQueryOptions(topResult.id))
  }, [data, query, queryClient])

  return (
    <div className="flex w-full flex-col items-center gap-6 px-6 py-10">
      <SearchBar onSearch={(term, type) => setQuery({ term, type })} />
      {query && (
        <SearchResults
          type={query.type}
          results={data}
          isLoading={isLoading}
          isError={isError}
          errorMessage={error instanceof Error ? error.message : undefined}
        />
      )}
    </div>
  )
}

export default SearchPage
