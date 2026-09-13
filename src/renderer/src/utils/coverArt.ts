// Same size/URL everywhere it's used, so the browser's HTTP cache serves
// repeat requests for the same cover instead of re-fetching.
export function coverArtUrl(releaseGroupId: string): string {
  return `https://coverartarchive.org/release-group/${releaseGroupId}/front-250`
}
