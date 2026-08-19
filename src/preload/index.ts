import { contextBridge, ipcRenderer } from 'electron'
import type { AgentId } from '../shared/agent'
import type { RendererApi } from '../shared/api'
import type { UpdateState } from '../shared/update'

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
  },
  update: {
    observe: (callback) => {
      let observing = true
      let receivedUpdate = false
      const listener = (_event: Electron.IpcRendererEvent, state: UpdateState): void => {
        receivedUpdate = true
        callback(state)
      }
      ipcRenderer.on('update:changed', listener)
      void ipcRenderer.invoke('update:get').then((state: UpdateState) => {
        if (observing && !receivedUpdate) callback(state)
      })
      return () => {
        observing = false
        ipcRenderer.removeListener('update:changed', listener)
      }
    },
    proceed: () => ipcRenderer.send('update:proceed')
  }
}

contextBridge.exposeInMainWorld('api', api)
