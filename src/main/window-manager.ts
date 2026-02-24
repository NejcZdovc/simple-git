import path from 'node:path'
import { BrowserWindow, nativeImage, screen } from 'electron'

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined

let mainWindow: BrowserWindow | null = null

function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }

  const DESIRED_WIDTH = 1400
  const DESIRED_HEIGHT = 900
  const display = screen.getPrimaryDisplay()
  const workArea = display.workArea
  const width = Math.min(DESIRED_WIDTH, workArea.width)
  const height = Math.min(DESIRED_HEIGHT, workArea.height)

  const iconPath = path.join(__dirname, '../../assets/icon.png')

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1000,
    minHeight: 600,
    title: 'Simple Git',
    icon: nativeImage.createFromPath(iconPath),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/main_window/index.html`)
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/main_window/main_window/index.html`))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

export { createMainWindow }
