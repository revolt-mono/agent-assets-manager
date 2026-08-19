// Test double for the `electron` module, injected via a vitest resolve alias.
// Handlers registered through `ipcMain.handle` land in `ipcHandlers` so tests
// drive the real ipc entry points without an electron runtime.
type IpcHandler = (event: undefined, ...args: any[]) => any

export const ipcHandlers = new Map<string, IpcHandler>()

export const ipcMain = {
  handle(channel: string, handler: IpcHandler): void {
    ipcHandlers.set(channel, handler)
  }
}

export function invokeIpc(channel: string, ...args: any[]): any {
  const handler = ipcHandlers.get(channel)
  if (!handler) throw new Error(`No handler registered for ${channel}`)
  return handler(undefined, ...args)
}

export const BrowserWindow = {
  getAllWindows: (): never[] => []
}

export const shell = {
  openPath: async (): Promise<string> => '',
  showItemInFolder: (): void => {}
}
