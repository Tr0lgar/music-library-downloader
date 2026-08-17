import { useState } from 'react'

interface AlbumCoverProps {
  releaseGroupId: string
  title: string
}

const PLACEHOLDER_COLORS = [
  'bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100',
  'bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-orange-100',
  'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  'bg-lime-200 text-lime-900 dark:bg-lime-900 dark:text-lime-100',
  'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  'bg-teal-200 text-teal-900 dark:bg-teal-900 dark:text-teal-100',
  'bg-sky-200 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
  'bg-indigo-200 text-indigo-900 dark:bg-indigo-900 dark:text-indigo-100',
  'bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-purple-100',
  'bg-pink-200 text-pink-900 dark:bg-pink-900 dark:text-pink-100'
]

// Deterministic pick so the same album always gets the same placeholder color.
function colorForTitle(title: string): string {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) % PLACEHOLDER_COLORS.length
  }
  return PLACEHOLDER_COLORS[hash]
}

function coverArtUrl(releaseGroupId: string): string {
  return `https://coverartarchive.org/release-group/${releaseGroupId}/front-250`
}

/**
 * Not every release group has cover art on the Cover Art Archive. When the
 * image fails to load, this falls back to a colored tile with the album's
 * first letter instead of leaving an empty gap.
 */
function AlbumCover({ releaseGroupId, title }: AlbumCoverProps): React.JSX.Element {
  const [hasError, setHasError] = useState(false)
  const initial = title.trim().charAt(0).toUpperCase() || '?'

  if (hasError) {
    return (
      <div
        role="img"
        aria-label={title}
        className={`flex aspect-square w-full items-center justify-center rounded-md text-2xl font-semibold ${colorForTitle(title)}`}
      >
        {initial}
      </div>
    )
  }

  return (
    <img
      src={coverArtUrl(releaseGroupId)}
      alt={title}
      loading="lazy"
      className="aspect-square w-full rounded-md object-cover"
      onError={() => setHasError(true)}
    />
  )
}

export default AlbumCover
