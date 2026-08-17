import { BrowserWindow, ipcMain } from 'electron'
import { parseAgent } from '../shared/skill'
import {
  getSkill,
  listSkills,
  openSkill,
  revealSkill,
  setSkillEnabled,
  uninstallSkill,
  watchCodexSkills
} from './codex-skills'

const catalogs = {
  codex: {
    list: listSkills,
    get: getSkill,
    setEnabled: setSkillEnabled,
    uninstall: uninstallSkill,
    open: openSkill,
    reveal: revealSkill
  }
}

export function registerSkills(): () => void {
  ipcMain.handle('skills:list', (_event, agent) => catalogs[parseAgent(agent)].list())
  ipcMain.handle('skills:get', (_event, agent, id) => catalogs[parseAgent(agent)].get(id))
  ipcMain.handle('skills:setEnabled', (_event, agent, id, enabled) =>
    catalogs[parseAgent(agent)].setEnabled(id, enabled)
  )
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
