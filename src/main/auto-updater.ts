import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

let pendingVersion: string | null = null
let onUpdateDownloaded: (() => void) | null = null
let userInitiated = false

function initAutoUpdater(onReady: () => void): void {
  onUpdateDownloaded = onReady

  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'NejcZdovc',
    repo: 'simple-git',
  })

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err.message)
    if (userInitiated) {
      userInitiated = false
      dialog.showMessageBox({
        type: 'error',
        title: 'Update Error',
        message: 'Failed to check for updates',
        detail: err.message,
      })
    }
  })

  autoUpdater.on('update-not-available', () => {
    if (userInitiated) {
      userInitiated = false
      dialog.showMessageBox({
        type: 'info',
        title: 'No Updates',
        message: `You're using the latest version (${app.getVersion()})`,
      })
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    pendingVersion = info.version
    userInitiated = false
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('app:update-ready')
    }
    onUpdateDownloaded?.()
  })

  autoUpdater.checkForUpdates()
}

function checkForUpdates(): void {
  userInitiated = true
  autoUpdater.checkForUpdates()
}

function getPendingVersion(): string | null {
  return pendingVersion
}

function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}

export { checkForUpdates, getPendingVersion, initAutoUpdater, quitAndInstall }
