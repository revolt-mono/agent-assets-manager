import { ipcMain, type IpcMainEvent, type WebContents } from 'electron'
import { Schema } from 'effect'
import {
  IPC_METHODS,
  IPC_RENDERER_EVENTS,
  type IpcMainEvent as MainEventPayload,
  type IpcMainEventChannel,
  type IpcMethodChannel,
  type IpcRendererEvent as RendererEventPayload,
  type IpcRendererEventChannel,
  type IpcRequest,
  type IpcResult
} from '../shared/ipc'

export function handleIpc<C extends IpcMethodChannel>(
  channel: C,
  handler: (...request: IpcRequest<C>) => IpcResult<C> | Promise<IpcResult<C>>
): () => void {
  const decode = Schema.decodeUnknownSync(IPC_METHODS[channel].request)
  ipcMain.handle(channel, (_event, ...request) => handler(...decode(request)))
  return () => ipcMain.removeHandler(channel)
}

export function sendMainEvent<C extends IpcMainEventChannel>(
  target: WebContents,
  channel: C,
  ...payload: MainEventPayload<C>
): void {
  target.send(channel, ...payload)
}

export function onRendererEvent<C extends IpcRendererEventChannel>(
  channel: C,
  handler: (event: IpcMainEvent, ...payload: RendererEventPayload<C>) => void,
  options?: { once: true }
): () => void {
  const decode = Schema.decodeUnknownSync(IPC_RENDERER_EVENTS[channel])
  const listener = (event: IpcMainEvent, ...payload: unknown[]): void =>
    handler(event, ...decode(payload))
  if (options?.once) ipcMain.once(channel, listener)
  else ipcMain.on(channel, listener)
  return () => ipcMain.removeListener(channel, listener)
}
