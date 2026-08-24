import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import DownloadsPanel from '../components/DownloadsPanel'
import type { ToggleButtonState } from '../components/DownloadsToggleShape'
import { useDownloadStore } from '../stores/downloadStore'

const ACTIVE_STATUSES = new Set(['queued', 'searching', 'downloading', 'tagging'])

function MainLayout(): React.JSX.Element {
  const downloads = useDownloadStore((state) => state.downloads)
  const upsert = useDownloadStore((state) => state.upsert)

  useEffect(() => {
    return window.api.onDownloadProgress(upsert)
  }, [upsert])

  const activeCount = downloads.filter((download) => ACTIVE_STATUSES.has(download.status)).length
  const errorCount = downloads.filter((download) => download.status === 'error').length

  // Error takes priority over active — a track failing is more worth
  // surfacing than others still being in progress.
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
