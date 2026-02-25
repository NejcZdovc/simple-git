import path from 'node:path'
import { BrowserWindow, nativeImage, screen } from 'electron'
import { getWindowState, saveWindowState } from './store'

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined

let mainWindow: BrowserWindow | null = null

function isOnScreen(x: number, y: number, width: number, height: number): boolean {
  const displays = screen.getAllDisplays()
  return displays.some((display) => {
    const { x: dx, y: dy, width: dw, height: dh } = display.bounds
    // At least 100px of the window must overlap a display
    const overlapX = Math.max(0, Math.min(x + width, dx + dw) - Math.max(x, dx))
    const overlapY = Math.max(0, Math.min(y + height, dy + dh) - Math.max(y, dy))
    return overlapX > 100 && overlapY > 100
  })
}

function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }

  const saved = getWindowState()
  const display = screen.getPrimaryDisplay()
  const workArea = display.workArea

  let windowOpts: { x?: number; y?: number; width: number; height: number } = {
    width: Math.min(1400, workArea.width),
    height: Math.min(900, workArea.height),
  }

  if (saved && isOnScreen(saved.x, saved.y, saved.width, saved.height)) {
    windowOpts = { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
  }

  const iconPath = path.join(__dirname, '../../assets/icon.png')

  mainWindow = new BrowserWindow({
    ...windowOpts,
    minWidth: 1000,
    minHeight: 600,
    title: 'Simple Git',
    icon: nativeImage.createFromPath(iconPath),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#1e1e1e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (saved?.isMaximized) {
    mainWindow.maximize()
  }

  mainWindow.show()

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/main_window/index.html`)
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/main_window/main_window/index.html`))
  }

  mainWindow.on('close', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const isMaximized = mainWindow.isMaximized()
    const bounds = mainWindow.getNormalBounds()
    saveWindowState({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    })
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

export { createMainWindow }
