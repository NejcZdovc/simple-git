import { BrowserWindow, dialog, ipcMain } from 'electron'
import { quitAndInstall } from './auto-updater'
import {
  checkoutBranch,
  commitAll,
  commitFiles,
  discardAndCheckout,
  discardLocalChanges,
  dropCommit,
  forcePushToOrigin,
  getBranches,
  getCommitFiles,
  getCommitMessage,
  getFileDiff,
  getLocalChanges,
  getLocalChangesWithStats,
  getLocalFileDiff,
  getLog,
  openRepo,
  pullRebase,
  pushToOrigin,
  revertFile,
  setOnGitChange,
  squashCommits,
  stashAndCheckout,
  withSuppressedWatcher,
  writeFileContent,
} from './git-service'
import { addProject, getProjects, getSettings, removeProject, setLastProject, updateSettings } from './store'

function registerIpcHandlers(): void {
  // Git file watcher — notify all renderer windows on external changes
  setOnGitChange(() => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('git:changed')
    }
  })
  // Store
  ipcMain.handle('store:get-projects', () => getProjects())
  ipcMain.handle('store:add-project', (_e, path: string, name: string) => addProject(path, name))
  ipcMain.handle('store:remove-project', (_e, path: string) => removeProject(path))
  ipcMain.handle('store:set-last-project', (_e, path: string) => setLastProject(path))
  ipcMain.handle('store:get-settings', () => getSettings())
  ipcMain.handle('store:update-settings', (_e, partial: Record<string, unknown>) => updateSettings(partial))

  // Dialog
  ipcMain.handle('dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  // Git
  ipcMain.handle('git:open-repo', (_e, path: string) => openRepo(path))
  ipcMain.handle('git:get-branches', () => getBranches())
  ipcMain.handle('git:get-local-changes', () => getLocalChanges())
  ipcMain.handle('git:get-local-changes-with-stats', () => getLocalChangesWithStats())
  ipcMain.handle('git:get-local-file-diff', (_e, filePath: string) => getLocalFileDiff(filePath))
  ipcMain.handle('git:discard-local-changes', () => withSuppressedWatcher(() => discardLocalChanges()))
  ipcMain.handle('git:checkout-branch', (_e, branch: string) => withSuppressedWatcher(() => checkoutBranch(branch)))
  ipcMain.handle('git:stash-and-checkout', (_e, branch: string) =>
    withSuppressedWatcher(() => stashAndCheckout(branch)),
  )
  ipcMain.handle('git:discard-and-checkout', (_e, branch: string) =>
    withSuppressedWatcher(() => discardAndCheckout(branch)),
  )
  ipcMain.handle('git:get-log', (_e, branch: string, page: number, pageSize: number) => getLog(branch, page, pageSize))
  ipcMain.handle('git:get-commit-files', (_e, hash: string) => getCommitFiles(hash))
  ipcMain.handle('git:get-file-diff', (_e, hash: string, filePath: string) => getFileDiff(hash, filePath))
  ipcMain.handle('git:revert-file', (_e, hash: string, filePath: string) =>
    withSuppressedWatcher(() => revertFile(hash, filePath)),
  )
  ipcMain.handle('git:drop-commit', (_e, hash: string) => withSuppressedWatcher(() => dropCommit(hash)))
  ipcMain.handle('git:squash-commits', (_e, hashes: string[], message: string) =>
    withSuppressedWatcher(() => squashCommits(hashes, message)),
  )
  ipcMain.handle('git:get-commit-message', (_e, hash: string) => getCommitMessage(hash))
  ipcMain.handle('git:write-file-content', (_e, filePath: string, content: string) =>
    writeFileContent(filePath, content),
  )
  ipcMain.handle('git:commit-all', (_e, message: string, amend: boolean) =>
    withSuppressedWatcher(() => commitAll(message, amend)),
  )
  ipcMain.handle('git:commit-files', (_e, files: string[], message: string, amend: boolean) =>
    withSuppressedWatcher(() => commitFiles(files, message, amend)),
  )
  ipcMain.handle('git:push-to-origin', () => withSuppressedWatcher(() => pushToOrigin()))
  ipcMain.handle('git:force-push-to-origin', () => withSuppressedWatcher(() => forcePushToOrigin()))
  ipcMain.handle('git:pull-rebase', () => withSuppressedWatcher(() => pullRebase()))

  // App
  ipcMain.handle('app:quit-and-install', () => quitAndInstall())
}

export { registerIpcHandlers }
