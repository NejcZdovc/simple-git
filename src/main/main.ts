import { app, Menu } from 'electron'
import { checkForUpdates, getPendingVersion, initAutoUpdater, quitAndInstall } from './auto-updater'
import { registerIpcHandlers } from './ipc-handlers'
import { createMainWindow } from './window-manager'

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

app.on('second-instance', () => {
  createMainWindow()
})

function buildMenu() {
  const pendingVersion = getPendingVersion()

  const updateMenuItem: Electron.MenuItemConstructorOptions = pendingVersion
    ? {
        label: `Upgrade to ${pendingVersion}`,
        click: () => quitAndInstall(),
      }
    : {
        label: 'Check for Updates...',
        click: () => checkForUpdates(),
      }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        updateMenuItem,
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'Cmd+,',
          click: () => {
            const win = createMainWindow()
            win.webContents.send('open-settings')
          },
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  // Build app menu
  buildMenu()

  // Register IPC handlers
  registerIpcHandlers()

  // Create main window
  createMainWindow()

  // Check for updates (rebuild menu when update is downloaded)
  initAutoUpdater(() => buildMenu())
})

app.on('window-all-closed', () => {
  app.quit()
})
