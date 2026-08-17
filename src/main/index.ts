import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import ffmpegPath from 'ffmpeg-static'
import { helpers as ytDlpHelpers } from 'ytdlp-nodejs'
import { registerIpcHandlers } from './ipc'
import icon from '../../resources/icon.png?asset'

function checkMediaBinaries(): void {
  try {
    const output = execFileSync(ffmpegPath as string, ['-version'])
      .toString()
      .split('\n')[0]
    console.log('[check] ffmpeg reachable:', output)
  } catch (error) {
    console.error('[check] ffmpeg NOT reachable:', error)
  }

  try {
    const ytDlpPath = ytDlpHelpers.findYtdlpBinary() as string
    const output = execFileSync(ytDlpPath, ['--version']).toString().trim()
    console.log('[check] yt-dlp reachable:', output)
  } catch (error) {
    console.error('[check] yt-dlp NOT reachable:', error)
  }
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true
    }
  })

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[preload] failed to load:', preloadPath, error)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  checkMediaBinaries()

  const mainWindow = createWindow()
  registerIpcHandlers(mainWindow)

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
