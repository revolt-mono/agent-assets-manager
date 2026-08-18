import { BrowserWindow } from 'electron'

// Debounced so a burst of file-watcher events becomes one renderer push.
export function debouncedBroadcast(channel: string) {
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    notify: () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(channel)
        }
      }, 150)
    },
    stop: () => clearTimeout(timer)
  }
}
