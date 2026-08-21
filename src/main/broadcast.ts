import { BrowserWindow } from 'electron'
import type { IpcMainEvent, IpcMainEventChannel } from '../shared/ipc'
import { sendMainEvent } from './ipc'

// Debounced so a burst of file-watcher events becomes one renderer push.
export function debouncedBroadcast<C extends IpcMainEventChannel>(
  channel: C,
  ...payload: IpcMainEvent<C>
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    notify: () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        for (const window of BrowserWindow.getAllWindows()) {
          sendMainEvent(window.webContents, channel, ...payload)
        }
      }, 150)
    },
    stop: () => clearTimeout(timer)
  }
}
