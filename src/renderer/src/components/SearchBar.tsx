import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
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

// Hand-rolled rather than a native <select> or a component-library dropdown:
// a native select's popup in Electron on Windows is drawn by the OS itself
// (confirmed — its computed `color-scheme` was correctly `dark`, yet it
// still rendered as a light, blue-accented popup), so no CSS here can ever
// reach it. A component-library Popover didn't reproduce fixed either. This
// is plain markup and Tailwind classes with nothing else's default styles
// to fight, so every pixel of it is actually under our control.
function SearchTypeDropdown({
  type,
  onChange
}: {
  type: SearchType
  onChange: (type: SearchType) => void
}): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const selectedLabel = SEARCH_TYPES.find((option) => option.value === type)?.label

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex h-9 items-center gap-2 rounded-md border border-neutral-700 bg-transparent px-3 text-sm text-neutral-100 outline-none focus-visible:border-neutral-500"
      >
        {selectedLabel}
        <ChevronDown className="h-4 w-4 text-neutral-400" />
      </button>

      {isOpen && (
        <ul
          role="listbox"
          className="absolute top-full right-0 z-10 mt-1 w-32 rounded-md border border-neutral-700 bg-neutral-900 p-1 shadow-lg"
        >
          {SEARCH_TYPES.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === type}
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={`block w-full rounded px-3 py-1.5 text-left text-sm outline-none hover:bg-neutral-800 focus-visible:bg-neutral-800 ${
                  option.value === type ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-300'
                }`}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SearchBar({ onSearch }: SearchBarProps): React.JSX.Element {
  const [term, setTerm] = useState('')
  const [type, setType] = useState<SearchType>('artist')
  // Only artist pages exist so far — album/track search is disabled rather
  // than left to return results with nowhere to click through to.
  const isComingSoon = type !== 'artist'

  const submit = (value: string): void => {
    if (value.trim()) onSearch(value.trim(), type)
  }

  const handleTypeChange = (nextType: SearchType): void => {
    setType(nextType)
    if (nextType !== 'artist') {
      setTerm('')
      return
    }
    if (term.trim()) onSearch(term.trim(), nextType)
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-2">
      <div className="flex w-full gap-2">
        <SearchField
          value={term}
          onChange={setTerm}
          onSubmit={submit}
          isDisabled={isComingSoon}
          className="flex-1"
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search for an artist, album, or track..." />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <SearchTypeDropdown type={type} onChange={handleTypeChange} />
      </div>
      {/* Always rendered (just hidden) rather than conditional: this page
          centers its content vertically, so a message popping in and out
          changed the block's total height and visibly nudged the search
          bar itself up/down. Reserving the line always keeps that height
          constant. */}
      <p
        aria-hidden={!isComingSoon}
        className={`text-sm text-neutral-500 ${isComingSoon ? '' : 'invisible'}`}
      >
        {isComingSoon ? `Searching by ${type} is coming soon — try Artists for now.` : ' '}
      </p>
    </div>
  )
}

export default SearchBar
