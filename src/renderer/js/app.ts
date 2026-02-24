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
import type { CommitInfo } from './types'

const PAGE_SIZE = 50
let currentPage = 0
let currentCommit: CommitInfo | null = null
let currentFilePath: string | null = null
let allCommits: CommitInfo[] = []
let activePanel: 'commits' | 'files' = 'commits'
let confirmedLargeFile: string | null = null

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
    if (!currentCommit) return
    currentFilePath = path
    confirmedLargeFile = null
    await showCurrentDiff()
  },
  onFileRevert: async (path) => {
    if (!currentCommit) return
    try {
      await window.git.revertFile(currentCommit.hash, path)
      // Refresh files
      const files = await window.git.getCommitFiles(currentCommit.hash)
      fileTree.setFiles(files, currentCommit)
    } catch (err) {
      console.error('Failed to revert file:', err)
      alert(`Failed to revert file: ${err}`)
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
  if (!currentCommit || !currentFilePath) return
  try {
    const diff = await window.git.getFileDiff(currentCommit.hash, currentFilePath)

    if (diff.tooLarge) {
      diffViewer.showTooLarge(diff.filePath)
      return
    }

    const lineCount = Math.max(countLines(diff.oldContent), countLines(diff.newContent))
    const fileKey = `${currentCommit.hash}:${currentFilePath}`
    if (lineCount > 2000 && confirmedLargeFile !== fileKey) {
      if (!confirm(`This file has ${lineCount} lines. Large diffs may be slow. Open anyway?`)) {
        diffViewer.clear()
        return
      }
      confirmedLargeFile = fileKey
    }

    await diffViewer.showDiff(diff, currentCommit.hash)
  } catch (err) {
    console.error('Failed to get file diff:', err)
  }
}

// Wire up settings
window.git.onOpenSettings(() => {
  settingsDialog.show()
})

settingsDialog.setOnDiffViewModeChange(() => {
  showCurrentDiff()
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

// Wire up command palette
async function openCommandPalette() {
  const paletteItems: PaletteItem[] = []

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
      const index = allCommits.findIndex((c) => c.hash === item.data)
      if (index >= 0) {
        commitList.selectByIndex(index)
      }
      break
    }
    case 'file':
      activePanel = 'files'
      currentFilePath = item.data
      fileTree.selectByPath(item.data)
      await showCurrentDiff()
      break
  }
})

// Wire up file search
fileSearch.setOnSelect(async (path) => {
  if (!currentCommit) return
  activePanel = 'files'
  currentFilePath = path
  fileTree.selectByPath(path)
})

// Focus tracking — click on panels sets active panel
document.getElementById('commit-list-panel')!.addEventListener('mousedown', () => {
  activePanel = 'commits'
})
document.getElementById('file-tree-panel')!.addEventListener('mousedown', () => {
  activePanel = 'files'
})

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  // Ignore keyboard shortcuts when typing in an input/textarea
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

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
    if (e.shiftKey) {
      // Shift+Tab always goes back to commits
      activePanel = 'commits'
      if (commitList.getCurrentIndex() < 0) {
        commitList.selectNext()
      }
    } else {
      // Tab goes forward: commits → files
      activePanel = activePanel === 'commits' ? 'files' : 'commits'
      if (activePanel === 'commits') {
        if (commitList.getCurrentIndex() < 0) {
          commitList.selectNext()
        }
      } else {
        const currentFiles = fileTree.getFiles()
        if (currentFiles.length > 0) {
          if (currentFilePath) {
            fileTree.selectByPath(currentFilePath)
          } else {
            fileTree.selectNext()
          }
        }
      }
    }
    return
  }

  // Arrow keys
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (activePanel === 'commits') {
      if (e.key === 'ArrowDown') commitList.selectNext()
      else commitList.selectPrev()
    } else {
      if (e.key === 'ArrowDown') fileTree.selectNext()
      else fileTree.selectPrev()
    }
  }
})

// Initialize
async function init() {
  const store = await window.git.getProjects()
  projectSelector.setProjects(store.projects, store.lastProject || null)

  if (store.lastProject) {
    await openProject(store.lastProject)
  }
}

init()
