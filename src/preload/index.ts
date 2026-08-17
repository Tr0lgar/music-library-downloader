import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type {
  AlbumResult,
  AlbumTrack,
  ArtistDetails,
  ArtistResult,
  DownloadProgress,
  DownloadRequest,
  SearchType,
  TrackResult
} from '@shared/types'

const api = {
  ping: (): Promise<string> => ipcRenderer.invoke(IPC_CHANNELS.PING),
  search: (
    term: string,
    type: SearchType
  ): Promise<ArtistResult[] | AlbumResult[] | TrackResult[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.SEARCH_QUERY, term, type),
  getArtistDetails: (id: string): Promise<ArtistDetails> =>
    ipcRenderer.invoke(IPC_CHANNELS.ARTIST_DETAILS, id),
  getAlbumTracks: (releaseGroupId: string): Promise<AlbumTrack[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.ALBUM_TRACKS, releaseGroupId),
  startDownloads: (requests: DownloadRequest[]): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_START, requests),
  onDownloadProgress: (callback: (progress: DownloadProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: DownloadProgress): void =>
      callback(progress)
    ipcRenderer.on(IPC_CHANNELS.DOWNLOAD_PROGRESS, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.DOWNLOAD_PROGRESS, listener)
    }
  }
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
