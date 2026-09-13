import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import DownloadsPanel from '../components/DownloadsPanel'
import type { ToggleButtonState } from '../components/DownloadsToggleShape'
import { useDownloadStore } from '../stores/downloadStore'

const ACTIVE_STATUSES = new Set(['queued', 'searching', 'downloading', 'tagging'])

function MainLayout(): React.JSX.Element {
  const upsert = useDownloadStore((state) => state.upsert)

  useEffect(() => {
    return window.api.onDownloadProgress(upsert)
  }, [upsert])

  // Primitive selectors, not the downloads array itself: this wraps the
  // whole app via <Outlet />, and selecting the array re-rendered
  // everything on every progress event.
  const activeCount = useDownloadStore((state) =>
    state.downloads.reduce(
      (total, download) => total + (ACTIVE_STATUSES.has(download.status) ? 1 : 0),
      0
    )
  )
  const errorCount = useDownloadStore((state) =>
    state.downloads.reduce((total, download) => total + (download.status === 'error' ? 1 : 0), 0)
  )

  const toggleState: ToggleButtonState =
    errorCount > 0 ? 'error' : activeCount > 0 ? 'active' : 'idle'
  const toggleCount = toggleState === 'error' ? errorCount : activeCount

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center px-6 py-4">
        <h1 className="text-lg font-semibold">Music Library Downloader</h1>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center">
        <Outlet />
      </main>

      <DownloadsPanel state={toggleState} count={toggleCount} />
    </div>
  )
}

export default MainLayout
