import { useEffect, useRef } from 'react'

export type ToggleButtonState = 'idle' | 'active' | 'error'

const VIEWBOX_SIZE = 100
const CENTER = VIEWBOX_SIZE / 2
const TAU = Math.PI * 2

// Every shape below is sampled at this many points around its own boundary
// and rebuilt into a uniform cubic-Bezier path with the same point count and
// command structure. That's what lets the browser morph `d` smoothly when
// the state changes instead of just swapping instantly — CSS can only
// interpolate between paths built the same way.
const MORPH_POINTS = 48

// Touches the viewBox edge exactly (50 = half of the 100-unit viewBox) so
// it lines up pixel-for-pixel with DownloadsPanel's own rounded corner
// (28px on the 56px closed box — the same ratio) during the handoff at the
// start of the open/close morph. A smaller radius here left a visible gap
// between the drawn circle and the panel's own edge, which popped larger
// the instant the panel's background faded in behind it — read as a small
// jump rather than a seamless handoff.
const CIRCLE_RADIUS = 50

// "Cookie" shape used by Material Design 3's wavy loading indicator — a
// circle whose radius is modulated around its circumference into a handful
// of soft, rounded scallops.
const BLOB_BASE_RADIUS = 48
const BLOB_AMPLITUDE = 2
const BLOB_LOBES = 9

const TRIANGLE_RADIUS = 58
// How far each corner gets rounded off, as a distance along both edges from
// the vertex — large relative to the triangle's size on purpose, for the
// "very rounded" look rather than a plain rounded-rect-ish triangle.
const TRIANGLE_CORNER_RADIUS = 24

interface Point {
  x: number
  y: number
}

interface PointWithTangent extends Point {
  dx: number
  dy: number
}

// A closed shape expressed as a function from a loop parameter s (0..1,
// wrapping) to position + tangent (d/ds) at that point.
type ShapeAt = (s: number) => PointWithTangent

function circleAt(s: number): PointWithTangent {
  const theta = s * TAU
  const cosT = Math.cos(theta)
  const sinT = Math.sin(theta)
  return {
    x: CENTER + CIRCLE_RADIUS * cosT,
    y: CENTER + CIRCLE_RADIUS * sinT,
    dx: TAU * -CIRCLE_RADIUS * sinT,
    dy: TAU * CIRCLE_RADIUS * cosT
  }
}

// Polar curve r(theta) = base + amp*cos(lobes*theta), with its exact
// analytic tangent — approximating the tangent from neighboring samples
// (Catmull-Rom) instead reads as faceted at the peaks unless oversampled.
function blobAt(s: number): PointWithTangent {
  const theta = s * TAU
  const r = BLOB_BASE_RADIUS + BLOB_AMPLITUDE * Math.cos(theta * BLOB_LOBES)
  const drdtheta = -BLOB_AMPLITUDE * BLOB_LOBES * Math.sin(theta * BLOB_LOBES)
  const cosT = Math.cos(theta)
  const sinT = Math.sin(theta)
  return {
    x: CENTER + r * cosT,
    y: CENTER + r * sinT,
    dx: TAU * (drdtheta * cosT - r * sinT),
    dy: TAU * (drdtheta * sinT + r * cosT)
  }
}

function normalizeToward(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  return { x: dx / len, y: dy / len }
}

interface LineSegment {
  kind: 'line'
  a: Point
  b: Point
}

interface QuadSegment {
  kind: 'quad'
  a: Point
  ctrl: Point
  b: Point
}

type TriangleSegment = LineSegment | QuadSegment

// Rounded-triangle construction (round every corner by
// moving `TRIANGLE_CORNER_RADIUS` back along each edge, then join with a
// quadratic curve through the original vertex) — sequence of
// line/quad segments instead of a finished path string, so triangleAt()
// below can sample position + exact tangent anywhere along it.
function buildTriangleSegments(): TriangleSegment[] {
  const vertices = [-90, 30, 150].map((deg) => {
    const rad = (deg * Math.PI) / 180
    return {
      x: CENTER + TRIANGLE_RADIUS * Math.cos(rad),
      y: CENTER + TRIANGLE_RADIUS * Math.sin(rad)
    }
  })

  const n = vertices.length
  const roundStart: Point[] = []
  const roundEnd: Point[] = []

  for (let i = 0; i < n; i++) {
    const curr = vertices[i]
    const prev = vertices[(i - 1 + n) % n]
    const next = vertices[(i + 1) % n]
    const towardPrev = normalizeToward(curr, prev)
    const towardNext = normalizeToward(curr, next)
    roundStart.push({
      x: curr.x + towardPrev.x * TRIANGLE_CORNER_RADIUS,
      y: curr.y + towardPrev.y * TRIANGLE_CORNER_RADIUS
    })
    roundEnd.push({
      x: curr.x + towardNext.x * TRIANGLE_CORNER_RADIUS,
      y: curr.y + towardNext.y * TRIANGLE_CORNER_RADIUS
    })
  }

  const segments: TriangleSegment[] = []
  for (let i = 0; i < n; i++) {
    segments.push({ kind: 'line', a: roundEnd[(i - 1 + n) % n], b: roundStart[i] })
    segments.push({ kind: 'quad', a: roundStart[i], ctrl: vertices[i], b: roundEnd[i] })
  }
  return segments
}

const TRIANGLE_SEGMENTS = buildTriangleSegments()

function triangleAt(s: number): PointWithTangent {
  const segCount = TRIANGLE_SEGMENTS.length
  const scaled = s * segCount
  const index = Math.min(Math.floor(scaled), segCount - 1)
  const u = scaled - index
  const seg = TRIANGLE_SEGMENTS[index]

  // Chain rule: u runs 0..1 across 1/segCount of the full loop, so d/du
  // needs scaling by segCount to become d/ds.
  if (seg.kind === 'line') {
    return {
      x: seg.a.x + (seg.b.x - seg.a.x) * u,
      y: seg.a.y + (seg.b.y - seg.a.y) * u,
      dx: (seg.b.x - seg.a.x) * segCount,
      dy: (seg.b.y - seg.a.y) * segCount
    }
  }

  const mu = 1 - u
  return {
    x: mu * mu * seg.a.x + 2 * mu * u * seg.ctrl.x + u * u * seg.b.x,
    y: mu * mu * seg.a.y + 2 * mu * u * seg.ctrl.y + u * u * seg.b.y,
    dx: (2 * mu * (seg.ctrl.x - seg.a.x) + 2 * u * (seg.b.x - seg.ctrl.x)) * segCount,
    dy: (2 * mu * (seg.ctrl.y - seg.a.y) + 2 * u * (seg.b.y - seg.ctrl.y)) * segCount
  }
}

// Resamples any closed curve into a uniform MORPH_POINTS-point cubic Bezier
// path via Hermite interpolation (exact tangents, not approximated), so
// paths built from very different shapes still share the same `M` + N×`C` +
// `Z` command structure and can be morphed between via CSS.
function buildMorphablePath(shapeAt: ShapeAt): string {
  const deltaS = 1 / MORPH_POINTS
  const samples: PointWithTangent[] = []
  for (let i = 0; i <= MORPH_POINTS; i++) {
    samples.push(shapeAt((i % MORPH_POINTS) / MORPH_POINTS))
  }

  let d = `M${samples[0].x.toFixed(2)},${samples[0].y.toFixed(2)} `
  for (let i = 0; i < MORPH_POINTS; i++) {
    const p0 = samples[i]
    const p1 = samples[i + 1]
    const c1x = p0.x + (p0.dx * deltaS) / 3
    const c1y = p0.y + (p0.dy * deltaS) / 3
    const c2x = p1.x - (p1.dx * deltaS) / 3
    const c2y = p1.y - (p1.dy * deltaS) / 3
    d += `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p1.x.toFixed(2)},${p1.y.toFixed(2)} `
  }
  return d + 'Z'
}

const SHAPE_PATH: Record<ToggleButtonState, string> = {
  idle: buildMorphablePath(circleAt),
  active: buildMorphablePath(blobAt),
  error: buildMorphablePath(triangleAt)
}

const SHAPE_FILL: Record<ToggleButtonState, string> = {
  idle: '#ffffff',
  active: '#ffffff',
  error: '#fca5a5'
}

const ROTATION_DEGREES_PER_MS = 360 / 5000 // one turn every 5s

interface DownloadsToggleShapeProps {
  state: ToggleButtonState
}

// The status shape shown on the collapsed toggle button: a static circle
// when idle, a slowly rotating wavy blob while anything is active, and a
// soft rounded triangle on error — morphing smoothly between the three
// instead of swapping instantly.
function DownloadsToggleShape({ state }: DownloadsToggleShapeProps): React.JSX.Element {
  const pathRef = useRef<SVGPathElement>(null)
  const angleRef = useRef(0)

  // Rotation is driven imperatively (not a CSS `@keyframes` animation)
  // because a keyframe animation always restarts at its `from` value and
  // snaps back to it the instant the class is removed — exactly the "break"
  // this was meant to avoid. Keeping our own persistent angle means leaving
  // 'active' just stops incrementing it wherever it happens to be, and
  // re-entering 'active' later resumes from that same angle instead of
  // jumping back to 0.
  useEffect(() => {
    if (state !== 'active') return

    let lastTime: number | undefined
    let frame: number

    const tick = (now: number): void => {
      if (lastTime !== undefined) {
        angleRef.current = (angleRef.current + (now - lastTime) * ROTATION_DEGREES_PER_MS) % 360
        if (pathRef.current) {
          pathRef.current.style.transform = `rotate(${angleRef.current}deg)`
        }
      }
      lastTime = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [state])

  return (
    <svg viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`} className="absolute inset-0 h-full w-full">
      {/* `d` is set through the CSS property (via `style`), not the SVG
          attribute — only a CSS-property change picks up the `.toggle-shape`
          transition below. `transform` is deliberately left out of this
          React-controlled style object: the rotation effect above mutates
          it directly on the DOM node every frame, which would fight with
          (and be far too expensive through) React's own re-renders. */}
      <path
        ref={pathRef}
        style={{ d: `path("${SHAPE_PATH[state]}")`, fill: SHAPE_FILL[state] }}
        className="toggle-shape origin-[50px_50px]"
      />
    </svg>
  )
}

export default DownloadsToggleShape
