import { create } from 'zustand'
import type { DownloadProgress, DownloadRequest } from '@shared/types'

interface DownloadStore {
  downloads: DownloadProgress[]
  // The original request per track id, so a failed download can be retried
  // without the caller needing to rebuild it (releaseGroupId, trackNumber,
  // etc. aren't part of DownloadProgress, which only carries what the UI
  // displays).
  requests: Record<string, DownloadRequest>
  upsert: (update: DownloadProgress) => void
  registerRequests: (requests: DownloadRequest[]) => void
  remove: (id: string) => void
}

export const useDownloadStore = create<DownloadStore>((set) => ({
  downloads: [],
  requests: {},
  upsert: (update) =>
    set((state) => {
      const index = state.downloads.findIndex((download) => download.id === update.id)
      // Appended, not prepended, and never reordered afterwards — a track's
      // position in the list is fixed the moment it's first queued, so the
      // list doesn't jump around as downloads finish.
      if (index === -1) return { downloads: [...state.downloads, update] }
      const next = [...state.downloads]
      next[index] = update
      return { downloads: next }
    }),
  registerRequests: (requests) =>
    set((state) => ({
      requests: {
        ...state.requests,
        ...Object.fromEntries(requests.map((request) => [request.id, request]))
      }
    })),
  // `requests` is left untouched — a canceled track's request stays cached
  // so an "Undo" action can re-queue it the same way a retry does.
  remove: (id) =>
    set((state) => ({ downloads: state.downloads.filter((download) => download.id !== id) }))
}))
