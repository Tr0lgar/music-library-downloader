import { getSettings } from '../services/settings'

const APP_NAME_VERSION = 'MusicLibraryDownloader/0.0.1'

// MusicBrainz (and Wikipedia/Wikidata, contacted as part of the same artist
// lookup) requires a descriptive User-Agent identifying the app and a
// contact email, or requests get rate-limited much more aggressively. The
// app blocks all use until this is set (see FirstLaunchSetup in the
// renderer), so the fallback below is only a safety net, never expected to
// actually show up in a request.
export function getUserAgent(): string {
  const email = getSettings().musicbrainzEmail ?? 'unknown@unknown.invalid'
  return `${APP_NAME_VERSION} ( contact: ${email} )`
}
