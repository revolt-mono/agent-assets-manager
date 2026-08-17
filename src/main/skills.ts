import { BrowserWindow, ipcMain } from 'electron'
import { parseAgent } from '../shared/skill'
import {
  getSkill,
  listSkills,
  openSkill,
  revealSkill,
  uninstallSkill,
  watchCodexSkills
} from './codex-skills'

const catalogs = {
  codex: {
    list: listSkills,
    get: getSkill,
    uninstall: uninstallSkill,
    open: openSkill,
    reveal: revealSkill
  }
}

export function registerSkills(): () => void {
  ipcMain.handle('skills:list', (_event, agent) => catalogs[parseAgent(agent)].list())
  ipcMain.handle('skills:get', (_event, agent, id) => catalogs[parseAgent(agent)].get(id))
  ipcMain.handle('skills:uninstall', (_event, agent, id) =>
    catalogs[parseAgent(agent)].uninstall(id)
  )
  ipcMain.handle('skills:open', (_event, agent, id) => catalogs[parseAgent(agent)].open(id))
  ipcMain.handle('skills:reveal', (_event, agent, id) => catalogs[parseAgent(agent)].reveal(id))

  return watchCodexSkills(() => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('skills:changed')
    }
  })
}
