import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { getSettings, setDownloadDirectory, setMusicbrainzEmail } from '../services/settings'
import { musicbrainzEmailSchema } from './schemas'

export function registerSettingsHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => getSettings())

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_MUSICBRAINZ_EMAIL, (_event, email: unknown) => {
    const parsed = musicbrainzEmailSchema.safeParse(email)
    if (!parsed.success) {
      console.error('[settings] rejected invalid email:', parsed.error.message)
      throw new Error('Please enter a valid email address.')
    }
    setMusicbrainzEmail(parsed.data)
  })

  // Returns the picked path, or null if the user canceled — the renderer
  // decides what to do with it (this doesn't persist anything itself).
  ipcMain.handle(IPC_CHANNELS.SETTINGS_CHOOSE_DOWNLOAD_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: getSettings().downloadDirectory
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_DOWNLOAD_DIRECTORY, (_event, path: unknown) => {
    if (path !== null && typeof path !== 'string') {
      throw new Error('Invalid download directory.')
    }
    setDownloadDirectory(path)
  })
}
