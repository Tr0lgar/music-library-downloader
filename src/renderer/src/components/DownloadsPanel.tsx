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
  onRetry: (id: string) => void
  // Split in two rather than one onCancel: the actual cancellation (killing
  // the process) must fire on its own reliable timer, not be at the mercy of
  // the exit animation below — which leans on requestAnimationFrame, and
  // rAF pauses whenever the window is minimized or unfocused. If the user
  // cancels and immediately alt-tabs away, the download still needs to stop.
  onCancelStart: (id: string) => void
  onExitComplete: (id: string, title: string) => void
}

// Matches the trash icon's own ~900ms (0.9 * default duration) animation —
// the exit sequence below only starts once that's had time to play, not the
// instant it's clicked.
const TRASH_ANIMATION_MS = 900

// The exit itself is two back-to-back CSS transitions on the item's own
// box, timed sequentially rather than together: fading and collapsing at
// once reads as the row just shrinking away, not as leaving the list. Both
// share this one duration so a single `duration-300` class covers them.
const EXIT_TRANSITION_MS = 300

type ExitPhase = 'idle' | 'fading' | 'collapsing'

// Memoized because the list re-renders on every progress event of every
// track (each event replaces the store's downloads array): without this,
// one track's 10Hz progress stream re-rendered every other item too — each
// carrying several motion-animated icons — which is what made the app grind
// during large album downloads. With it, only the item whose data changed
// re-renders. Requires `onRetry`/`onCancelStart`/`onExitComplete` to be
// referentially stable (see the useCallback below).
const DownloadItem = memo(function DownloadItem({
  download,
  onRetry,
  onCancelStart,
  onExitComplete
}: DownloadItemProps): React.JSX.Element {
  const trashRef = useRef<TrashIconHandle>(null)
  const itemRef = useRef<HTMLDivElement>(null)
  const [exitPhase, setExitPhase] = useState<ExitPhase>('idle')
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null)

  // A light fade/rise-in on mount — undoing a cancel re-adds the track as a
  // brand new item, and it read as an abrupt pop-in without this.
  const [hasEntered, setHasEntered] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setHasEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const handleCancelClick = (): void => {
    if (exitPhase !== 'idle') return
    trashRef.current?.startAnimation()

    setTimeout(() => {
      // The real cancellation fires here, once — not chained behind any of
      // the rAF-gated animation steps below, so it isn't affected by
      // whether those actually get to run.
      onCancelStart(download.id)

      // Phase 1: fade the row out — it still occupies its normal spot in
      // the list while this plays.
      setExitPhase('fading')

      setTimeout(() => {
        // Phase 2: collapse the now-invisible row's own height (plus its
        // padding/border) down to 0, which is what makes the item below
        // slide up — that's ordinary layout reflow, not an animation on the
        // sibling itself. Height can't transition from `auto`, so the
        // current rendered height is measured and set explicitly first...
        const height = itemRef.current?.getBoundingClientRect().height ?? 0
        setCollapsedHeight(height)

        // ...then, only once the browser has actually painted that explicit
        // (but numerically unchanged) height, is it flipped to 0 — a single
        // rAF isn't reliably late enough for the paint to have landed.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setExitPhase('collapsing')
            setTimeout(
              () => onExitComplete(download.id, download.title),
              EXIT_TRANSITION_MS
            )
          })
        })
      }, EXIT_TRANSITION_MS)
    }, TRASH_ANIMATION_MS)
  }

  const isCollapsing = exitPhase === 'collapsing'

  // The exit is a plain fade (no horizontal slide) into the collapse below;
  // `translate` only ever moves for the entrance's slight rise-in. Tailwind
  // v4's translate-* utilities animate the standalone CSS `translate`
  // property, not `transform` — listing `transform` here (an easy mistake,
  // since that's still the property older Tailwind versions used) silently
  // transitioned nothing, so the utility's value just snapped instead of
  // easing.
  const translateClass = hasEntered ? 'translate-y-0' : '-translate-y-1'
  const opacityClass = exitPhase !== 'idle' ? 'opacity-0' : hasEntered ? 'opacity-100' : 'opacity-0'

  return (
    <div
      ref={itemRef}
      style={
        collapsedHeight !== null
          ? {
              height: isCollapsing ? 0 : collapsedHeight,
              paddingTop: isCollapsing ? 0 : undefined,
              paddingBottom: isCollapsing ? 0 : undefined,
              borderWidth: isCollapsing ? 0 : undefined
            }
          : undefined
      }
      className={`flex flex-col gap-1 overflow-hidden border-b border-neutral-200 px-4 py-3 transition-[translate,opacity,height,padding,border-width] duration-300 ease-in-out dark:border-neutral-800 ${translateClass} ${opacityClass}`}
    >
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

      {download.status === 'error' ? (
        <div className="flex items-center justify-between gap-2">
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
        <div className="flex items-center justify-between gap-2">
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
  )
})

// Must match the `delay-500` on the expanded-content layer below: the close
// icon's own draw-in flourish is timed to start right as that layer becomes
// visible, not the instant the button is pressed — playing it while the
// panel is still mid-resize (or while the icon itself is still invisible)
// would read as janky rather than smooth.
const CLOSE_ICON_REVEAL_DELAY_MS = 500

// Floating toggle button and downloads sidebar, unified into a single
// element: opening doesn't slide a separate panel in from the screen edge,
// it grows the button itself out into the sidebar (and shrinks it back on
// close). The two states' contents are cross-faded on top of that box-morph
// rather than mounted/unmounted, so nothing pops or jumps mid-animation.
function DownloadsPanel({ state, count }: DownloadsPanelProps): React.JSX.Element {
  const [isOpen, setOpen] = useState(false)
  const downloads = useDownloadStore((s) => s.downloads)
  const downloadIconRef = useRef<DownloadIconHandle>(null)
  const closeIconRef = useRef<XIconHandle>(null)
  // Only the most recently canceled track — a second cancel while this is
  // still showing replaces it rather than queueing a second toast.
  const [canceledToast, setCanceledToast] = useState<{ id: string; title: string } | null>(null)

  // Timed rather than fired straight from the open click: the icon and its
  // library-provided animation don't know about the panel's own resize
  // timeline, so this effect is what keeps the two in sync.
  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(
      () => closeIconRef.current?.startAnimation(),
      CLOSE_ICON_REVEAL_DELAY_MS
    )
    return () => clearTimeout(timer)
  }, [isOpen])

  // Referentially stable (and reads `requests` at call time via getState
  // instead of subscribing) so it never breaks DownloadItem's memo — an
  // inline closure here would hand every item a fresh prop on each render,
  // making the memo useless.
  const handleRetry = useCallback((id: string): void => {
    const request = useDownloadStore.getState().requests[id]
    if (request) void window.api.startDownloads([request])
  }, [])

  // Fired the moment the trash icon's own animation finishes — kills the
  // process and cleans up on the main-process side. Deliberately not tied
  // to the item's own exit animation (see DownloadItem): that part can
  // stall if the window is minimized or loses focus, but the cancellation
  // itself shouldn't wait around for it.
  const handleCancelStart = useCallback((id: string): void => {
    void window.api.cancelDownload(id)
  }, [])

  // Fired once the item has actually finished animating out. The cached
  // request (untouched by remove()) is what lets the toast's Undo button
  // re-queue the exact same download rather than needing to rebuild it.
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
        // Triggered here (the whole button) rather than relying on the
        // icon's own built-in hover, so it plays when the cursor is
        // anywhere over the button — not just over the icon's small glyph.
        onMouseEnter={() => downloadIconRef.current?.startAnimation()}
        onMouseLeave={() => downloadIconRef.current?.stopAnimation()}
        data-open={isOpen}
        className={`downloads-panel fixed top-4 right-4 z-40 flex flex-col rounded-[28px] shadow-md ${
          isOpen
            ? 'h-[calc(100vh_-_32px)] w-80 bg-white dark:bg-neutral-950'
            : 'h-14 w-14 cursor-pointer bg-transparent'
        }`}
      >
        {/* Collapsed content: the status shape, icon and badge — pinned to a
            fixed 56x56 box in the panel's own top-right corner (not
            `inset-0`) so it never stretches as the panel grows underneath
            it. It hands off to the panel's own background within the first
            100ms (see .downloads-panel's background-color timing in
            main.css, kept in sync with this), then stays hidden through
            the entire resize so nothing but the box shape itself is ever
            seen moving. */}
        <div
          className={`absolute top-0 right-0 flex h-14 w-14 items-center justify-center transition-opacity duration-100 ${
            isOpen ? 'pointer-events-none opacity-0' : 'opacity-100 delay-500'
          }`}
        >
          <DownloadsToggleShape state={state} />

          {/* Centered via the parent's own flexbox, not `m-auto` — this
              project's base.css resets `margin` on every element with an
              unlayered `*` rule, which silently beats Tailwind's margin
              utilities regardless of specificity (unlayered CSS always wins
              over `@layer`-wrapped rules). Flexbox alignment doesn't go
              through margin at all, so it isn't affected by that. */}
          <DownloadIcon
            ref={downloadIconRef}
            size={20}
            className={`relative z-10 transition-colors duration-500 ${state === 'error' ? 'text-red-700' : 'text-black'}`}
          />

          {count > 0 && (
            <span className="absolute -top-1 -right-1 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">
              {count}
            </span>
          )}
        </div>

        {/* Expanded content: the sidebar header and list. Only starts
            appearing once the resize has fully finished (matches the
            100ms handoff + 400ms resize below), and on close it's the
            very first thing to go — so the resize itself is always a
            plain, content-free box changing size, never anything fading
            through it. */}
        <div
          className={`absolute inset-0 flex flex-col transition-opacity duration-100 ${
            isOpen ? 'opacity-100 delay-500' : 'pointer-events-none opacity-0'
          }`}
        >
          {/* Header is pinned to the same 56x56 row height as the collapsed
              icon box, and the close button sits at `top-0 right-0` of
              this layer — which spans the whole panel — landing it at
              exactly the same coordinates as the download icon above. */}
          <div className="flex h-14 items-center border-b border-neutral-200 pl-4 dark:border-neutral-800">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Downloads
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              // Played here rather than waited on: the panel starts
              // shrinking almost immediately (see the timing note in
              // main.css), so there's no later moment left to time this
              // against the way there is on open.
              closeIconRef.current?.startAnimation()
              setOpen(false)
            }}
            aria-label="Close downloads panel"
            className="absolute top-0 right-0 flex h-14 w-14 items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            <XIcon ref={closeIconRef} size={20} />
          </button>

          <div className="flex-1 overflow-y-auto">
            {downloads.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-neutral-500">No downloads yet.</p>
            ) : (
              downloads.map((download) => (
                <DownloadItem
                  key={download.id}
                  download={download}
                  onRetry={handleRetry}
                  onCancelStart={handleCancelStart}
                  onExitComplete={handleExitComplete}
                />
              ))
            )}
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
