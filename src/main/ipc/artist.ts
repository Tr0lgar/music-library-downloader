import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { getArtistDetails } from '../services/artist'
import { mbidSchema } from './schemas'

export function registerArtistHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ARTIST_DETAILS, async (_event, id: unknown) => {
    const parsed = mbidSchema.safeParse(id)
    if (!parsed.success) {
      console.error('[artist] rejected invalid id:', parsed.error.message)
      throw new Error('Invalid artist id.')
    }

    try {
      return await getArtistDetails(parsed.data)
    } catch (error) {
      console.error('[artist] failed to load details:', error)
      throw error
    }
  })
}
