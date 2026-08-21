import { contextBridge, ipcRenderer } from 'electron'
import type { RendererApi } from '../shared/api'
import type {
  IpcMainEvent,
  IpcMainEventChannel,
  IpcMethodChannel,
  IpcRendererEvent,
  IpcRendererEventChannel,
  IpcRequest,
  IpcResult
} from '../shared/ipc'

const invoke = <C extends IpcMethodChannel>(
  channel: C,
  ...request: IpcRequest<C>
): Promise<IpcResult<C>> => ipcRenderer.invoke(channel, ...request)

const listen = <C extends IpcMainEventChannel>(
  channel: C,
  callback: (...payload: IpcMainEvent<C>) => void
): (() => void) => {
  const listener = (_event: Electron.IpcRendererEvent, ...payload: IpcMainEvent<C>): void =>
    callback(...payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const send = <C extends IpcRendererEventChannel>(
  channel: C,
  ...payload: IpcRendererEvent<C>
): void => ipcRenderer.send(channel, ...payload)

window.addEventListener(
  'DOMContentLoaded',
  () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => send('renderer:ready'))
    })
  },
  { once: true }
)

const api: RendererApi = {
  platform:
    process.platform === 'darwin' || process.platform === 'win32' ? process.platform : 'other',
  skills: {
    list: (agent) => invoke('skills:list', agent),
    get: (agent, id) => invoke('skills:get', agent, id),
    uninstall: (agent, id) => invoke('skills:uninstall', agent, id),
    open: (agent, id) => invoke('skills:open', agent, id),
    reveal: (agent, id) => invoke('skills:reveal', agent, id),
    onChanged: (callback) => listen('skills:changed', callback)
  },
  config: {
    claude: {
      get: () => invoke('config:claude:get'),
      save: (values) => invoke('config:claude:save', values)
    },
    codex: {
      get: () => invoke('config:codex:get'),
      save: (values) => invoke('config:codex:save', values)
    },
    onChanged: (callback) => listen('config:changed', callback)
  },
  usage: {
    get: (fresh) => invoke('usage:get', fresh)
  },
  update: {
    observe: (callback) => {
      const stop = listen('update:changed', callback)
      // announce after attaching so main's current-state reply cannot be missed
      send('update:subscribe')
      return stop
    },
    proceed: () => send('update:proceed')
  }
}

contextBridge.exposeInMainWorld('api', api)
