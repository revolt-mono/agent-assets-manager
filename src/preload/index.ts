import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { SkillsApi } from '../shared/skill'

const api: { skills: SkillsApi } = {
  skills: {
    list: (agent) => ipcRenderer.invoke('skills:list', agent),
    get: (agent, id) => ipcRenderer.invoke('skills:get', agent, id),
    setEnabled: (agent, id, enabled) => ipcRenderer.invoke('skills:setEnabled', agent, id, enabled),
    uninstall: (agent, id) => ipcRenderer.invoke('skills:uninstall', agent, id),
    open: (agent, id) => ipcRenderer.invoke('skills:open', agent, id),
    reveal: (agent, id) => ipcRenderer.invoke('skills:reveal', agent, id),
    onChanged: (callback) => {
      ipcRenderer.on('skills:changed', callback)
      return () => {
        ipcRenderer.removeListener('skills:changed', callback)
      }
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
