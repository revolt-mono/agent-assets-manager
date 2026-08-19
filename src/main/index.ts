import { app, shell, BrowserWindow, Menu, type BrowserWindowConstructorOptions } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerConfig } from './config'
import { registerSkills } from './skills'
import { registerUpdater } from './updater'
import { registerUsage } from './usage'

function createWindow(): void {
  const options: BrowserWindowConstructorOptions = {
    width: 1070,
    height: 760,
    minWidth: 1070,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    title: 'Skills',
    backgroundColor: '#f4f4f5',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  }
  if (process.platform === 'linux') options.icon = icon
  if (process.platform === 'darwin') {
    options.titleBarStyle = 'hidden'
    options.trafficLightPosition = { x: 16, y: 16 }
  }
  const mainWindow = new BrowserWindow(options)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  // dev keeps electron's default menu (devtools, reload); prod gets a
  // trimmed menu without Services and the View menu's developer items,
  // keeping fileMenu (Cmd+W) and the View zoom/fullscreen roles
  if (!is.dev) {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        },
        { role: 'fileMenu' },
        { role: 'editMenu' },
        {
          label: 'View',
          submenu: [
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
          ]
        },
        { role: 'windowMenu' }
      ])
    )
  }

  // Packaged builds get the icon from icon.icns; dev runs the stock
  // Electron binary, so set the dock icon manually.
  if (is.dev && process.platform === 'darwin') app.dock?.setIcon(icon)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const stopSkills = registerSkills()
  const stopConfig = registerConfig()
  registerUsage()
  registerUpdater()
  app.on('will-quit', () => {
    stopSkills()
    stopConfig()
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
