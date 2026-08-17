# Music Library Downloader

A personal Electron desktop app to search [MusicBrainz](https://musicbrainz.org/) for
artists, albums and tracks, browse an artist's bio and discography (with cover art
from the Cover Art Archive), pick tracks from an album, and download them as
ID3-tagged MP3s — matched against YouTube via `yt-dlp` and tagged with MusicBrainz
metadata rather than whatever the YouTube upload happens to be called.

This is a learning project (first time building anything in Electron) built
incrementally — this README will grow alongside it.

## Status

Working end to end: search → artist page → album tracklist → download queue.

- [x] Electron scaffolding (main / preload / renderer, sandboxed, IPC via typed channels)
- [x] MusicBrainz search (artist / album / track)
- [x] Artist page: bio (via Wikidata → Wikipedia) + discography grid with cover art
- [x] Album modal: per-track selection, queued download
- [x] YouTube matching: scores candidates on title/artist/duration similarity,
      penalizes live/remix/cover versions, prefers official channels
- [x] Download pipeline: yt-dlp → ffmpeg (MP3) → ID3 tagging (title/artist/album/track/year/cover)
- [x] Concurrent downloads (capped) with per-track progress in a sidebar
- [x] Candidate fallback (next-best YouTube match) and multi-browser cookie fallback
      for age-restricted videos, with a retry button on failed downloads
- [ ] Download history
- [ ] Settings (audio quality, download location, concurrency limit)
- [ ] Artist images (Wikipedia infobox thumbnail is available, not wired up yet)
- [ ] Packaging / distributable builds

## Tech stack

- [Electron](https://www.electronjs.org/) via [electron-vite](https://electron-vite.org/), sandboxed renderer/preload
- React + TypeScript, [React Router](https://reactrouter.com/) (hash routing), [TanStack Query](https://tanstack.com/query) for data fetching, [Zustand](https://github.com/pmndrs/zustand) for the download queue
- [HeroUI](https://heroui.com/) + [Tailwind CSS v4](https://tailwindcss.com/) for the UI
- [`ytdlp-nodejs`](https://www.npmjs.com/package/ytdlp-nodejs) + [`ffmpeg-static`](https://www.npmjs.com/package/ffmpeg-static) for search/download/transcode
- [`browser-id3-writer`](https://www.npmjs.com/package/browser-id3-writer) for tagging
- [Zod](https://zod.dev/) for IPC input validation

## Getting started

```bash
npm install
npm run dev
```

Other useful scripts:

```bash
npm run typecheck   # tsc, main + renderer
npm run lint         # eslint
npm run format       # prettier --write
npm run build        # typecheck + production build
npm run build:win    # build + electron-builder (Windows)
```

## Before you run this yourself

MusicBrainz requires a descriptive `User-Agent` with real contact info, or
requests get rate-limited more aggressively. Replace the placeholder in both:

- `src/main/services/musicbrainz.ts`
- `src/main/services/wikipedia.ts`

```ts
const USER_AGENT = 'MusicLibraryDownloader/0.0.1 ( contact: replace-me@example.com )'
```

Downloaded YouTube videos that require sign-in (age-restricted content) are
handled by reading cookies from a browser you're logged into YouTube with, via
`yt-dlp`'s `--cookies-from-browser`. No credentials are ever stored or
transmitted by this app — see `src/main/utils/defaultBrowser.ts` and
`src/main/services/download.ts` for how the browser is picked.

## Project structure

```
src/
  main/       # Electron main process: IPC handlers, MusicBrainz/YouTube/Wikipedia
              # services, matching + download logic
  preload/    # contextBridge API exposed to the renderer
  renderer/   # React app (pages, components, queries, Zustand store)
  shared/     # Types and IPC channel names shared by main + renderer
scripts/      # Standalone test scripts for services (run with `node scripts/*.ts`)
```

## Disclaimer

For personal use only. Downloading copyrighted content from YouTube may
violate its Terms of Service depending on your jurisdiction and use case —
this project doesn't host, distribute, or encourage downloading anything you
don't already have the right to.
