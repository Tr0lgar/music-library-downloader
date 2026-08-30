import { useEffect } from 'react'

interface CanceledDownloadToastProps {
  title: string
  onUndo: () => void
  onDismiss: () => void
}

const AUTO_DISMISS_MS = 6000

// Bottom-of-screen confirmation after canceling a track, with a red Undo
// button for a misclick — auto-dismisses on its own after a few seconds if
// left alone, at which point the cancellation is final.
function CanceledDownloadToast({
  title,
  onUndo,
  onDismiss
}: CanceledDownloadToastProps): React.JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg bg-neutral-900 px-4 py-3 text-sm shadow-lg dark:bg-neutral-800">
      <p className="min-w-0 truncate text-neutral-100">
        Download canceled <span className="text-neutral-400">— {title}</span>
      </p>
      <button
        type="button"
        onClick={onUndo}
        className="shrink-0 rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500"
      >
        Undo
      </button>
    </div>
  )
}

export default CanceledDownloadToast
