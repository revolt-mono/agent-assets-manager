import { BrowserWindow, ipcMain } from 'electron'
import { is } from '@electron-toolkit/utils'
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import type { UpdateState } from '../shared/update'

const CHECK_INTERVAL_MS = 60 * 60 * 1000
const MOCK_VERSION = '0.0.2-dev'
const MOCK_DISCOVERY_DELAY_MS = 750
const MOCK_PROGRESS_INTERVAL_MS = 250

export function registerUpdater(): void {
  let state: UpdateState = { status: 'idle' }

  const setState = (next: UpdateState): void => {
    state = next
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('update:changed', state)
    }
  }

  const scheduleMockUpdate = (): void => {
    setTimeout(() => {
      setState({ status: 'available', version: MOCK_VERSION })
    }, MOCK_DISCOVERY_DELAY_MS)
  }

  const proceed = (): void => {
    if (state.status === 'available') {
      const version = state.version
      setState({ status: 'downloading', version, percent: 0 })
      if (!is.dev) {
        autoUpdater.downloadUpdate().catch(() => {
          setState({ status: 'available', version })
        })
        return
      }

      let percent = 0
      const progressTimer = setInterval(() => {
        percent = Math.min(100, percent + 10)
        if (percent < 100) {
          setState({ status: 'downloading', version, percent })
          return
        }
        clearInterval(progressTimer)
        setState({ status: 'downloaded', version })
      }, MOCK_PROGRESS_INTERVAL_MS)
      return
    }

    if (state.status === 'downloaded') {
      if (!is.dev) {
        autoUpdater.quitAndInstall()
        return
      }
      setState({ status: 'idle' })
      scheduleMockUpdate()
    }
  }

  const onUpdateAvailable = (info: UpdateInfo): void => {
    if (state.status === 'idle' || state.status === 'available') {
      setState({ status: 'available', version: info.version })
    }
  }
  const onDownloadProgress = (info: ProgressInfo): void => {
    if (state.status !== 'downloading') return
    const percent = Number.isFinite(info.percent)
      ? Math.min(100, Math.max(0, Math.round(info.percent)))
      : 0
    setState({ status: 'downloading', version: state.version, percent })
  }
  const onUpdateDownloaded = (info: UpdateInfo): void => {
    setState({ status: 'downloaded', version: info.version })
  }
  const check = (): void => {
    if (state.status === 'downloading' || state.status === 'downloaded') return
    autoUpdater.checkForUpdates().catch(() => {})
  }

  ipcMain.handle('update:get', () => state)
  ipcMain.on('update:proceed', proceed)

  if (is.dev) {
    scheduleMockUpdate()
  } else {
    autoUpdater.autoDownload = false
    autoUpdater.on('error', () => {})
    autoUpdater.on('update-available', onUpdateAvailable)
    autoUpdater.on('download-progress', onDownloadProgress)
    autoUpdater.on('update-downloaded', onUpdateDownloaded)
    check()
    setInterval(check, CHECK_INTERVAL_MS)
  }
}
