import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  DownloadIcon,
  type DownloadIconHandle,
  TrashIcon,
  type TrashIconHandle,
  XIcon,
  type XIconHandle
} from '@animateicons/react/lucide'
import type { DownloadProgress } from '@shared/types'
import { useDownloadStore } from '../stores/downloadStore'
import { coverArtUrl } from '../utils/coverArt'
import CanceledDownloadToast from './CanceledDownloadToast'
import DownloadStatusSteps from './DownloadStatusSteps'
import RetryIcon from './RetryIcon'
import WaveProgressBar from './WaveProgressBar'
import DownloadsToggleShape, { type ToggleButtonState } from './DownloadsToggleShape'

interface DownloadsPanelProps {
  state: ToggleButtonState
  count: number
}

interface DownloadItemProps {
  download: DownloadProgress
  releaseGroupId: string | undefined
  onRetry: (id: string) => void
  // Split from onExitComplete: cancellation must fire on its own timer, not
  // wait on the exit animation below, since requestAnimationFrame pauses
  // when the window loses focus or is minimized.
  onCancelStart: (id: string) => void
  onExitComplete: (id: string, title: string) => void
}

const TRASH_ANIMATION_MS = 900
const EXIT_TRANSITION_MS = 300

type ExitPhase = 'idle' | 'fading' | 'collapsing'

// Memoized: the list re-renders on every progress event, which without this
// re-rendered every item (and its motion-animated icons) tens of times per
// second during a download. Requires the on*/onExitComplete props to stay
// referentially stable (see the useCallback calls below).
const DownloadItem = memo(function DownloadItem({
  download,
  releaseGroupId,
  onRetry,
  onCancelStart,
  onExitComplete
}: DownloadItemProps): React.JSX.Element {
  const trashRef = useRef<TrashIconHandle>(null)
  const itemRef = useRef<HTMLDivElement>(null)
  const [exitPhase, setExitPhase] = useState<ExitPhase>('idle')
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null)
  const [coverFailed, setCoverFailed] = useState(false)
  const [coverLoaded, setCoverLoaded] = useState(false)
  const showCoverImg = releaseGroupId !== undefined && !coverFailed
  // Gated on onLoad rather than just showCoverImg: a stalled response can
  // fail silently without ever firing onError, which left the tint showing
  // over nothing.
  const showCoverTint = showCoverImg && coverLoaded

  const [hasEntered, setHasEntered] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setHasEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const handleCancelClick = (): void => {
    if (exitPhase !== 'idle') return
    trashRef.current?.startAnimation()

    setTimeout(() => {
      onCancelStart(download.id)
      setExitPhase('fading')

      setTimeout(() => {
        // Height can't transition from `auto`, so it's measured and set
        // explicitly first, then flipped to 0 after a double rAF — one
        // frame isn't reliably late enough for that explicit height to have
        // actually painted yet.
        const height = itemRef.current?.getBoundingClientRect().height ?? 0
        setCollapsedHeight(height)

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setExitPhase('collapsing')
            setTimeout(() => onExitComplete(download.id, download.title), EXIT_TRANSITION_MS)
          })
        })
      }, EXIT_TRANSITION_MS)
    }, TRASH_ANIMATION_MS)
  }

  const isCollapsing = exitPhase === 'collapsing'

  // Tailwind v4's translate-* utilities animate the standalone `translate`
  // property, not `transform` — the transition list below has to say
  // `translate`, not `transform`, or this silently doesn't animate.
  const translateClass = hasEntered ? 'translate-y-0' : '-translate-y-1'
  const opacityClass = exitPhase !== 'idle' ? 'opacity-0' : hasEntered ? 'opacity-100' : 'opacity-0'

  return (
    <div
      ref={itemRef}
      style={
        collapsedHeight !== null
          ? {
              height: isCollapsing ? 0 : collapsedHeight,
              borderWidth: isCollapsing ? 0 : undefined
            }
          : undefined
      }
      // shrink-0: the list is a flex container (for gap-2), which makes
      // every card a flex item that shrinks to fit by default otherwise.
      className={`relative shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-white transition-[translate,opacity,height,border-width] duration-300 ease-in-out dark:border-neutral-800 dark:bg-neutral-950 ${translateClass} ${opacityClass}`}
    >
      {/* No padding on the outer box: base.css resets margin unlayered,
          which beats Tailwind's margin utilities regardless of specificity,
          so each row below carries its own horizontal padding instead. */}
      <div className="flex flex-col gap-1 pb-3">
        <div className="relative overflow-hidden px-4 pt-3 pb-2">
          {showCoverImg && (
            <img
              src={coverArtUrl(releaseGroupId)}
              alt=""
              loading="lazy"
              onLoad={() => setCoverLoaded(true)}
              onError={() => setCoverFailed(true)}
              className="absolute inset-0 h-full w-full scale-110 object-cover object-top blur-md"
            />
          )}
          {showCoverTint && <div className="absolute inset-0 bg-black/50" />}

          <div className="relative">
            <p
              className={`truncate text-sm font-bold ${showCoverTint ? 'text-white' : 'text-neutral-900 dark:text-neutral-100'}`}
            >
              {download.title}
            </p>
            <p
              className={`truncate text-xs ${showCoverTint ? 'text-neutral-300' : 'text-neutral-500'}`}
            >
              {download.artist} - {download.album}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4">
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

        {download.status === 'error' ? (
          <div className="flex items-center justify-between gap-2 px-4">
            <p className="text-xs font-medium text-red-600 dark:text-red-400">
              ✗ ERROR — {download.error}
            </p>
            <button
              type="button"
              onClick={() => onRetry(download.id)}
              aria-label={`Retry ${download.title}`}
              className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              <RetryIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 px-4">
            <DownloadStatusSteps status={download.status} />
            {download.status !== 'done' && (
              <button
                type="button"
                onClick={handleCancelClick}
                disabled={exitPhase !== 'idle'}
                aria-label={`Cancel ${download.title}`}
                className="shrink-0 rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <TrashIcon ref={trashRef} size={14} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

// Matches the `delay-500` on the expanded-content layer below, so the close
// icon's draw-in starts once that layer is actually visible.
const CLOSE_ICON_REVEAL_DELAY_MS = 500

function DownloadsPanel({ state, count }: DownloadsPanelProps): React.JSX.Element {
  const [isOpen, setOpen] = useState(false)
  const downloads = useDownloadStore((s) => s.downloads)
  const downloadIconRef = useRef<DownloadIconHandle>(null)
  const closeIconRef = useRef<XIconHandle>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [canceledToast, setCanceledToast] = useState<{ id: string; title: string } | null>(null)

  const [showBottomFade, setShowBottomFade] = useState(false)
  const updateBottomFade = useCallback(() => {
    const el = listRef.current
    if (!el) return
    setShowBottomFade(el.scrollHeight - el.scrollTop - el.clientHeight > 1)
  }, [])
  useEffect(() => {
    updateBottomFade()
  }, [downloads, updateBottomFade])

  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(
      () => closeIconRef.current?.startAnimation(),
      CLOSE_ICON_REVEAL_DELAY_MS
    )
    return () => clearTimeout(timer)
  }, [isOpen])

  // Reads `requests` via getState rather than subscribing, so this stays
  // referentially stable and doesn't break DownloadItem's memo.
  const handleRetry = useCallback((id: string): void => {
    const request = useDownloadStore.getState().requests[id]
    if (request) void window.api.startDownloads([request])
  }, [])

  const handleCancelStart = useCallback((id: string): void => {
    void window.api.cancelDownload(id)
  }, [])

  const handleExitComplete = useCallback((id: string, title: string): void => {
    useDownloadStore.getState().remove(id)
    setCanceledToast({ id, title })
  }, [])

  const handleUndoCancel = (): void => {
    if (!canceledToast) return
    const request = useDownloadStore.getState().requests[canceledToast.id]
    if (request) void window.api.startDownloads([request])
    setCanceledToast(null)
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        role={isOpen ? 'dialog' : 'button'}
        aria-label={isOpen ? 'Downloads panel' : 'Open downloads panel'}
        tabIndex={isOpen ? -1 : 0}
        onClick={isOpen ? undefined : () => setOpen(true)}
        onKeyDown={
          isOpen
            ? undefined
            : (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setOpen(true)
                }
              }
        }
        onMouseEnter={() => downloadIconRef.current?.startAnimation()}
        onMouseLeave={() => downloadIconRef.current?.stopAnimation()}
        data-open={isOpen}
        className={`downloads-panel fixed top-4 right-4 z-40 flex flex-col overflow-hidden rounded-[28px] shadow-md ${
          isOpen
            ? 'h-[calc(100vh_-_32px)] w-80 bg-neutral-100 dark:bg-neutral-900'
            : 'h-14 w-14 cursor-pointer bg-transparent'
        }`}
      >
        <div
          className={`absolute top-0 right-0 flex h-14 w-14 items-center justify-center transition-opacity duration-100 ${
            isOpen ? 'pointer-events-none opacity-0' : 'opacity-100 delay-500'
          }`}
        >
          <DownloadsToggleShape state={state} />
          <DownloadIcon
            ref={downloadIconRef}
            size={20}
            className={`relative z-10 transition-colors duration-500 ${state === 'error' ? 'text-red-700' : 'text-black'}`}
          />
        </div>

        {/* Rendered as a fixed sibling, not nested in the box above: it
            deliberately overhangs the button's edge, which the panel's own
            overflow-hidden would otherwise clip. */}
        {!isOpen && count > 0 && (
          <span className="pointer-events-none fixed top-3 right-3 z-50 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
            {count}
          </span>
        )}

        <div
          className={`absolute inset-0 flex flex-col transition-opacity duration-100 ${
            isOpen ? 'opacity-100 delay-500' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="flex h-14 items-center border-b border-neutral-200 pl-4 dark:border-neutral-800">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Downloads
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              closeIconRef.current?.startAnimation()
              setOpen(false)
            }}
            aria-label="Close downloads panel"
            className="absolute top-0 right-0 flex h-14 w-14 items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            <XIcon ref={closeIconRef} size={20} />
          </button>

          {/* min-h-0: a flex-1 child defaults to min-height: auto, which
              would let it grow past the available space instead of
              scrolling. */}
          <div className="relative min-h-0 flex-1">
            <div
              ref={listRef}
              onScroll={updateBottomFade}
              className="flex h-full flex-col gap-2 overflow-y-auto p-2"
            >
              {downloads.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-neutral-500">No downloads yet.</p>
              ) : (
                downloads.map((download) => (
                  <DownloadItem
                    key={download.id}
                    download={download}
                    releaseGroupId={
                      useDownloadStore.getState().requests[download.id]?.releaseGroupId
                    }
                    onRetry={handleRetry}
                    onCancelStart={handleCancelStart}
                    onExitComplete={handleExitComplete}
                  />
                ))
              )}
            </div>

            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-neutral-100 to-transparent transition-opacity duration-200 ease-in-out dark:from-neutral-900 ${
                showBottomFade ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </div>
        </div>
      </div>

      {canceledToast && (
        <CanceledDownloadToast
          title={canceledToast.title}
          onUndo={handleUndoCancel}
          onDismiss={() => setCanceledToast(null)}
        />
      )}
    </>
  )
}

export default DownloadsPanel
