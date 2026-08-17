import type { DownloadProgress, DownloadStatus } from '@shared/types'
import { useDownloadStore } from '../stores/downloadStore'
import RetryIcon from './RetryIcon'
import WaveProgressBar from './WaveProgressBar'

interface DownloadsSidebarProps {
  isOpen: boolean
  onClose: () => void
}

const STATUS_LABELS: Record<DownloadStatus, string> = {
  queued: 'Queued',
  searching: 'Searching…',
  downloading: 'Downloading…',
  tagging: 'Tagging…',
  done: '✓ FINISH',
  error: '✗ ERROR'
}

const STATUS_TEXT_CLASS: Record<DownloadStatus, string> = {
  queued: 'text-neutral-500',
  searching: 'text-blue-600 dark:text-blue-400',
  downloading: 'text-blue-600 dark:text-blue-400',
  tagging: 'text-blue-600 dark:text-blue-400',
  done: 'text-green-600 dark:text-green-400',
  error: 'text-red-600 dark:text-red-400'
}

interface DownloadItemProps {
  download: DownloadProgress
  onRetry: (id: string) => void
}

function DownloadItem({ download, onRetry }: DownloadItemProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <p className="truncate text-sm font-bold text-neutral-900 dark:text-neutral-100">
        {download.title}
      </p>
      <p className="truncate text-xs text-neutral-500">
        {download.artist} - {download.album}
      </p>

      <div className="flex items-center gap-2">
        <WaveProgressBar
          progress={download.progress}
          status={download.status}
          label={`${download.title} progress`}
          className="flex-1"
        />
        <span className="w-10 shrink-0 text-right text-xs text-neutral-500">
          {Math.round(download.progress)}%
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className={`text-xs font-medium ${STATUS_TEXT_CLASS[download.status]}`}>
          {download.error
            ? `${STATUS_LABELS[download.status]} — ${download.error}`
            : STATUS_LABELS[download.status]}
        </p>
        {download.status === 'error' && (
          <button
            type="button"
            onClick={() => onRetry(download.id)}
            aria-label={`Retry ${download.title}`}
            className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <RetryIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function DownloadsSidebar({ isOpen, onClose }: DownloadsSidebarProps): React.JSX.Element {
  // Order is whatever the store has — fixed at insertion time, never
  // reshuffled by status (see downloadStore's upsert).
  const downloads = useDownloadStore((state) => state.downloads)
  const requests = useDownloadStore((state) => state.requests)

  const handleRetry = (id: string): void => {
    const request = requests[id]
    if (request) void window.api.startDownloads([request])
  }

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/20" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`fixed top-0 right-0 z-40 flex h-full w-80 flex-col border-l border-neutral-200 bg-white transition-transform duration-200 dark:border-neutral-800 dark:bg-neutral-950 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 className="text-sm font-semibold">Downloads</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close downloads panel"
            className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {downloads.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-500">No downloads yet.</p>
          ) : (
            downloads.map((download) => (
              <DownloadItem key={download.id} download={download} onRetry={handleRetry} />
            ))
          )}
        </div>
      </aside>
    </>
  )
}

export default DownloadsSidebar
