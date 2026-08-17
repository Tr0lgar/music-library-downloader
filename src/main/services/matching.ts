import type { MatchCandidate, MatchResult, YoutubeCandidate } from '@shared/types'

// Below this score, or when the top two candidates are too close to call,
// we don't auto-pick a candidate — the caller should let the user choose.
const CONFIDENCE_THRESHOLD = 70
const AMBIGUITY_MARGIN = 10
const MAX_CANDIDATES_RETURNED = 5

const DURATION_TOLERANCE_SECONDS = 15
const OFFICIAL_CHANNEL_HINTS = ['official', 'topic', 'vevo']
const MALUS_KEYWORDS = [
  'live',
  'remix',
  'cover',
  'slowed',
  'sped up',
  'reverb',
  'nightcore',
  '8d audio',
  'karaoke',
  'instrumental'
]
const MALUS_PER_KEYWORD = 20

export interface MatchTarget {
  title: string
  artist: string
  durationMs?: number
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // strip diacritics
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ') // strip "(Official Video)", "[HD]", ...
    .replace(/[^a-z0-9\s]/g, ' ') // strip punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const matrix: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0))

  for (let i = 0; i < rows; i++) matrix[i][0] = i
  for (let j = 0; j < cols; j++) matrix[0][j] = j

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  return matrix[a.length][b.length]
}

function similarityRatio(a: string, b: string): number {
  if (a === b) return 1
  const maxLength = Math.max(a.length, b.length)
  if (maxLength === 0) return 1
  return 1 - levenshtein(a, b) / maxLength
}

// Each of the following returns a score in 0-100.

function titleScore(targetTitle: string, candidateTitle: string): number {
  const target = normalize(targetTitle)
  const candidate = normalize(candidateTitle)
  // YouTube titles are usually "Artist - Title (Official Video)" — a plain
  // edit-distance ratio would unfairly punish that extra text.
  if (candidate.includes(target)) return 100
  return similarityRatio(target, candidate) * 100
}

function artistScore(targetArtist: string, candidate: YoutubeCandidate): number {
  const artist = normalize(targetArtist)
  const inChannel = normalize(candidate.channel).includes(artist)
  const inTitle = normalize(candidate.title).includes(artist)

  if (inChannel) return 100
  if (inTitle) return 80
  return similarityRatio(artist, normalize(candidate.channel)) * 60
}

function durationScore(targetSeconds?: number, candidateSeconds?: number): number {
  if (targetSeconds === undefined || candidateSeconds === undefined) return 50 // unknown, stay neutral
  const diff = Math.abs(targetSeconds - candidateSeconds)
  if (diff >= DURATION_TOLERANCE_SECONDS) return 0
  return (1 - diff / DURATION_TOLERANCE_SECONDS) * 100
}

function officialBonus(candidate: YoutubeCandidate, targetArtist: string): number {
  const channel = normalize(candidate.channel)
  const artist = normalize(targetArtist)
  const isArtistChannel = channel === artist || channel.startsWith(`${artist} `)
  const hasOfficialHint = OFFICIAL_CHANNEL_HINTS.some((hint) => channel.includes(hint))
  return isArtistChannel || hasOfficialHint ? 10 : 0
}

function malus(candidateTitle: string): number {
  const title = normalize(candidateTitle)
  const hits = MALUS_KEYWORDS.filter((keyword) => title.includes(keyword)).length
  return hits * MALUS_PER_KEYWORD
}

const WEIGHTS = { title: 0.4, artist: 0.3, duration: 0.3 }

function scoreCandidate(target: MatchTarget, candidate: YoutubeCandidate): MatchCandidate {
  const targetSeconds = target.durationMs !== undefined ? target.durationMs / 1000 : undefined

  const baseScore =
    titleScore(target.title, candidate.title) * WEIGHTS.title +
    artistScore(target.artist, candidate) * WEIGHTS.artist +
    durationScore(targetSeconds, candidate.durationSeconds) * WEIGHTS.duration

  const adjusted = baseScore + officialBonus(candidate, target.artist) - malus(candidate.title)

  return { ...candidate, score: Math.max(0, Math.min(100, Math.round(adjusted))) }
}

/**
 * Scores every candidate and decides whether the top one is confident
 * enough to auto-select, or whether the caller should ask the user to pick.
 */
export function findBestMatch(target: MatchTarget, candidates: YoutubeCandidate[]): MatchResult {
  const scored = candidates
    .map((candidate) => scoreCandidate(target, candidate))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES_RETURNED)

  const [top, second] = scored

  const isConfident =
    top !== undefined &&
    top.score >= CONFIDENCE_THRESHOLD &&
    (second === undefined || top.score - second.score >= AMBIGUITY_MARGIN)

  return isConfident
    ? { status: 'matched', best: top, candidates: scored }
    : { status: 'ambiguous', candidates: scored }
}
