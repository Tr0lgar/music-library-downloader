import { execFileSync } from 'child_process'

const REGISTRY_KEY =
  'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice'

// yt-dlp's --cookies-from-browser accepts these names. Windows registry
// ProgId values vary by version/install (e.g. "FirefoxURL-308046B0AF4A39CB"),
// so match loosely by substring rather than an exact string.
const PROG_ID_TO_BROWSER: [pattern: RegExp, browser: string][] = [
  [/firefox/i, 'firefox'],
  [/edge/i, 'edge'],
  [/brave/i, 'brave'],
  [/opera/i, 'opera'],
  [/vivaldi/i, 'vivaldi'],
  [/chromium/i, 'chromium'],
  [/chrome/i, 'chrome']
]

// Every browser yt-dlp knows how to read cookies from. We don't know which
// one (if any) the user is actually logged into YouTube with, so the caller
// tries them in order and stops at whichever one actually works.
const ALL_SUPPORTED_BROWSERS = [
  'firefox',
  'chrome',
  'edge',
  'brave',
  'opera',
  'vivaldi',
  'chromium'
]

// Computed once per app run — the OS default browser doesn't change mid-session.
let cachedDetected: string | undefined
let hasComputed = false

function parseProgId(regQueryOutput: string): string | undefined {
  return regQueryOutput.match(/ProgId\s+REG_SZ\s+(\S+)/)?.[1]
}

// Detects the OS default browser, with no fallback baked in — returns
// undefined when detection fails or it isn't one yt-dlp supports.
function detectRaw(): string | undefined {
  if (hasComputed) return cachedDetected
  hasComputed = true

  if (process.platform !== 'win32') {
    return (cachedDetected = undefined)
  }

  try {
    const output = execFileSync('reg', ['query', REGISTRY_KEY, '/v', 'ProgId'], {
      encoding: 'utf-8'
    })
    const progId = parseProgId(output)
    const match = progId ? PROG_ID_TO_BROWSER.find(([pattern]) => pattern.test(progId)) : undefined

    if (!match) {
      console.warn(`[browser] default browser ProgId "${progId}" isn't supported by yt-dlp`)
    }

    return (cachedDetected = match?.[1])
  } catch (error) {
    console.warn('[browser] failed to detect default browser:', error)
    return (cachedDetected = undefined)
  }
}

/**
 * Ordered list of browsers to try reading YouTube cookies from: the OS
 * default first (if yt-dlp supports it), then every other supported browser.
 * We have no way to know in advance which one, if any, has a valid logged-in
 * YouTube session — callers should try each in turn and stop at the first
 * one that actually works, only falling through on an auth-shaped failure.
 */
export function getBrowserCandidates(): string[] {
  const detected = detectRaw()
  return detected
    ? [detected, ...ALL_SUPPORTED_BROWSERS.filter((browser) => browser !== detected)]
    : ALL_SUPPORTED_BROWSERS
}
