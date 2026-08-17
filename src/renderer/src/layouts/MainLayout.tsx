import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import DownloadIcon from '../components/DownloadIcon'
import DownloadsSidebar from '../components/DownloadsSidebar'
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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <h1 className="text-lg font-semibold">Music Library Downloader</h1>
        <button
          type="button"
          onClick={() => setSidebarOpen((open) => !open)}
          aria-label="Toggle downloads panel"
          className="relative rounded-md p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          <DownloadIcon className="h-5 w-5" />
          {activeCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
              {activeCount}
            </span>
          )}
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center">
        <Outlet />
      </main>

      <DownloadsSidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} />
    </div>
  )
}

export default MainLayout
