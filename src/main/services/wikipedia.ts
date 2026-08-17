const WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php'
const WIKIPEDIA_USER_AGENT = 'MusicLibraryDownloader/0.0.1 ( contact: replace-me@example.com )'

interface WikidataEntityResponse {
  entities: {
    [id: string]: {
      sitelinks?: {
        enwiki?: { title: string }
      }
    }
  }
}

interface WikipediaSummaryResponse {
  extract?: string
}

// Wikidata ID -> English Wikipedia article title -> summary extract.
async function getWikipediaTitle(wikidataId: string): Promise<string | undefined> {
  const url = `${WIKIDATA_API_URL}?action=wbgetentities&ids=${wikidataId}&props=sitelinks&sitefilter=enwiki&format=json`
  const response = await fetch(url, { headers: { 'User-Agent': WIKIPEDIA_USER_AGENT } })
  if (!response.ok) return undefined

  const data = (await response.json()) as WikidataEntityResponse
  return data.entities[wikidataId]?.sitelinks?.enwiki?.title
}

/**
 * Resolves an artist's biography by following the Wikidata link MusicBrainz
 * exposes for the artist, then pulling the English Wikipedia summary.
 * Returns undefined when there is no Wikidata link or no Wikipedia page —
 * this is expected for lesser-known artists, not an error.
 */
export async function getArtistBiography(wikidataId?: string): Promise<string | undefined> {
  if (!wikidataId) return undefined

  try {
    const title = await getWikipediaTitle(wikidataId)
    if (!title) return undefined

    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    const response = await fetch(summaryUrl, { headers: { 'User-Agent': WIKIPEDIA_USER_AGENT } })
    if (!response.ok) return undefined

    const data = (await response.json()) as WikipediaSummaryResponse
    return data.extract
  } catch (error) {
    console.error('[wikipedia] failed to fetch biography:', error)
    return undefined
  }
}
