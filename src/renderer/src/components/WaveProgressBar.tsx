import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DownloadStatus } from '@shared/types'

interface WaveProgressBarProps {
  /** Download progress, 0-100. */
  progress: number
  status: DownloadStatus
  label: string
  className?: string
}

/**
 * Progress bar in the style of One UI 8.5's media player seek bar.
 *
 * Three stacked layers inside one <svg>:
 *   1. the swell — shapes whose top edge undulates *above* the rail, drawn
 *      only over the portion already downloaded;
 *   2. the rail — full-width rounded bar, neutral and faint;
 *   3. the fill — same bar, status-coloured, clipped at the current position.
 *
 * The swell is repainted at 60fps by writing the paths' `d` attribute
 * directly, so the animation never triggers a React render. Unlike the media
 * player there's no seek thumb and no dragging: progress here isn't something
 * the user can move.
 */

const ACTIVE_STATUSES: DownloadStatus[] = ['searching', 'downloading', 'tagging']

// Tuned against the sidebar's ~230px-wide bar: a longer wavelength there
// fits barely one crest, which reads as a single blob rather than a wave.
const THICKNESS = 6 // rail height, px
const AMPLITUDE = 11 // max crest height above the rail, px
const WAVELENGTH = 118 // px per period of the dominant swell
const SPEED = 26 // px/s the swell drifts sideways
const SAMPLE_STEP = 2 // px between samples along a path: fine enough to read as smooth
const SETTLE_RATE = 7 // exponential smoothing factor — roughly a 0.15s transition
const MAX_FRAME_SECONDS = 1 / 20 // clamp dt so a stalled window doesn't jump the phase
const MAX_EDGE_FADE = 22 // px over which the crest ramps in/out at each end

// Shared by the fill and the main wave so the two can't drift apart: give
// them different opacities and the seam between them becomes visible, which
// defeats the point of the wave growing out of the bar. They still composite
// over different backdrops (page behind the wave, rail behind the fill), but
// at 95% that leaves about one level per channel — well below noticeable.
const FILL_OPACITY = 0.95

const HEIGHT = AMPLITUDE + THICKNESS + 2 // +2 keeps a pixel of headroom top and bottom
const BAR_TOP = HEIGHT - 1 - THICKNESS

interface WaveLayer {
  ampScale: number
  lengthScale: number
  speedScale: number
  startPhase: number
  color: string
  opacity: number
}

// Two overlapping waves: a big one carrying the bar's own colour, and a
// smaller darker one over it. The scale ratios are deliberately non-harmonic
// so the layers never fall back into sync — that drift is what makes them
// read as two independent waves instead of one thick line.
//
// Both are filled from the rail upwards, so their amplitudes have to stay
// close: drop the second much below the first and it spends all its time
// hidden underneath, leaving only a single silhouette. Keeping them near
// each other lets the shorter one poke through wherever the taller one
// troughs, and the translucent overlap is what darkens the shared area.
// startPhase offsets them so they don't begin the first second in lockstep.
//
// The main wave is only just translucent — enough to soften it, not enough
// to read as a different colour from the bar it grows out of.
const LAYERS: WaveLayer[] = [
  {
    ampScale: 1,
    lengthScale: 1,
    speedScale: 1,
    startPhase: 0,
    color: 'var(--wave-strong)',
    opacity: FILL_OPACITY
  },
  {
    ampScale: 0.85,
    lengthScale: 0.62,
    speedScale: 0.55,
    startPhase: 2.1,
    color: 'var(--wave-soft)',
    opacity: 0.45
  }
]

const STATUS_FILL_CLASS: Record<DownloadStatus, string> = {
  queued: 'fill-neutral-400 dark:fill-neutral-600',
  searching: 'fill-sky-500 dark:fill-sky-400',
  downloading: 'fill-sky-500 dark:fill-sky-400',
  tagging: 'fill-sky-500 dark:fill-sky-400',
  done: 'fill-green-500 dark:fill-green-400',
  error: 'fill-red-500 dark:fill-red-400'
}

const TAU = Math.PI * 2
const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)
/** smoothstep — avoids visible corners where the crest ramps in and out. */
const smoothstep = (n: number): number => n * n * (3 - 2 * n)

/**
 * Sum of three decorrelated sinusoids: a single sine looks mechanical, three
 * give a swell that never visibly repeats. Roughly bounded to [-1, 1].
 *
 * The fundamental carries most of the weight — the harmonics are there to
 * break the repetition, and giving them much more turns the swell choppy
 * rather than interesting.
 */
function swell(t: number, k: number, phase: number): number {
  return (
    0.74 * Math.sin(t * k + phase) +
    0.14 * Math.sin(t * k * 1.87 - phase * 0.7 + 1.1) +
    0.12 * Math.sin(t * k * 0.53 + phase * 0.42 + 2.3)
  )
}

function buildWavePath(layer: WaveLayer, head: number, amp: number, phase: number): string {
  const k = TAU / (WAVELENGTH * layer.lengthScale)
  const peak = amp * layer.ampScale
  // The crest ramps down to nothing at both ends so the wave merges back into
  // the rail instead of being sliced off mid-swell.
  const fade = Math.min(MAX_EDGE_FADE, head / 2)

  // Closed along the rail's top edge rather than its bottom: dropping the
  // path down the full thickness gave it square corners that spilled past
  // the fill rect's rounded ends, squaring off the whole bar. The ramp
  // already brings the crest to zero at x=0 and x=head, so this closes flush
  // with no visible seam.
  let d = `M 0 ${BAR_TOP}`
  for (let x = 0; x <= head; x += SAMPLE_STEP) {
    const ramp = smoothstep(Math.min(1, x / fade) * Math.min(1, (head - x) / fade))
    // (0.55 + 0.45·swell) stays within [0.1, 1], so the crest never dips below
    // the rail's top edge — the wave always sits on top of the bar.
    const crest = peak * ramp * (0.55 + 0.45 * swell(x, k, phase))
    d += ` L ${x.toFixed(2)} ${(BAR_TOP - crest).toFixed(2)}`
  }
  d += ` L ${head.toFixed(2)} ${BAR_TOP} Z`
  return d
}

function WaveProgressBar({
  progress,
  status,
  label,
  className = ''
}: WaveProgressBarProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<SVGRectElement>(null)
  const waveRefs = useRef<(SVGPathElement | null)[]>([])

  const [width, setWidth] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)

  // Animation state lives in refs so it survives the effect being re-run on
  // every progress update — otherwise the swell would restart from flat each
  // time a percentage ticks in.
  const ampRef = useRef(0)
  const headRef = useRef(0)
  const phasesRef = useRef<number[]>(LAYERS.map((layer) => layer.startPhase))

  const isActive = ACTIVE_STATUSES.includes(status)
  const clampedProgress = clamp01(progress / 100)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return

    setWidth(host.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = (): void => setReducedMotion(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    const fill = fillRef.current
    if (!width || !fill) return

    const targetHead = width * clampedProgress
    const targetAmp = isActive && !reducedMotion ? AMPLITUDE : 0

    let raf = 0
    let last = performance.now()

    const draw = (now: number): void => {
      const dt = Math.min((now - last) / 1000, MAX_FRAME_SECONDS)
      last = now

      const settle = 1 - Math.exp(-dt * SETTLE_RATE)
      ampRef.current += (targetAmp - ampRef.current) * settle
      headRef.current += (targetHead - headRef.current) * settle

      const head = headRef.current
      const amp = ampRef.current
      fill.setAttribute('width', head.toFixed(2))

      const hasWave = head >= 1 && amp >= 0.15
      LAYERS.forEach((layer, index) => {
        const path = waveRefs.current[index]
        if (!path) return
        if (!hasWave) {
          path.setAttribute('d', '')
          return
        }
        phasesRef.current[index] -=
          SPEED * layer.speedScale * (TAU / (WAVELENGTH * layer.lengthScale)) * dt
        path.setAttribute('d', buildWavePath(layer, head, amp, phasesRef.current[index]))
      })

      // Nothing left to animate: snap to the exact target and stop burning
      // frames. A later progress/status change re-runs this effect, and the
      // refs above mean it picks up from where it left off rather than
      // replaying the whole ramp-up.
      if (targetAmp === 0 && amp < 0.02 && Math.abs(targetHead - head) < 0.5) {
        headRef.current = targetHead
        fill.setAttribute('width', targetHead.toFixed(2))
        return
      }

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [width, clampedProgress, isActive, reducedMotion])

  return (
    <div
      ref={hostRef}
      className={`wave-progress-bar ${className}`}
      style={{ height: HEIGHT }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clampedProgress * 100)}
    >
      <svg
        width={width || '100%'}
        height={HEIGHT}
        viewBox={`0 0 ${Math.max(width, 1)} ${HEIGHT}`}
        style={{ display: 'block', overflow: 'visible' }}
        aria-hidden="true"
        focusable="false"
      >
        {LAYERS.map((layer, index) => (
          <path
            key={index}
            ref={(node) => {
              waveRefs.current[index] = node
            }}
            fill={layer.color}
            fillOpacity={layer.opacity}
          />
        ))}

        <rect
          x={0}
          y={BAR_TOP}
          width={Math.max(width, 0)}
          height={THICKNESS}
          rx={THICKNESS / 2}
          className="fill-neutral-200 dark:fill-neutral-800"
        />

        <rect
          ref={fillRef}
          x={0}
          y={BAR_TOP}
          width={0}
          height={THICKNESS}
          rx={THICKNESS / 2}
          fillOpacity={FILL_OPACITY}
          className={STATUS_FILL_CLASS[status]}
        />
      </svg>
    </div>
  )
}

export default WaveProgressBar
