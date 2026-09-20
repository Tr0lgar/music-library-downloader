export const IPC_CHANNELS = {
  PING: 'ping',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET_MUSICBRAINZ_EMAIL: 'settings:setMusicbrainzEmail',
  SETTINGS_CHOOSE_DOWNLOAD_DIRECTORY: 'settings:chooseDownloadDirectory',
  SETTINGS_SET_DOWNLOAD_DIRECTORY: 'settings:setDownloadDirectory',
  SEARCH_QUERY: 'search:query',
  ARTIST_DETAILS: 'artist:details',
  ALBUM_TRACKS: 'album:tracks',
  DOWNLOAD_START: 'download:start',
  DOWNLOAD_CANCEL: 'download:cancel',
  DOWNLOAD_PROGRESS: 'download:progress'
} as const
