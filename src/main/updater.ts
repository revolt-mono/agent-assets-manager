import { BrowserWindow, ipcMain } from 'electron'
import { is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'

export function registerUpdater(): void {
  // dev has no update feed; fake a downloaded update so the UI is always
  // visible. the guard below keeps clicking install a no-op in dev.
  let readyVersion: string | null = is.dev ? '0.0.0-dev' : null

  // renderers pull on mount, so a push sent before the listener exists is
  // recovered instead of lost
  ipcMain.handle('update:get', () => readyVersion)
  ipcMain.on('update:install', () => {
    if (!is.dev && readyVersion !== null) autoUpdater.quitAndInstall()
  })
  if (is.dev) return

  // downloads in the background; failures (offline, rate limit, draft-only
  // release) must never crash the app. electron-updater logs them itself.
  autoUpdater.on('error', () => {})
  autoUpdater.on('update-downloaded', (info) => {
    readyVersion = info.version
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('update:ready', info.version)
    }
  })
  const check = (): void => {
    autoUpdater.checkForUpdates().catch(() => {})
  }
  check()
  // the app stays alive for days on macOS; re-check so sessions started
  // before a release still see it
  setInterval(check, 4 * 60 * 60 * 1000)
}
