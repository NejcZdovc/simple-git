import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

let pendingVersion: string | null = null
let onUpdateDownloaded: (() => void) | null = null

function initAutoUpdater(onReady: () => void): void {
  onUpdateDownloaded = onReady

  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', (info) => {
    pendingVersion = info.version
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('app:update-ready')
    }
    onUpdateDownloaded?.()
  })

  autoUpdater.checkForUpdates()
}

function checkForUpdates(): void {
  autoUpdater.checkForUpdates()
}

function getPendingVersion(): string | null {
  return pendingVersion
}

function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}

export { checkForUpdates, getPendingVersion, initAutoUpdater, quitAndInstall }
