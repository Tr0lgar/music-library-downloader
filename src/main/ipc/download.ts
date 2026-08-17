import { ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { DownloadRequest } from '@shared/types'
import { downloadTrack } from '../services/download'
import { downloadStartSchema } from './schemas'

async function processQueue(requests: DownloadRequest[], mainWindow: BrowserWindow): Promise<void> {
  // Fired off together — downloadTrack itself caps how many actually run at
  // once, so this just lets every track show up in the sidebar right away.
  await Promise.all(
    requests.map((request) =>
      downloadTrack(request, (update) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.DOWNLOAD_PROGRESS, update)
        }
      })
    )
  )
}

export function registerDownloadHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_START, (_event, requests: unknown) => {
    const parsed = downloadStartSchema.safeParse(requests)
    if (!parsed.success) {
      console.error('[download] rejected invalid request:', parsed.error.message)
      throw new Error('Invalid download request.')
    }

    // The handler returns immediately — progress streams back via the
    // download:progress event as each track works through the queue.
    void processQueue(parsed.data, mainWindow)
  })
}
