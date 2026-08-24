import { useEffect, useRef } from 'react'
import {
  AudioWaveformIcon,
  type AudioWaveformIconHandle,
  CircleCheckIcon,
  type CircleCheckIconHandle,
  SearchIcon,
  type SearchIconHandle,
  TagIcon,
  type TagIconHandle
} from '@animateicons/react/lucide'
import type { DownloadStatus } from '@shared/types'

interface DownloadStatusStepsProps {
  status: DownloadStatus
}

type StepState = 'pending' | 'active' | 'done'

// Mirrors WaveProgressBar's own STATUS_FILL_CLASS pairings, so a step icon
// and the bar above it always agree on what "in progress" / "done" looks
// like.
const STEP_COLOR_CLASS: Record<StepState, string> = {
  pending: 'text-neutral-400 dark:text-neutral-600',
  active: 'text-sky-500 dark:text-sky-400',
  done: 'text-green-500 dark:text-green-400'
}

const STEPS: DownloadStatus[] = ['searching', 'downloading', 'tagging']

// Neither SearchIcon nor TagIcon loop on their own — each plays once and
// stops, so an active step re-triggers it on an interval matching its own
// animation length. AudioWaveformIcon is the exception: its "sweep" variant
// already has `repeat: Infinity` built in, so it's started once and left
// alone until the step is no longer active.
const SEARCH_LOOP_MS = 1200
const TAG_LOOP_MS = 850

// Must match the `duration-300`/`delay-300` below: the row of step icons
// slides out first, and the final checkmark only starts its own animation
// once that exit has actually finished, not the instant the last step
// completes.
const ROW_EXIT_MS = 300

function DownloadStatusSteps({ status }: DownloadStatusStepsProps): React.JSX.Element {
  const searchRef = useRef<SearchIconHandle>(null)
  const waveformRef = useRef<AudioWaveformIconHandle>(null)
  const tagRef = useRef<TagIconHandle>(null)
  const checkRef = useRef<CircleCheckIconHandle>(null)

  const stepIndex = STEPS.indexOf(status)
  const isDone = status === 'done'

  useEffect(() => {
    if (stepIndex !== 0) {
      searchRef.current?.stopAnimation()
      return
    }
    searchRef.current?.startAnimation()
    const id = setInterval(() => searchRef.current?.startAnimation(), SEARCH_LOOP_MS)
    return () => clearInterval(id)
  }, [stepIndex])

  useEffect(() => {
    if (stepIndex === 1) waveformRef.current?.startAnimation()
    else waveformRef.current?.stopAnimation()
  }, [stepIndex])

  useEffect(() => {
    if (stepIndex !== 2) {
      tagRef.current?.stopAnimation()
      return
    }
    tagRef.current?.startAnimation()
    const id = setInterval(() => tagRef.current?.startAnimation(), TAG_LOOP_MS)
    return () => clearInterval(id)
  }, [stepIndex])

  useEffect(() => {
    if (!isDone) return
    const timer = setTimeout(() => checkRef.current?.startAnimation(), ROW_EXIT_MS)
    return () => clearTimeout(timer)
  }, [isDone])

  const stateFor = (index: number): StepState => {
    if (isDone || stepIndex > index) return 'done'
    if (stepIndex === index) return 'active'
    return 'pending'
  }

  return (
    <div className="relative h-4">
      <div
        className={`absolute inset-0 flex items-center gap-3 transition duration-300 ${
          isDone ? 'pointer-events-none translate-y-2 opacity-0' : 'translate-y-0 opacity-100'
        }`}
      >
        <SearchIcon ref={searchRef} size={16} className={STEP_COLOR_CLASS[stateFor(0)]} />
        <AudioWaveformIcon ref={waveformRef} size={16} className={STEP_COLOR_CLASS[stateFor(1)]} />
        <TagIcon ref={tagRef} size={16} className={STEP_COLOR_CLASS[stateFor(2)]} />
      </div>

      <div
        className={`absolute inset-0 flex items-center transition-opacity duration-150 ${
          isDone ? 'opacity-100 delay-300' : 'pointer-events-none opacity-0'
        }`}
      >
        <CircleCheckIcon ref={checkRef} size={16} className="text-green-500 dark:text-green-400" />
      </div>
    </div>
  )
}

export default DownloadStatusSteps
