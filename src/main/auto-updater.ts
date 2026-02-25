import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 60_000
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

let pendingVersion: string | null = null
let onUpdateDownloaded: (() => void) | null = null
let userInitiated = false
let retryCount = 0

function scheduleRetry(): void {
  if (retryCount >= MAX_RETRIES) return
  retryCount++
  console.log(`Auto-updater: retry ${retryCount}/${MAX_RETRIES} in ${RETRY_DELAY_MS / 1000}s`)
  setTimeout(() => autoUpdater.checkForUpdates(), RETRY_DELAY_MS)
}

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
    } else {
      scheduleRetry()
    }
  })

  autoUpdater.on('update-not-available', () => {
    retryCount = 0
    if (userInitiated) {
      userInitiated = false
      dialog.showMessageBox({
        type: 'info',
        title: 'No Updates',
        message: `You're using the latest version (${app.getVersion()})`,
      })
    }
  })

  autoUpdater.on('update-available', () => {
    retryCount = 0
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

  setInterval(() => {
    if (!pendingVersion) {
      autoUpdater.checkForUpdates()
    }
  }, CHECK_INTERVAL_MS)
}

function checkForUpdates(): void {
  userInitiated = true
  autoUpdater.checkForUpdates()
}

function checkForUpdatesSilently(): void {
  if (!app.isPackaged || pendingVersion) return
  autoUpdater.checkForUpdates()
}

function getPendingVersion(): string | null {
  return pendingVersion
}

function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}

export { checkForUpdates, checkForUpdatesSilently, getPendingVersion, initAutoUpdater, quitAndInstall }
