import { app, Menu } from 'electron'
import {
  checkForUpdates,
  checkForUpdatesSilently,
  getPendingVersion,
  initAutoUpdater,
  quitAndInstall,
} from './auto-updater'
import { fixPath } from './fix-path'
import { registerIpcHandlers } from './ipc-handlers'
import { createMainWindow } from './window-manager'

// Electron apps launched from Finder on macOS get a minimal PATH that
// excludes /usr/local/bin and /opt/homebrew/bin where tools like gpg live.
fixPath()

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
        {
          label: `About ${app.name}`,
          click: () => {
            app.showAboutPanel()
            checkForUpdatesSilently()
          },
        },
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
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
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
