import { useState } from 'react'

interface FirstLaunchSetupProps {
  defaultDownloadDirectory: string
  onComplete: () => void
}

// crude but sufficient — the real validation (and the source of truth) is
// the zod schema on the main-process side; this just avoids a round trip
// for an obviously-empty or malformed value.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function FirstLaunchSetup({
  defaultDownloadDirectory,
  onComplete
}: FirstLaunchSetupProps): React.JSX.Element {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [downloadDirectory, setDownloadDirectory] = useState(defaultDownloadDirectory)
  // Only set once the user actually picks something — if they never touch
  // this, nothing is written for it and the app keeps following its own
  // default even if that default (the OS "Music" folder) later moves.
  const [directoryOverride, setDirectoryOverride] = useState<string | null>(null)

  const handleBrowse = async (): Promise<void> => {
    const picked = await window.api.chooseDownloadDirectory()
    if (picked) {
      setDirectoryOverride(picked)
      setDownloadDirectory(picked)
    }
  }

  const handleResetDirectory = (): void => {
    setDirectoryOverride(null)
    setDownloadDirectory(defaultDownloadDirectory)
  }

  const handleSubmit = (event: React.FormEvent): void => {
    event.preventDefault()
    const trimmed = email.trim()
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError('Please enter a valid email address.')
      return
    }

    setError(null)
    setIsSubmitting(true)
    void Promise.all([
      window.api.setMusicbrainzEmail(trimmed),
      directoryOverride !== null ? window.api.setDownloadDirectory(directoryOverride) : undefined
    ])
      .then(onComplete)
      .catch(() => {
        setError('Something went wrong saving this — please try again.')
        setIsSubmitting(false)
      })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-6">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex w-full max-w-md flex-col gap-5 rounded-lg border border-neutral-800 bg-neutral-900 p-6"
      >
        <div>
          <h1 className="text-lg font-semibold text-neutral-100">One-time setup</h1>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="mb-email" className="text-sm font-medium text-neutral-200">
            Email address
          </label>
          <p className="text-sm text-neutral-400">
            This app looks up music through the MusicBrainz API, which asks every application to
            identify itself with a contact email. Without one, requests get rate-limited much more
            aggressively — searches would be slow or fail outright.
          </p>
          <input
            id="mb-email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="mt-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus-visible:border-neutral-500"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <p className="text-xs text-neutral-500">
            This stays on your computer and is sent only to MusicBrainz, as standard API etiquette —
            never collected or stored anywhere else, by this app or by anyone.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-neutral-200">Download location</span>
          <p className="text-sm text-neutral-400">Where downloaded tracks are saved.</p>
          <div className="mt-1 flex gap-2">
            <p className="min-w-0 flex-1 truncate rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-300">
              {downloadDirectory}
            </p>
            <button
              type="button"
              onClick={() => void handleBrowse()}
              className="shrink-0 rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-100 outline-none hover:bg-neutral-800 focus-visible:border-neutral-500"
            >
              Browse…
            </button>
          </div>
          {directoryOverride !== null && (
            <button
              type="button"
              onClick={handleResetDirectory}
              className="self-start text-xs text-neutral-500 underline-offset-2 outline-none hover:text-neutral-300 hover:underline"
            >
              Reset to default
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 outline-none hover:bg-white disabled:opacity-50"
        >
          {isSubmitting ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}

export default FirstLaunchSetup
