import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import DownloadsSidebar from '../components/DownloadsSidebar'
import DownloadsToggleButton, { type ToggleButtonState } from '../components/DownloadsToggleButton'
import { useDownloadStore } from '../stores/downloadStore'

const ACTIVE_STATUSES = new Set(['queued', 'searching', 'downloading', 'tagging'])

function MainLayout(): React.JSX.Element {
  const [isSidebarOpen, setSidebarOpen] = useState(false)
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

      <DownloadsToggleButton
        state={toggleState}
        count={toggleCount}
        onClick={() => setSidebarOpen((open) => !open)}
      />
      <DownloadsSidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} />
    </div>
  )
}

export default MainLayout
