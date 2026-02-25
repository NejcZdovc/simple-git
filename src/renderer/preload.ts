import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('git', {
  // Store
  getProjects: () => ipcRenderer.invoke('store:get-projects'),
  addProject: (path: string, name: string) => ipcRenderer.invoke('store:add-project', path, name),
  removeProject: (path: string) => ipcRenderer.invoke('store:remove-project', path),
  setLastProject: (path: string) => ipcRenderer.invoke('store:set-last-project', path),
  getSettings: () => ipcRenderer.invoke('store:get-settings'),
  updateSettings: (partial: Record<string, unknown>) => ipcRenderer.invoke('store:update-settings', partial),

  // Dialog
  openFolder: () => ipcRenderer.invoke('dialog:open-folder'),

  // Git
  openRepo: (path: string) => ipcRenderer.invoke('git:open-repo', path),
  getBranches: () => ipcRenderer.invoke('git:get-branches'),
  getLocalChanges: () => ipcRenderer.invoke('git:get-local-changes'),
  getLocalChangesWithStats: () => ipcRenderer.invoke('git:get-local-changes-with-stats'),
  getLocalFileDiff: (filePath: string) => ipcRenderer.invoke('git:get-local-file-diff', filePath),
  discardLocalChanges: () => ipcRenderer.invoke('git:discard-local-changes'),
  checkoutBranch: (branch: string) => ipcRenderer.invoke('git:checkout-branch', branch),
  stashAndCheckout: (branch: string) => ipcRenderer.invoke('git:stash-and-checkout', branch),
  discardAndCheckout: (branch: string) => ipcRenderer.invoke('git:discard-and-checkout', branch),
  getLog: (branch: string, page: number, pageSize: number) => ipcRenderer.invoke('git:get-log', branch, page, pageSize),
  getCommitFiles: (hash: string) => ipcRenderer.invoke('git:get-commit-files', hash),
  getFileDiff: (hash: string, filePath: string) => ipcRenderer.invoke('git:get-file-diff', hash, filePath),
  revertFile: (hash: string, filePath: string) => ipcRenderer.invoke('git:revert-file', hash, filePath),
  dropCommit: (hash: string) => ipcRenderer.invoke('git:drop-commit', hash),
  squashCommits: (hashes: string[], message: string) => ipcRenderer.invoke('git:squash-commits', hashes, message),
  getCommitMessage: (hash: string) => ipcRenderer.invoke('git:get-commit-message', hash),
  writeFileContent: (filePath: string, content: string) =>
    ipcRenderer.invoke('git:write-file-content', filePath, content),
  commitAll: (message: string, amend?: boolean) => ipcRenderer.invoke('git:commit-all', message, !!amend),
  commitFiles: (files: string[], message: string, amend?: boolean) =>
    ipcRenderer.invoke('git:commit-files', files, message, !!amend),
  pushToOrigin: () => ipcRenderer.invoke('git:push-to-origin'),
  forcePushToOrigin: () => ipcRenderer.invoke('git:force-push-to-origin'),
  pullRebase: () => ipcRenderer.invoke('git:pull-rebase'),

  // Events
  onOpenSettings: (callback: () => void) => {
    ipcRenderer.removeAllListeners('open-settings')
    ipcRenderer.on('open-settings', () => callback())
  },
  onGitChanged: (callback: () => void) => {
    ipcRenderer.removeAllListeners('git:changed')
    ipcRenderer.on('git:changed', () => callback())
  },
})
