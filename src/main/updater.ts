import { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import type { UpdateState } from '../shared/update'
import { onRendererEvent, sendMainEvent } from './ipc'

const CHECK_INTERVAL_MS = 60 * 60 * 1000
const MOCK_VERSION = '0.0.2-dev'
const MOCK_DISCOVERY_DELAY_MS = 750
const MOCK_PROGRESS_INTERVAL_MS = 250

export function registerUpdater(): () => void {
  let state: UpdateState = { status: 'idle' }
  let stopped = false
  let discoverTimer: ReturnType<typeof setTimeout> | undefined
  let progressTimer: ReturnType<typeof setInterval> | undefined
  let checkTimer: ReturnType<typeof setInterval> | undefined

  const setState = (next: UpdateState): void => {
    if (stopped) return
    state = next
    for (const window of BrowserWindow.getAllWindows()) {
      sendMainEvent(window.webContents, 'update:changed', state)
    }
  }
  // The renderer subscribes after attaching its listener, so replying with
  // the current state cannot race the attach the way a load-time push could.
  const stopSubscribe = onRendererEvent('update:subscribe', (event) =>
    sendMainEvent(event.sender, 'update:changed', state)
  )

  const stop = (): void => {
    stopped = true
    if (discoverTimer) clearTimeout(discoverTimer)
    if (progressTimer) clearInterval(progressTimer)
    if (checkTimer) clearInterval(checkTimer)
    stopSubscribe()
  }

  if (is.dev) {
    // No update feed in dev: loop a fake available -> downloading -> downloaded
    // cycle so the button stays exercisable.
    const discover = (): void => {
      if (discoverTimer) clearTimeout(discoverTimer)
      discoverTimer = setTimeout(
        () => setState({ status: 'available', version: MOCK_VERSION }),
        MOCK_DISCOVERY_DELAY_MS
      )
    }
    const stopProceed = onRendererEvent('update:proceed', () => {
      if (state.status === 'available') {
        const version = state.version
        let percent = 0
        setState({ status: 'downloading', version, percent })
        progressTimer = setInterval(() => {
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
    return () => {
      stopProceed()
      stop()
    }
  }

  const stopProceed = onRendererEvent('update:proceed', () => {
    if (state.status === 'available') {
      const version = state.version
      setState({ status: 'downloading', version, percent: 0 })
      void autoUpdater.downloadUpdate().catch(() => setState({ status: 'available', version }))
    } else if (state.status === 'downloaded') {
      autoUpdater.quitAndInstall()
    }
  })

  autoUpdater.autoDownload = false
  const onError = (): void => {}
  const onAvailable = (info: UpdateInfo): void => {
    if (state.status === 'idle' || state.status === 'available') {
      setState({ status: 'available', version: info.version })
    }
  }
  const onProgress = (info: ProgressInfo): void => {
    if (state.status !== 'downloading') return
    const percent = Number.isFinite(info.percent)
      ? Math.min(100, Math.max(0, Math.round(info.percent)))
      : 0
    setState({ status: 'downloading', version: state.version, percent })
  }
  const onDownloaded = (info: UpdateInfo): void => {
    setState({ status: 'downloaded', version: info.version })
  }
  autoUpdater.on('error', onError)
  autoUpdater.on('update-available', onAvailable)
  autoUpdater.on('download-progress', onProgress)
  autoUpdater.on('update-downloaded', onDownloaded)
  const check = (): void => {
    if (state.status === 'downloading' || state.status === 'downloaded') return
    void autoUpdater.checkForUpdates().catch(() => undefined)
  }
  check()
  checkTimer = setInterval(check, CHECK_INTERVAL_MS)

  return () => {
    stopProceed()
    autoUpdater.removeListener('error', onError)
    autoUpdater.removeListener('update-available', onAvailable)
    autoUpdater.removeListener('download-progress', onProgress)
    autoUpdater.removeListener('update-downloaded', onDownloaded)
    stop()
  }
}
