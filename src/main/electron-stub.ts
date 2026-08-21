// Test double for the `electron` module, injected via a vitest resolve alias.
// Handlers registered through `ipcMain.handle` land in `ipcHandlers` so tests
// drive the real ipc entry points without an electron runtime.
import type { IpcMethodChannel, IpcRequest, IpcResult } from '../shared/ipc'

type IpcResponse = IpcResult<IpcMethodChannel>
type IpcHandler = (event: undefined, ...args: unknown[]) => IpcResponse | Promise<IpcResponse>

export const ipcHandlers = new Map<string, IpcHandler>()

export const ipcMain = {
  handle(channel: string, handler: IpcHandler): void {
    ipcHandlers.set(channel, handler)
  },
  removeHandler(channel: string): void {
    ipcHandlers.delete(channel)
  }
}

export function invokeIpc<C extends IpcMethodChannel>(
  channel: C,
  ...args: IpcRequest<C>
): Promise<IpcResult<C>>
export function invokeIpc<C extends IpcMethodChannel>(
  channel: C,
  ...args: unknown[]
): Promise<IpcResult<C>>
export function invokeIpc(channel: IpcMethodChannel, ...args: unknown[]): Promise<IpcResponse> {
  const handler = ipcHandlers.get(channel)
  return Promise.resolve().then(() => {
    if (!handler) throw new Error(`No handler registered for ${channel}`)
    return handler(undefined, ...args)
  })
}

export const BrowserWindow = {
  getAllWindows: (): never[] => []
}

export const shell = {
  openPath: async (): Promise<string> => '',
  showItemInFolder: (): void => {}
}
