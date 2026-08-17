// Standalone test for the matching service — run with:
//   node scripts/test-matching.ts "title" "artist" [durationMs]
import { searchYoutube } from '../src/main/services/youtube.ts'
import { findBestMatch } from '../src/main/services/matching.ts'

async function main(): Promise<void> {
  const title = process.argv[2] ?? 'One More Time'
  const artist = process.argv[3] ?? 'Daft Punk'
  const durationMs = process.argv[4] ? Number(process.argv[4]) : undefined

  console.log(`Matching "${title}" by ${artist}${durationMs ? ` (${durationMs}ms)` : ''}\n`)

  const candidates = await searchYoutube(artist, title)
  const result = findBestMatch({ title, artist, durationMs }, candidates)

  console.log(`Status: ${result.status}\n`)
  for (const candidate of result.candidates) {
    console.log(
      `${candidate.score.toString().padStart(3)}  ${candidate.title}  [${candidate.channel}]`
    )
  }

  if (result.best) {
    console.log(`\nBest match (score ${result.best.score}): ${result.best.url}`)
  } else {
    console.log('\nNo confident match — user should pick manually.')
  }
}

main().catch((error: unknown) => {
  console.error('Matching failed:', error)
  process.exit(1)
})
