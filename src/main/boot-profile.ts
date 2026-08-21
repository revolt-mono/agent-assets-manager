import { once } from 'node:events'
import { ipcMain, type BrowserWindow } from 'electron'

export async function profileBoot(mainWindow: BrowserWindow): Promise<void> {
  const processStartedAt = Math.round(process.getCreationTime() ?? Date.now())
  const [navigationStartedAt, domReadyAt, rendererFrameAt, windowShownAt] = await Promise.all([
    once(mainWindow.webContents, 'did-start-navigation').then(() => Date.now()),
    once(mainWindow.webContents, 'dom-ready').then(() => Date.now()),
    once(ipcMain, 'renderer:ready').then(() => Date.now()),
    once(mainWindow, 'show').then(() => Date.now())
  ])

  console.info('boot-profile', {
    processToNavigationMs: navigationStartedAt - processStartedAt,
    navigationToDomReadyMs: domReadyAt - navigationStartedAt,
    domReadyToRendererFrameMs: rendererFrameAt - domReadyAt,
    processToWindowShownMs: windowShownAt - processStartedAt,
    totalMs: Math.max(rendererFrameAt, windowShownAt) - processStartedAt
  })
}
