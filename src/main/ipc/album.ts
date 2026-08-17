import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { getAlbumTracks } from '../services/musicbrainz'
import { mbidSchema } from './schemas'

export function registerAlbumHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.ALBUM_TRACKS, async (_event, releaseGroupId: unknown) => {
    const parsed = mbidSchema.safeParse(releaseGroupId)
    if (!parsed.success) {
      console.error('[album] rejected invalid release-group id:', parsed.error.message)
      throw new Error('Invalid album id.')
    }

    try {
      return await getAlbumTracks(parsed.data)
    } catch (error) {
      console.error('[album] failed to load tracklist:', error)
      throw error
    }
  })
}
