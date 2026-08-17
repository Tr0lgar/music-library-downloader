// Standalone test for the YouTube search service — run with:
//   node scripts/test-youtube.ts "artist" "title"
// Kept outside src/ on purpose: it isolates yt-dlp bugs from Electron bugs,
// no app/IPC wiring needed to try it out.
import { searchYoutube } from '../src/main/services/youtube.ts'

async function main(): Promise<void> {
  const artist = process.argv[2] ?? 'Daft Punk'
  const title = process.argv[3] ?? 'One More Time'
  console.log(`Searching YouTube for: "${artist} ${title}"\n`)

  const results = await searchYoutube(artist, title)

  for (const candidate of results) {
    console.log(`[${candidate.id}] ${candidate.title}`)
    console.log(`  channel: ${candidate.channel}`)
    console.log(`  duration: ${candidate.durationSeconds}s`)
    console.log(`  url: ${candidate.url}\n`)
  }
}

main().catch((error: unknown) => {
  console.error('Search failed:', error)
  process.exit(1)
})
