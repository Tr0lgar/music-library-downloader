import { ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { registerSettingsHandlers } from './settings'
import { registerSearchHandlers } from './search'
import { registerArtistHandlers } from './artist'
import { registerAlbumHandlers } from './album'
import { registerDownloadHandlers } from './download'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.PING, () => 'pong')
  registerSettingsHandlers(mainWindow)
  registerSearchHandlers()
  registerArtistHandlers()
  registerAlbumHandlers()
  registerDownloadHandlers(mainWindow)
}
