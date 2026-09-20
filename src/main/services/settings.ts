import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { AppSettings } from '@shared/types'

// What's actually persisted — unlike AppSettings, downloadDirectory here is
// an override only; null means "use the default", not "unset the app".
interface StoredSettings {
  musicbrainzEmail: string | null
  downloadDirectory: string | null
}

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function getDefaultDownloadDirectory(): string {
  return join(app.getPath('music'), 'Music Library Downloader')
}

let cached: StoredSettings | null = null

function readSettings(): StoredSettings {
  if (cached) return cached

  try {
    const raw = readFileSync(getSettingsPath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<StoredSettings>
    cached = {
      musicbrainzEmail:
        typeof parsed.musicbrainzEmail === 'string' ? parsed.musicbrainzEmail : null,
      downloadDirectory:
        typeof parsed.downloadDirectory === 'string' ? parsed.downloadDirectory : null
    }
  } catch {
    // No settings file yet (first launch) or it's corrupt — either way,
    // treated the same as "not configured".
    cached = { musicbrainzEmail: null, downloadDirectory: null }
  }

  return cached
}

function writeSettings(settings: StoredSettings): void {
  cached = settings
  writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

export function getSettings(): AppSettings {
  const stored = readSettings()
  return {
    musicbrainzEmail: stored.musicbrainzEmail,
    downloadDirectory: stored.downloadDirectory ?? getDefaultDownloadDirectory()
  }
}

export function setMusicbrainzEmail(email: string): void {
  writeSettings({ ...readSettings(), musicbrainzEmail: email })
}

// `null` resets to the default rather than storing an explicit override.
export function setDownloadDirectory(path: string | null): void {
  writeSettings({ ...readSettings(), downloadDirectory: path })
}
