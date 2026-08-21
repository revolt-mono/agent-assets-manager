import { once } from 'node:events'
import type { BrowserWindow } from 'electron'
import { onRendererEvent } from './ipc'

export async function profileBoot(mainWindow: BrowserWindow): Promise<void> {
  const processStartedAt = Math.round(process.getCreationTime() ?? Date.now())
  const [navigationStartedAt, domReadyAt, rendererFrameAt, windowShownAt] = await Promise.all([
    once(mainWindow.webContents, 'did-start-navigation').then(() => Date.now()),
    once(mainWindow.webContents, 'dom-ready').then(() => Date.now()),
    new Promise<number>((resolve) => {
      onRendererEvent('renderer:ready', () => resolve(Date.now()), { once: true })
    }),
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
