import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { searchMusicBrainz } from '../services/musicbrainz'
import { searchQuerySchema } from './schemas'

export function registerSearchHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SEARCH_QUERY, async (_event, term: unknown, type: unknown) => {
    // Renderer sends an empty term while the user is still typing/clearing the
    // box — that's normal, not a validation failure.
    if (typeof term === 'string' && !term.trim()) return []

    const parsed = searchQuerySchema.safeParse({ term, type })
    if (!parsed.success) {
      console.error('[search] rejected invalid input:', parsed.error.message)
      throw new Error('Invalid search request.')
    }

    try {
      return await searchMusicBrainz(parsed.data.term, parsed.data.type)
    } catch (error) {
      console.error('[search] failed:', error)
      throw error
    }
  })
}
