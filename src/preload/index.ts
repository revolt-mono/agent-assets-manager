import { contextBridge, ipcRenderer } from 'electron'
import type { RendererApi } from '../shared/skill'

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
    get: () => ipcRenderer.invoke('config:get'),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
    setFeature: (key, enabled) => ipcRenderer.invoke('config:set-feature', key, enabled),
    onChanged: (callback) => {
      ipcRenderer.on('config:changed', callback)
      return () => {
        ipcRenderer.removeListener('config:changed', callback)
      }
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
