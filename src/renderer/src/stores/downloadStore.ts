import { create } from 'zustand'
import type { DownloadProgress, DownloadRequest } from '@shared/types'

interface DownloadStore {
  downloads: DownloadProgress[]
  // The original request per track id, so a failed download can be retried
  // without rebuilding it.
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
      // Appended, not prepended or reordered — position is fixed once queued.
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
  // `requests` is left untouched so Undo can re-queue a canceled track.
  remove: (id) =>
    set((state) => ({ downloads: state.downloads.filter((download) => download.id !== id) }))
}))
