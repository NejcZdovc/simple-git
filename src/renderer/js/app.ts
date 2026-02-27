import * as branchSelector from './components/branch-selector'
import * as checkoutDialog from './components/checkout-dialog'
import type { PaletteItem } from './components/command-palette'
import * as commandPalette from './components/command-palette'
import * as commitList from './components/commit-list'
import * as diffViewer from './components/diff-viewer'
import * as fileSearch from './components/file-search'
import * as fileTree from './components/file-tree'
import * as projectSelector from './components/project-selector'
import * as settingsDialog from './components/settings-dialog'
import * as squashDialog from './components/squash-dialog'
import * as toast from './components/toast'
import type { CommitInfo } from './types'

const PAGE_SIZE = 50
let currentPage = 0
let currentCommit: CommitInfo | null = null
let currentFilePath: string | null = null
let allCommits: CommitInfo[] = []
let activePanel: 'commits' | 'files' | 'diff' = 'commits'
let confirmedLargeFile: string | null = null
let viewMode: 'commits' | 'local-changes' = 'commits'
let commitSelectedBtn: HTMLButtonElement | null = null
let diffVersion = 0
let localChangesVersion = 0

const panelIds: Record<string, string> = {
  commits: 'commit-list-panel',
  files: 'file-tree-panel',
  diff: 'diff-viewer-panel',
}

function setActivePanel(panel: 'commits' | 'files' | 'diff') {
  if (activePanel !== panel) {
    const prev = document.getElementById(panelIds[activePanel])
    prev?.classList.remove('panel-focused')
  }
  activePanel = panel
  const next = document.getElementById(panelIds[panel])
  next?.classList.add('panel-focused')
}

// Local changes mode DOM elements
const localChangesBtn = document.getElementById('local-changes-btn')!
const commitsBtn = document.getElementById('commits-btn')!
const commitListEl = document.getElementById('commit-list')!
const localChangesListEl = document.getElementById('local-changes-list')!
const loadMoreContainer = document.getElementById('load-more-container')!
const commitCountEl = document.getElementById('commit-count')!

const activeBtnClasses = ['bg-accent/15', 'text-accent']
const inactiveBtnClasses = ['bg-transparent', 'text-text-secondary']

function setViewMode(mode: 'commits' | 'local-changes') {
  viewMode = mode

  if (mode === 'local-changes') {
    commitsBtn.classList.remove(...activeBtnClasses)
    commitsBtn.classList.add(...inactiveBtnClasses)
    localChangesBtn.classList.remove(...inactiveBtnClasses)
    localChangesBtn.classList.add(...activeBtnClasses)
    commitListEl.classList.add('hidden')
    loadMoreContainer.classList.add('hidden')
    localChangesListEl.classList.remove('hidden')
    commitCountEl.textContent = ''
  } else {
    localChangesBtn.classList.remove(...activeBtnClasses)
    localChangesBtn.classList.add(...inactiveBtnClasses)
    commitsBtn.classList.remove(...inactiveBtnClasses)
    commitsBtn.classList.add(...activeBtnClasses)
    localChangesListEl.classList.add('hidden')
    commitListEl.classList.remove('hidden')
  }
}

localChangesBtn.addEventListener('click', () => {
  if (viewMode === 'local-changes') return
  setViewMode('local-changes')
  setActivePanel('commits')
  fileTree.setMultiSelect(true)
  window.git.startWorktreeWatcher()
  loadLocalChanges()
})

commitsBtn.addEventListener('click', () => {
  if (viewMode === 'commits') return
  setViewMode('commits')
  setActivePanel('commits')
  fileTree.setMultiSelect(false)
  window.git.stopWorktreeWatcher()
  currentFilePath = null
  if (allCommits.length > 0) {
    commitList.selectByIndex(0)
  } else {
    fileTree.clear()
    diffViewer.clear()
  }
})

async function loadLocalChanges() {
  const version = ++localChangesVersion

  try {
    const [files, settings] = await Promise.all([window.git.getLocalChangesWithStats(), window.git.getSettings()])
    const isAmend = settings.commitMode === 'amend'

    // Discard stale result if a newer load was requested
    if (version !== localChangesVersion) return

    currentCommit = null
    currentFilePath = null
    confirmedLargeFile = null
    fileTree.clear()
    diffViewer.clear()

    if (files.length === 0) {
      localChangesListEl.innerHTML =
        '<div class="flex items-center justify-center h-full text-text-muted text-sm">No local changes</div>'
      fileTree.setFiles([], null)
      commitSelectedBtn = null
      return
    }

    fileTree.setFiles(files, null)

    // Skip commit UI rebuild if it already exists (watcher triggers only need file tree update)
    if (localChangesListEl.querySelector('textarea')) return

    localChangesListEl.innerHTML = ''

    const container = document.createElement('div')
    container.className = 'flex flex-col gap-2 p-3 h-full'

    const textarea = document.createElement('textarea')
    textarea.className =
      'w-full min-h-[120px] max-h-[300px] px-3 py-2.5 border border-border rounded-sm bg-bg-primary text-text-primary font-mono text-[13px] leading-relaxed resize-y outline-none focus:border-accent'
    textarea.placeholder = isAmend ? 'Amend commit message...' : 'Commit message...'
    container.appendChild(textarea)

    if (isAmend) {
      try {
        const lastMessage = await window.git.getCommitMessage('HEAD')
        if (version === localChangesVersion) {
          textarea.value = lastMessage
        }
      } catch {
        // No commits yet — leave empty
      }
    }

    const btnRow = document.createElement('div')
    btnRow.className = 'flex gap-2'

    const commitAllBtn = document.createElement('button')
    commitAllBtn.type = 'button'
    commitAllBtn.className =
      'flex-1 py-[7px] border-none rounded-sm text-[13px] font-medium cursor-pointer transition-all duration-150 font-[inherit] bg-accent text-white hover:bg-accent-hover'
    commitAllBtn.textContent = isAmend ? 'Amend All' : 'Commit All'

    const commitSelBtn = document.createElement('button')
    commitSelBtn.type = 'button'
    commitSelBtn.className =
      'flex-1 py-[7px] border-none rounded-sm text-[13px] font-medium cursor-pointer transition-all duration-150 font-[inherit] bg-bg-card text-text-primary hover:bg-bg-card-hover disabled:opacity-50 disabled:cursor-default'
    const selLabel = isAmend ? 'Amend Selected' : 'Commit Selected'
    commitSelBtn.textContent = selLabel
    commitSelBtn.dataset.baseLabel = selLabel
    commitSelBtn.disabled = true
    commitSelectedBtn = commitSelBtn

    btnRow.appendChild(commitAllBtn)
    btnRow.appendChild(commitSelBtn)
    container.appendChild(btnRow)
    localChangesListEl.appendChild(container)

    commitAllBtn.addEventListener('click', async () => {
      const message = textarea.value.trim()
      if (!message) {
        alert('Please enter a commit message')
        return
      }
      try {
        await window.git.commitAll(message, isAmend)
        textarea.value = ''
        commitSelectedBtn = null
        localChangesListEl.innerHTML = ''
        await loadLocalChanges()
        await refreshCommitList()
        toast.show(isAmend ? 'Commit amended successfully' : 'Changes committed successfully')
      } catch (err) {
        alert(`${isAmend ? 'Amend' : 'Commit'} failed: ${err}`)
      }
    })

    commitSelBtn.addEventListener('click', async () => {
      const message = textarea.value.trim()
      if (!message) {
        alert('Please enter a commit message')
        return
      }
      const selected = fileTree.getSelectedFiles()
      if (selected.length === 0) return
      try {
        await window.git.commitFiles(selected, message, isAmend)
        textarea.value = ''
        commitSelectedBtn = null
        localChangesListEl.innerHTML = ''
        await loadLocalChanges()
        await refreshCommitList()
        toast.show(isAmend ? 'Commit amended successfully' : 'Changes committed successfully')
      } catch (err) {
        alert(`${isAmend ? 'Amend' : 'Commit'} failed: ${err}`)
      }
    })
  } catch (err) {
    console.error('Failed to load local changes:', err)
  }
}

// Wire up project selector
projectSelector.setOnProjectChange(async (path) => {
  await openProject(path)
})

// Wire up branch selector
branchSelector.setOnBranchChange(async (name) => {
  try {
    const changes = await window.git.getLocalChanges()
    if (changes.length > 0) {
      checkoutDialog.show(name, changes, async (action) => {
        if (action === 'cancel') return
        try {
          if (action === 'discard') {
            await window.git.discardAndCheckout(name)
          } else {
            await window.git.stashAndCheckout(name)
          }
          const { branches, current } = await window.git.getBranches()
          branchSelector.setBranches(branches, current)
          await loadLog(current)
        } catch (err) {
          console.error('Failed to switch branch:', err)
          alert(`Failed to switch branch: ${err}`)
        }
      })
      return
    }
    await window.git.checkoutBranch(name)
    const { branches, current } = await window.git.getBranches()
    branchSelector.setBranches(branches, current)
    await loadLog(current)
  } catch (err) {
    console.error('Failed to checkout branch:', err)
    alert(`Failed to switch branch: ${err}`)
  }
})

// Wire up commit list
commitList.setCallbacks({
  onCommitSelect: async (hash) => {
    currentCommit = allCommits.find((c) => c.hash === hash) || null
    currentFilePath = null
    try {
      const files = await window.git.getCommitFiles(hash)
      fileTree.setFiles(files, currentCommit)
      diffViewer.clear()
    } catch (err) {
      console.error('Failed to get commit files:', err)
    }
  },
  onDropCommit: async (hash) => {
    if (!confirm('Are you sure you want to drop this commit?')) return
    try {
      await window.git.dropCommit(hash)
      await reloadLog()
    } catch (err) {
      console.error('Failed to drop commit:', err)
      alert(`Failed to drop commit: ${err}`)
    }
  },
  onSquashCommits: async (hashes) => {
    // Gather messages for all selected commits
    const messages: string[] = []
    for (const h of hashes) {
      try {
        const msg = await window.git.getCommitMessage(h)
        messages.push(msg)
      } catch {
        messages.push('')
      }
    }
    const combined = messages.filter(Boolean).join('\n\n')
    squashDialog.show(hashes.length, combined, async (message) => {
      try {
        await window.git.squashCommits(hashes, message)
        await reloadLog()
      } catch (err) {
        console.error('Failed to squash commits:', err)
        alert(`Failed to squash commits: ${err}`)
      }
    })
  },
  onLoadMore: async () => {
    currentPage++
    const branch = branchSelector.getCurrentBranch()
    try {
      const { commits, total } = await window.git.getLog(branch, currentPage, PAGE_SIZE)
      allCommits = [...allCommits, ...commits]
      commitList.setCommits(allCommits, total, true)
    } catch (err) {
      console.error('Failed to load more commits:', err)
    }
  },
})

// Wire up file tree
fileTree.setCallbacks({
  onFileSelect: async (path) => {
    if (viewMode === 'local-changes') {
      currentFilePath = path
      confirmedLargeFile = null
      await showCurrentDiff()
      return
    }
    if (!currentCommit) return
    currentFilePath = path
    confirmedLargeFile = null
    await showCurrentDiff()
  },
  onFileRevert: async (path) => {
    if (!currentCommit) return
    try {
      await window.git.revertFile(currentCommit.hash, path)
      const files = await window.git.getCommitFiles(currentCommit.hash)
      fileTree.setFiles(files, currentCommit)
    } catch (err) {
      console.error('Failed to revert file:', err)
      alert(`Failed to revert file: ${err}`)
    }
  },
  onFolderRevert: async (folderPath) => {
    if (!currentCommit) return
    try {
      await window.git.revertFolder(currentCommit.hash, folderPath)
      const files = await window.git.getCommitFiles(currentCommit.hash)
      fileTree.setFiles(files, currentCommit)
    } catch (err) {
      console.error('Failed to revert folder:', err)
      alert(`Failed to revert folder: ${err}`)
    }
  },
  onSelectionChange: (paths) => {
    if (commitSelectedBtn) {
      const label = commitSelectedBtn.dataset.baseLabel || 'Commit Selected'
      if (paths.length === 0) {
        commitSelectedBtn.disabled = true
        commitSelectedBtn.textContent = label
      } else {
        commitSelectedBtn.disabled = false
        commitSelectedBtn.textContent = `${label} (${paths.length})`
      }
    }
    if (paths.length > 1) {
      diffViewer.clear()
    } else if (paths.length === 1) {
      // Deselected back to one file — show its diff
      currentFilePath = paths[0]
      confirmedLargeFile = null
      showCurrentDiff()
    }
  },
})

// Wire up diff viewer refresh callback
diffViewer.setOnRefreshDiff(() => {
  showCurrentDiff()
})

function countLines(content: string): number {
  if (!content) return 0
  return content.split('\n').length
}

async function showCurrentDiff() {
  if (!currentFilePath) return
  if (viewMode !== 'local-changes' && !currentCommit) return

  const version = ++diffVersion
  try {
    const diff =
      viewMode === 'local-changes'
        ? await window.git.getLocalFileDiff(currentFilePath)
        : await window.git.getFileDiff(currentCommit!.hash, currentFilePath)

    // Discard stale result if a newer diff was requested
    if (version !== diffVersion) return

    if (diff.tooLarge) {
      diffViewer.showTooLarge(diff.filePath)
      return
    }

    const lineCount = Math.max(countLines(diff.oldContent), countLines(diff.newContent))
    const fileKey =
      viewMode === 'local-changes' ? `local:${currentFilePath}` : `${currentCommit!.hash}:${currentFilePath}`
    if (lineCount > 2000 && confirmedLargeFile !== fileKey) {
      if (!confirm(`This file has ${lineCount} lines. Large diffs may be slow. Open anyway?`)) {
        diffViewer.clear()
        return
      }
      confirmedLargeFile = fileKey
    }

    await diffViewer.showDiff(diff, viewMode === 'local-changes' ? 'local' : currentCommit!.hash)
  } catch (err) {
    console.error('Failed to get file diff:', err)
  }
}

// Wire up settings
window.git.onOpenSettings(() => {
  settingsDialog.show()
})

// Watch for external git changes (commits, staging from terminal, other tools)
window.git.onGitChanged(async () => {
  const { branches, current } = await window.git.getBranches()
  const branchChanged = current !== branchSelector.getCurrentBranch()
  branchSelector.setBranches(branches, current)

  if (branchChanged) {
    await loadLog(current)
  } else {
    await refreshCommitList()
  }

  if (viewMode === 'local-changes') {
    await loadLocalChanges()
  }
})

settingsDialog.setOnDiffViewModeChange(() => {
  showCurrentDiff()
})

settingsDialog.setOnCommitModeChange(() => {
  if (viewMode === 'local-changes') {
    localChangesListEl.innerHTML = ''
    loadLocalChanges()
  }
})

// Resizable file tree panel
const resizeHandle = document.getElementById('resize-handle')!
const fileTreePanel = document.getElementById('file-tree-panel')!
const PANEL_WIDTH_KEY = 'file-tree-panel-width'

const savedWidth = localStorage.getItem(PANEL_WIDTH_KEY)
if (savedWidth) {
  fileTreePanel.style.width = `${savedWidth}px`
}

let resizing = false
let resizeStartX = 0
let resizeStartWidth = 0

resizeHandle.addEventListener('mousedown', (e) => {
  resizing = true
  resizeStartX = e.clientX
  resizeStartWidth = fileTreePanel.getBoundingClientRect().width
  document.body.classList.add('select-none')
  e.preventDefault()
})

document.addEventListener('mousemove', (e) => {
  if (!resizing) return
  const delta = e.clientX - resizeStartX
  const newWidth = Math.max(150, Math.min(600, resizeStartWidth + delta))
  fileTreePanel.style.width = `${newWidth}px`
})

document.addEventListener('mouseup', () => {
  if (!resizing) return
  const width = Math.round(fileTreePanel.getBoundingClientRect().width)
  localStorage.setItem(PANEL_WIDTH_KEY, String(width))
  resizing = false
  document.body.classList.remove('select-none')
})

async function openProject(path: string) {
  try {
    await window.git.openRepo(path)
    await window.git.setLastProject(path)
    projectSelector.setCurrentProject(path)

    const { branches, current } = await window.git.getBranches()
    branchSelector.setBranches(branches, current)

    await loadLog(current)
    fileTree.clear()
    diffViewer.clear()

    const changes = await window.git.getLocalChanges()
    if (changes.length > 0) {
      setViewMode('local-changes')
      fileTree.setMultiSelect(true)
      window.git.startWorktreeWatcher()
      loadLocalChanges()
    } else {
      setViewMode('commits')
      fileTree.setMultiSelect(false)
    }
  } catch (err) {
    console.error('Failed to open project:', err)
    alert(`Failed to open project: ${err}`)
  }
}

async function loadLog(branch: string) {
  currentPage = 0
  currentCommit = null
  currentFilePath = null
  try {
    const { commits, total } = await window.git.getLog(branch, 0, PAGE_SIZE)
    allCommits = commits
    commitList.setCommits(commits, total, false)
  } catch (err) {
    console.error('Failed to load log:', err)
  }
}

async function reloadLog() {
  const branch = branchSelector.getCurrentBranch()
  await loadLog(branch)
  fileTree.clear()
  diffViewer.clear()
}

async function refreshCommitList() {
  const branch = branchSelector.getCurrentBranch()
  currentPage = 0
  try {
    const { commits, total } = await window.git.getLog(branch, 0, PAGE_SIZE)
    allCommits = commits
    commitList.setCommits(commits, total, false)
  } catch (err) {
    console.error('Failed to refresh commit list:', err)
  }
}

// Wire up command palette
async function openCommandPalette() {
  const paletteItems: PaletteItem[] = []

  // Actions — only show the opposite of current mode, plus diff toggle
  try {
    await window.git.getBranches() // test if project is open
    if (viewMode === 'commits') {
      paletteItems.push({
        id: 'action:local-changes',
        label: 'View Working Copy',
        detail: 'Show uncommitted working tree changes',
        category: 'action',
        data: 'local-changes',
      })
    } else {
      paletteItems.push({
        id: 'action:commits',
        label: 'View History',
        detail: 'Show commit history',
        category: 'action',
        data: 'commits',
      })
    }
    const settings = await window.git.getSettings()
    if (settings.diffViewMode === 'full') {
      paletteItems.push({
        id: 'action:diff-minimal',
        label: 'Minimal Diff View',
        detail: 'Show changes only',
        category: 'action',
        data: 'diff-minimal',
      })
    } else {
      paletteItems.push({
        id: 'action:diff-full',
        label: 'Full Diff View',
        detail: 'Show full file',
        category: 'action',
        data: 'diff-full',
      })
    }
    if (settings.commitMode === 'commit') {
      paletteItems.push({
        id: 'action:commit-mode-amend',
        label: 'Switch to Amend Mode',
        detail: 'Amend the last commit instead of creating a new one',
        category: 'action',
        data: 'commit-mode-amend',
      })
    } else {
      paletteItems.push({
        id: 'action:commit-mode-commit',
        label: 'Switch to Commit Mode',
        detail: 'Create a new commit',
        category: 'action',
        data: 'commit-mode-commit',
      })
    }
    paletteItems.push({
      id: 'action:push-to-origin',
      label: 'Push to Origin',
      detail: 'Push current branch to origin',
      category: 'action',
      data: 'push-to-origin',
    })
    paletteItems.push({
      id: 'action:force-push-to-origin',
      label: 'Force Push to Origin',
      detail: 'Force push current branch to origin (--force-with-lease)',
      category: 'action',
      data: 'force-push-to-origin',
    })
  } catch {
    // ignore — no project open
  }

  // Projects — always available
  try {
    const store = await window.git.getProjects()
    for (const p of store.projects) {
      paletteItems.push({
        id: `project:${p.path}`,
        label: p.name,
        detail: p.path,
        category: 'project',
        data: p.path,
      })
    }
  } catch {
    // ignore
  }

  // Branches — available when a project is open
  try {
    const { branches } = await window.git.getBranches()
    for (const b of branches) {
      paletteItems.push({
        id: `branch:${b.name}`,
        label: b.name,
        detail: b.current ? 'current' : '',
        category: 'branch',
        data: b.name,
      })
    }
  } catch {
    // ignore — no project open
  }

  // Commits — available when a branch is loaded
  for (const c of allCommits) {
    paletteItems.push({
      id: `commit:${c.hash}`,
      label: c.message,
      detail: c.hash.slice(0, 7),
      category: 'commit',
      data: c.hash,
    })
  }

  // Files — available when a commit is selected
  const currentFiles = fileTree.getFiles()
  for (const f of currentFiles) {
    paletteItems.push({
      id: `file:${f.path}`,
      label: f.path.split('/').pop()!,
      detail: f.path,
      category: 'file',
      data: f.path,
    })
  }

  commandPalette.show(paletteItems)
}

commandPalette.setOnSelect(async (item) => {
  switch (item.category) {
    case 'action':
      if (item.data === 'local-changes') {
        setViewMode('local-changes')
        setActivePanel('commits')
        fileTree.setMultiSelect(true)
        window.git.startWorktreeWatcher()
        await loadLocalChanges()
      } else if (item.data === 'commits') {
        setViewMode('commits')
        setActivePanel('commits')
        fileTree.setMultiSelect(false)
        window.git.stopWorktreeWatcher()
        currentFilePath = null
        if (allCommits.length > 0) {
          commitList.selectByIndex(0)
        } else {
          fileTree.clear()
          diffViewer.clear()
        }
      } else if (item.data === 'diff-minimal' || item.data === 'diff-full') {
        const newMode = item.data === 'diff-minimal' ? 'minimal' : 'full'
        await window.git.updateSettings({ diffViewMode: newMode })
        await showCurrentDiff()
      } else if (item.data === 'commit-mode-amend' || item.data === 'commit-mode-commit') {
        const newMode = item.data === 'commit-mode-amend' ? 'amend' : 'commit'
        await window.git.updateSettings({ commitMode: newMode })
        if (viewMode === 'local-changes') {
          localChangesListEl.innerHTML = ''
          await loadLocalChanges()
        }
      } else if (item.data === 'push-to-origin') {
        try {
          await window.git.pushToOrigin()
          if (viewMode !== 'commits') {
            setViewMode('commits')
            fileTree.setMultiSelect(false)
          }
          await refreshCommitList()
          toast.show('Pushed to origin successfully')
        } catch (err) {
          if (confirm('Push was rejected. Pull with rebase and try again?')) {
            try {
              await window.git.pullRebase()
              await window.git.pushToOrigin()
              if (viewMode !== 'commits') {
                setViewMode('commits')
                fileTree.setMultiSelect(false)
              }
              await refreshCommitList()
              toast.show('Pulled and pushed to origin successfully')
            } catch (retryErr) {
              alert(`Pull rebase failed: ${retryErr}`)
            }
          }
        }
      } else if (item.data === 'force-push-to-origin') {
        if (!confirm('Are you sure you want to force push? This may overwrite remote commits.')) return
        try {
          await window.git.forcePushToOrigin()
          if (viewMode !== 'commits') {
            setViewMode('commits')
            fileTree.setMultiSelect(false)
          }
          await refreshCommitList()
          toast.show('Force pushed to origin successfully')
        } catch (err) {
          if (confirm('Force push was rejected. Pull with rebase and try again?')) {
            try {
              await window.git.pullRebase()
              await window.git.forcePushToOrigin()
              if (viewMode !== 'commits') {
                setViewMode('commits')
                fileTree.setMultiSelect(false)
              }
              await refreshCommitList()
              toast.show('Pulled and force pushed to origin successfully')
            } catch (retryErr) {
              alert(`Pull rebase failed: ${retryErr}`)
            }
          }
        }
      }
      break
    case 'project':
      await openProject(item.data)
      break
    case 'branch': {
      // Reuse the same branch change logic as branchSelector
      const name = item.data
      try {
        const changes = await window.git.getLocalChanges()
        if (changes.length > 0) {
          checkoutDialog.show(name, changes, async (action) => {
            if (action === 'cancel') return
            try {
              if (action === 'discard') {
                await window.git.discardAndCheckout(name)
              } else {
                await window.git.stashAndCheckout(name)
              }
              const { branches, current } = await window.git.getBranches()
              branchSelector.setBranches(branches, current)
              await loadLog(current)
            } catch (err) {
              console.error('Failed to switch branch:', err)
              alert(`Failed to switch branch: ${err}`)
            }
          })
          return
        }
        await window.git.checkoutBranch(name)
        const { branches, current } = await window.git.getBranches()
        branchSelector.setBranches(branches, current)
        await loadLog(current)
      } catch (err) {
        console.error('Failed to checkout branch:', err)
        alert(`Failed to switch branch: ${err}`)
      }
      break
    }
    case 'commit': {
      if (viewMode !== 'commits') {
        setViewMode('commits')
      }
      const index = allCommits.findIndex((c) => c.hash === item.data)
      if (index >= 0) {
        commitList.selectByIndex(index)
      }
      break
    }
    case 'file':
      setActivePanel('files')
      currentFilePath = item.data
      fileTree.selectByPath(item.data)
      if (viewMode === 'local-changes' || currentCommit) {
        await showCurrentDiff()
      }
      break
  }
})

// Wire up file search
fileSearch.setOnSelect(async (path) => {
  if (viewMode !== 'local-changes' && !currentCommit) return
  setActivePanel('files')
  currentFilePath = path
  fileTree.selectByPath(path)
})

// Focus tracking — click on panels sets active panel
document.getElementById('commit-list-panel')!.addEventListener('mousedown', () => {
  setActivePanel('commits')
})
document.getElementById('file-tree-panel')!.addEventListener('mousedown', () => {
  setActivePanel('files')
})

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  // Ignore keyboard shortcuts when typing in an input/textarea
  // Exception: allow Tab/Shift+Tab in local-changes mode for panel cycling
  const tag = (e.target as HTMLElement).tagName
  const isTabKey = e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey
  const isGlobalShortcut = (e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'f')
  if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && !isGlobalShortcut && !(isTabKey && viewMode === 'local-changes')) return

  // Ignore if file search or command palette is open (they handle their own keys)
  if (fileSearch.isVisible()) return
  if (commandPalette.isVisible()) return

  // Cmd+F / Ctrl+F — open file search
  if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
    e.preventDefault()
    const currentFiles = fileTree.getFiles()
    if (currentFiles.length > 0) {
      fileSearch.show(currentFiles)
    }
    return
  }

  // Cmd+P / Ctrl+P — open command palette
  if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
    e.preventDefault()
    openCommandPalette()
    return
  }

  // Tab / Shift+Tab — navigate between panels
  if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault()
    if (viewMode === 'local-changes') {
      const textarea = localChangesListEl.querySelector('textarea')
      const focused = document.activeElement as HTMLElement | null

      if (e.shiftKey) {
        if (activePanel === 'diff') {
          // Diff → back to files
          setActivePanel('files')
          const currentFiles = fileTree.getFiles()
          if (currentFiles.length > 0) {
            if (currentFilePath) {
              fileTree.selectByPath(currentFilePath)
            } else {
              fileTree.selectNext()
            }
          }
        } else {
          // Anything else → back to commit message
          if (textarea) textarea.focus()
          setActivePanel('commits')
        }
      } else if (focused && focused === textarea) {
        // Textarea → focus first commit button
        const firstBtn = localChangesListEl.querySelector('button') as HTMLButtonElement | null
        if (firstBtn) firstBtn.focus()
      } else if (focused?.tagName === 'BUTTON' && localChangesListEl.contains(focused)) {
        // Button → try next enabled sibling button, then move to files
        let nextBtn = focused.nextElementSibling as HTMLButtonElement | null
        while (nextBtn?.tagName === 'BUTTON' && nextBtn.disabled) {
          nextBtn = nextBtn.nextElementSibling as HTMLButtonElement | null
        }
        if (nextBtn?.tagName === 'BUTTON') {
          nextBtn.focus()
        } else {
          // Move to changed files panel
          ;(document.activeElement as HTMLElement)?.blur()
          setActivePanel('files')
          const currentFiles = fileTree.getFiles()
          if (currentFiles.length > 0) {
            if (currentFilePath) {
              fileTree.selectByPath(currentFilePath)
            } else {
              fileTree.selectNext()
            }
          }
        }
      } else if (activePanel === 'files') {
        // Files → diff view
        setActivePanel('diff')
      } else if (activePanel === 'diff') {
        // Diff → wrap back to commit message
        if (textarea) textarea.focus()
        setActivePanel('commits')
      } else {
        if (textarea) textarea.focus()
        setActivePanel('commits')
      }
      return
    }
    if (e.shiftKey) {
      // Shift+Tab goes back: diff → files → commits
      if (activePanel === 'diff') {
        setActivePanel('files')
        const currentFiles = fileTree.getFiles()
        if (currentFiles.length > 0) {
          if (currentFilePath) {
            fileTree.selectByPath(currentFilePath)
          } else {
            fileTree.selectNext()
          }
        }
      } else if (activePanel === 'files') {
        setActivePanel('commits')
        if (commitList.getCurrentIndex() < 0) {
          commitList.selectNext()
        }
      } else {
        setActivePanel('commits')
        if (commitList.getCurrentIndex() < 0) {
          commitList.selectNext()
        }
      }
    } else {
      // Tab goes forward: commits → files → diff → commits
      // Skip panels that have no content
      if (activePanel === 'commits') {
        const currentFiles = fileTree.getFiles()
        if (commitList.getCurrentIndex() < 0) {
          // No commit selected — select first commit
          commitList.selectNext()
        } else if (currentFiles.length > 0) {
          setActivePanel('files')
          if (currentFilePath) {
            fileTree.selectByPath(currentFilePath)
          } else {
            fileTree.selectNext()
          }
        }
      } else if (activePanel === 'files') {
        setActivePanel('diff')
      } else {
        setActivePanel('commits')
        if (commitList.getCurrentIndex() < 0) {
          commitList.selectNext()
        }
      }
    }
    return
  }

  // Space — toggle file selection in local-changes mode
  if (e.key === ' ' && activePanel === 'files' && viewMode === 'local-changes') {
    e.preventDefault()
    fileTree.toggleCurrentSelection()
    return
  }

  // Arrow keys
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (activePanel === 'diff') {
      const children = document.querySelectorAll('#diff-body > div')
      if (children.length >= 3) {
        const left = children[0] as HTMLElement
        const right = children[2] as HTMLElement
        const scrollContainer = right.scrollHeight >= left.scrollHeight ? right : left
        const step = 60
        scrollContainer.scrollTop += e.key === 'ArrowDown' ? step : -step
      }
    } else if (activePanel === 'commits' && viewMode !== 'local-changes') {
      if (e.key === 'ArrowDown') commitList.selectNext()
      else commitList.selectPrev()
    } else if (activePanel === 'files') {
      if (e.key === 'ArrowDown') fileTree.selectNext()
      else fileTree.selectPrev()
    }
  }
})

// Auto-update notification
window.git.onUpdateReady(() => {
  toast.show('A new version is ready', {
    label: 'Restart',
    onClick: () => window.git.quitAndInstall(),
  })
})

// Initialize
async function init() {
  setActivePanel('commits')
  const store = await window.git.getProjects()
  projectSelector.setProjects(store.projects, store.lastProject || null)

  if (store.lastProject) {
    await openProject(store.lastProject)
  }
}

init()
