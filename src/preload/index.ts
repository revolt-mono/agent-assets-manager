import { contextBridge, ipcRenderer } from 'electron'
import type { AgentId } from '../shared/agent'
import type { RendererApi } from '../shared/api'

const api: RendererApi = {
  platform:
    process.platform === 'darwin' || process.platform === 'win32' ? process.platform : 'other',
  skills: {
    list: (agent) => ipcRenderer.invoke('skills:list', agent),
    get: (agent, id) => ipcRenderer.invoke('skills:get', agent, id),
    uninstall: (agent, id) => ipcRenderer.invoke('skills:uninstall', agent, id),
    open: (agent, id) => ipcRenderer.invoke('skills:open', agent, id),
    reveal: (agent, id) => ipcRenderer.invoke('skills:reveal', agent, id),
    onChanged: (callback) => {
      ipcRenderer.on('skills:changed', callback)
      return () => {
        ipcRenderer.removeListener('skills:changed', callback)
      }
    }
  },
  config: {
    get: (agent) => ipcRenderer.invoke('config:get', agent),
    save: (agent, values) => ipcRenderer.invoke('config:save', agent, values),
    onChanged: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, agent: AgentId): void => callback(agent)
      ipcRenderer.on('config:changed', listener)
      return () => {
        ipcRenderer.removeListener('config:changed', listener)
      }
    }
  },
  usage: {
    get: (fresh) => ipcRenderer.invoke('usage:get', fresh)
  }
}

contextBridge.exposeInMainWorld('api', api)
