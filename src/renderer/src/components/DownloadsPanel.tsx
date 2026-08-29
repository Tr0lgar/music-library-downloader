import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  DownloadIcon,
  type DownloadIconHandle,
  XIcon,
  type XIconHandle
} from '@animateicons/react/lucide'
import type { DownloadProgress } from '@shared/types'
import { useDownloadStore } from '../stores/downloadStore'
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
}

// Memoized because the list re-renders on every progress event of every
// track (each event replaces the store's downloads array): without this,
// one track's 10Hz progress stream re-rendered every other item too — each
// carrying several motion-animated icons — which is what made the app grind
// during large album downloads. With it, only the item whose data changed
// re-renders. Requires `onRetry` to be referentially stable (see the
// useCallback below).
const DownloadItem = memo(function DownloadItem({
  download,
  onRetry
}: DownloadItemProps): React.JSX.Element {
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
        <DownloadStatusSteps status={download.status} />
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
                <DownloadItem key={download.id} download={download} onRetry={handleRetry} />
              ))
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default DownloadsPanel
