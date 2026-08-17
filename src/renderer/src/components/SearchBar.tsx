import { useState } from 'react'
import { SearchField } from '@heroui/react'
import type { SearchType } from '@shared/types'

interface SearchBarProps {
  onSearch: (term: string, type: SearchType) => void
}

const SEARCH_TYPES: { value: SearchType; label: string }[] = [
  { value: 'artist', label: 'Artists' },
  { value: 'album', label: 'Albums' },
  { value: 'track', label: 'Tracks' }
]

function SearchBar({ onSearch }: SearchBarProps): React.JSX.Element {
  const [term, setTerm] = useState('')
  const [type, setType] = useState<SearchType>('artist')

  const submit = (value: string): void => {
    if (value.trim()) onSearch(value.trim(), type)
  }

  const handleTypeChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const nextType = event.target.value as SearchType
    setType(nextType)
    if (term.trim()) onSearch(term.trim(), nextType)
  }

  return (
    <div className="flex w-full max-w-xl gap-2">
      <SearchField value={term} onChange={setTerm} onSubmit={submit} className="flex-1">
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Search for an artist, album, or track..." />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
      <select
        className="rounded-md border border-neutral-300 bg-transparent px-3 text-sm dark:border-neutral-700"
        value={type}
        onChange={handleTypeChange}
      >
        {SEARCH_TYPES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default SearchBar
