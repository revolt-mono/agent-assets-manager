import { BrowserWindow } from 'electron'

// Debounced so a burst of file-watcher events becomes one renderer push.
export function debouncedBroadcast(channel: string, payload?: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    notify: () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(channel, payload)
        }
      }, 150)
    },
    stop: () => clearTimeout(timer)
  }
}
