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
  // The renderer subscribes after attaching its listener, so replying with
  // the current state cannot race the attach the way a load-time push could.
  ipcMain.on('update:subscribe', (event) => event.sender.send('update:changed', state))

  if (is.dev) {
    // No update feed in dev: loop a fake available -> downloading -> downloaded
    // cycle so the button stays exercisable.
    const discover = (): void => {
      setTimeout(
        () => setState({ status: 'available', version: MOCK_VERSION }),
        MOCK_DISCOVERY_DELAY_MS
      )
    }
    ipcMain.on('update:proceed', () => {
      if (state.status === 'available') {
        const version = state.version
        let percent = 0
        setState({ status: 'downloading', version, percent })
        const progressTimer = setInterval(() => {
          percent = Math.min(100, percent + 10)
          if (percent < 100) {
            setState({ status: 'downloading', version, percent })
            return
          }
          clearInterval(progressTimer)
          setState({ status: 'downloaded', version })
        }, MOCK_PROGRESS_INTERVAL_MS)
      } else if (state.status === 'downloaded') {
        setState({ status: 'idle' })
        discover()
      }
    })
    discover()
    return
  }

  ipcMain.on('update:proceed', () => {
    if (state.status === 'available') {
      const version = state.version
      setState({ status: 'downloading', version, percent: 0 })
      autoUpdater.downloadUpdate().catch(() => setState({ status: 'available', version }))
    } else if (state.status === 'downloaded') {
      autoUpdater.quitAndInstall()
    }
  })

  autoUpdater.autoDownload = false
  autoUpdater.on('error', () => {})
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    if (state.status === 'idle' || state.status === 'available') {
      setState({ status: 'available', version: info.version })
    }
  })
  autoUpdater.on('download-progress', (info: ProgressInfo) => {
    if (state.status !== 'downloading') return
    const percent = Number.isFinite(info.percent)
      ? Math.min(100, Math.max(0, Math.round(info.percent)))
      : 0
    setState({ status: 'downloading', version: state.version, percent })
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    setState({ status: 'downloaded', version: info.version })
  })
  const check = (): void => {
    if (state.status === 'downloading' || state.status === 'downloaded') return
    autoUpdater.checkForUpdates().catch(() => {})
  }
  check()
  setInterval(check, CHECK_INTERVAL_MS)
}
