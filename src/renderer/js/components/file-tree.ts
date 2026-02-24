import type { CommitInfo, FileChange } from '../types'
import * as contextMenu from './context-menu'

const treeEl = document.getElementById('file-tree')!
const detailsEl = document.getElementById('commit-details')!
const treeViewBtn = document.getElementById('tree-view-btn')!
const listViewBtn = document.getElementById('list-view-btn')!

let files: FileChange[] = []
let selectedFile: string | null = null
let viewMode: 'tree' | 'list' = 'tree'
let currentCommit: CommitInfo | null = null
const collapsedDirs = new Set<string>()
let flatFileOrder: string[] = []

let onFileSelect: ((path: string) => void) | null = null
let onFileRevert: ((path: string) => void) | null = null

const activeViewClasses = ['bg-accent/15', 'text-accent']
const inactiveViewClasses = ['bg-transparent', 'text-text-muted']

function setCallbacks(cbs: { onFileSelect: (path: string) => void; onFileRevert: (path: string) => void }) {
  onFileSelect = cbs.onFileSelect
  onFileRevert = cbs.onFileRevert
}

treeViewBtn.addEventListener('click', () => {
  viewMode = 'tree'
  treeViewBtn.classList.remove(...inactiveViewClasses)
  treeViewBtn.classList.add(...activeViewClasses)
  listViewBtn.classList.remove(...activeViewClasses)
  listViewBtn.classList.add(...inactiveViewClasses)
  renderFiles()
})

listViewBtn.addEventListener('click', () => {
  viewMode = 'list'
  listViewBtn.classList.remove(...inactiveViewClasses)
  listViewBtn.classList.add(...activeViewClasses)
  treeViewBtn.classList.remove(...activeViewClasses)
  treeViewBtn.classList.add(...inactiveViewClasses)
  renderFiles()
})

function setFiles(newFiles: FileChange[], commit: CommitInfo | null) {
  files = newFiles
  currentCommit = commit
  selectedFile = null
  collapsedDirs.clear()
  renderFiles()
  renderDetails()
}

function renderFiles() {
  treeEl.innerHTML = ''
  flatFileOrder = []

  if (files.length === 0) {
    treeEl.innerHTML =
      '<div class="flex items-center justify-center h-full text-text-muted text-sm">No files changed</div>'
    return
  }

  if (viewMode === 'list') {
    renderListView()
  } else {
    renderTreeView()
  }
}

// File type badge colors
const fileTypeInfo: Record<string, { label: string; color: string }> = {
  ts: { label: 'TS', color: '#3178c6' },
  tsx: { label: 'TS', color: '#3178c6' },
  js: { label: 'JS', color: '#dab92e' },
  jsx: { label: 'JS', color: '#dab92e' },
  mjs: { label: 'JS', color: '#dab92e' },
  cjs: { label: 'JS', color: '#dab92e' },
  css: { label: 'CSS', color: '#a86ec8' },
  scss: { label: 'CSS', color: '#a86ec8' },
  html: { label: 'HTML', color: '#e06c4f' },
  htm: { label: 'HTML', color: '#e06c4f' },
  json: { label: '{ }', color: '#dab92e' },
  md: { label: 'MD', color: '#569cd6' },
  py: { label: 'PY', color: '#3572A5' },
  go: { label: 'GO', color: '#00ADD8' },
  rs: { label: 'RS', color: '#dea584' },
  yaml: { label: 'YML', color: '#cb171e' },
  yml: { label: 'YML', color: '#cb171e' },
  svg: { label: 'SVG', color: '#ffb13b' },
  sh: { label: 'SH', color: '#89e051' },
  rb: { label: 'RB', color: '#cc342d' },
  java: { label: 'JV', color: '#b07219' },
  swift: { label: 'SW', color: '#ffac45' },
  kt: { label: 'KT', color: '#A97BFF' },
  php: { label: 'PHP', color: '#4F5D95' },
}

function createFileTypeBadge(fileName: string): HTMLElement {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const info = fileTypeInfo[ext]

  const badge = document.createElement('span')
  badge.className = 'text-[10px] font-bold font-mono shrink-0 min-w-[18px] text-center'
  if (info) {
    badge.textContent = info.label
    badge.style.color = info.color
  } else {
    badge.textContent = '·'
    badge.classList.add('text-text-muted')
  }

  return badge
}

function showFileContextMenu(e: MouseEvent, f: FileChange) {
  e.preventDefault()
  e.stopPropagation()
  contextMenu.show(e.clientX, e.clientY, [
    {
      label: 'Revert File',
      destructive: true,
      action: () => {
        if (confirm(`Revert ${f.path}?`)) {
          onFileRevert?.(f.path)
        }
      },
    },
  ])
}

// --- List View ---

function renderListView() {
  for (const f of files) {
    flatFileOrder.push(f.path)
    const fileName = f.path.split('/').pop()!
    const lastSlash = f.path.lastIndexOf('/')
    const dirPath = lastSlash >= 0 ? f.path.slice(0, lastSlash) : ''

    const item = document.createElement('div')
    item.className =
      'flex items-center gap-1.5 px-3 py-1 cursor-pointer text-sm text-text-primary transition-[background] duration-100 hover:bg-white/4'
    if (f.path === selectedFile) item.classList.add('bg-accent/15')

    item.appendChild(createFileTypeBadge(fileName))

    const nameSpan = document.createElement('span')
    nameSpan.className = 'font-medium whitespace-nowrap'
    nameSpan.textContent = fileName
    item.appendChild(nameSpan)

    if (dirPath) {
      const pathSpan = document.createElement('span')
      pathSpan.className = 'text-text-muted text-xs whitespace-nowrap overflow-hidden text-ellipsis ml-1.5'
      pathSpan.textContent = dirPath
      item.appendChild(pathSpan)
    }

    const spacer = document.createElement('span')
    spacer.className = 'flex-1 min-w-[8px]'
    item.appendChild(spacer)

    item.appendChild(createStatusBadge(f))

    item.title = f.path
    item.addEventListener('click', () => {
      selectedFile = f.path
      renderFiles()
      onFileSelect?.(f.path)
    })
    item.addEventListener('contextmenu', (e) => showFileContextMenu(e, f))

    treeEl.appendChild(item)
  }
}

// --- Tree View ---

interface TreeNode {
  name: string
  children: Map<string, TreeNode>
  files: FileChange[]
}

function buildTree(fileList: FileChange[]): TreeNode {
  const root: TreeNode = { name: '', children: new Map(), files: [] }

  for (const f of fileList) {
    const parts = f.path.split('/')
    let current = root

    for (let i = 0; i < parts.length - 1; i++) {
      if (!current.children.has(parts[i])) {
        current.children.set(parts[i], { name: parts[i], children: new Map(), files: [] })
      }
      current = current.children.get(parts[i])!
    }

    current.files.push(f)
  }

  return root
}

function renderTreeView() {
  const root = buildTree(files)
  renderTreeNode(root, treeEl, 0, '')
}

function renderTreeNode(node: TreeNode, container: HTMLElement, depth: number, parentPath: string) {
  const sortedDirs = [...node.children.keys()].sort()
  const sortedFiles = [...node.files].sort((a, b) => {
    const aName = a.path.split('/').pop()!
    const bName = b.path.split('/').pop()!
    return aName.localeCompare(bName)
  })

  for (const dirName of sortedDirs) {
    const child = node.children.get(dirName)!
    const dirPath = parentPath ? `${parentPath}/${dirName}` : dirName
    const isCollapsed = collapsedDirs.has(dirPath)

    const dirEl = document.createElement('div')
    dirEl.className = 'select-none'

    const header = document.createElement('div')
    header.className =
      'flex items-center gap-1 cursor-pointer text-sm text-text-secondary transition-[background] duration-100 hover:bg-white/4 py-[3px] pr-3'
    header.style.paddingLeft = `${depth * 16 + 8}px`

    const arrow = document.createElement('span')
    arrow.className = `text-[10px] w-3.5 text-center transition-transform duration-150 shrink-0 ${isCollapsed ? '-rotate-90' : ''}`
    arrow.textContent = '▾'
    header.appendChild(arrow)

    const nameSpan = document.createElement('span')
    nameSpan.className = 'flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium'
    nameSpan.textContent = dirName
    header.appendChild(nameSpan)

    const dot = document.createElement('span')
    dot.className = 'w-1.5 h-1.5 rounded-full bg-yellow/50 shrink-0'
    header.appendChild(dot)

    header.addEventListener('click', () => {
      if (collapsedDirs.has(dirPath)) {
        collapsedDirs.delete(dirPath)
      } else {
        collapsedDirs.add(dirPath)
      }
      renderFiles()
    })
    dirEl.appendChild(header)

    if (!isCollapsed) {
      renderTreeNode(child, dirEl, depth + 1, dirPath)
    }

    container.appendChild(dirEl)
  }

  for (const f of sortedFiles) {
    flatFileOrder.push(f.path)
    const fileName = f.path.split('/').pop()!

    const item = document.createElement('div')
    item.className =
      'flex items-center gap-1.5 py-[3px] pr-3 cursor-pointer text-sm text-text-primary transition-[background] duration-100 hover:bg-white/4'
    item.style.paddingLeft = `${depth * 16 + 26}px`
    if (f.path === selectedFile) item.classList.add('bg-accent/15')

    item.appendChild(createFileTypeBadge(fileName))

    const nameSpan = document.createElement('span')
    nameSpan.className = 'flex-1 overflow-hidden text-ellipsis whitespace-nowrap'
    nameSpan.textContent = fileName
    item.appendChild(nameSpan)

    item.appendChild(createStatusBadge(f))

    item.title = f.path
    item.addEventListener('click', () => {
      selectedFile = f.path
      renderFiles()
      onFileSelect?.(f.path)
    })
    item.addEventListener('contextmenu', (e) => showFileContextMenu(e, f))

    container.appendChild(item)
  }
}

// --- Shared helpers ---

const statusStyles: Record<string, string> = {
  A: 'text-green',
  M: 'text-yellow',
  D: 'text-red',
  R: 'text-orange',
}

function createStatusBadge(f: FileChange): HTMLElement {
  const badge = document.createElement('span')
  badge.className = `text-[11px] font-semibold shrink-0 font-mono ${statusStyles[f.status] || ''}`
  badge.textContent = f.status
  return badge
}

function renderDetails() {
  if (!currentCommit) {
    detailsEl.classList.add('hidden')
    return
  }

  detailsEl.classList.remove('hidden')
  detailsEl.innerHTML = `
    <div class="font-mono text-xs text-accent mb-1.5">${currentCommit.hash.slice(0, 12)}</div>
    <div class="text-[13px] text-text-primary mb-1.5 leading-snug break-words">${escapeHtml(currentCommit.message)}</div>
    <div class="text-xs text-text-secondary">${escapeHtml(currentCommit.authorName)} &lt;${escapeHtml(currentCommit.authorEmail)}&gt;</div>
    <div class="text-xs text-text-muted mt-0.5">${new Date(currentCommit.date).toLocaleString()}</div>
  `
}

function clear() {
  files = []
  currentCommit = null
  selectedFile = null
  flatFileOrder = []
  treeEl.innerHTML =
    '<div class="flex items-center justify-center h-full text-text-muted text-sm">Select a commit</div>'
  detailsEl.classList.add('hidden')
}

function getFiles(): FileChange[] {
  return files
}

function selectByPath(path: string) {
  const changed = selectedFile !== path
  selectedFile = path
  renderFiles()
  if (changed) onFileSelect?.(path)
  scrollToSelected()
}

function selectNext() {
  if (flatFileOrder.length === 0) return
  const currentIdx = selectedFile ? flatFileOrder.indexOf(selectedFile) : -1
  const next = currentIdx < 0 ? 0 : Math.min(currentIdx + 1, flatFileOrder.length - 1)
  selectByPath(flatFileOrder[next])
}

function selectPrev() {
  if (flatFileOrder.length === 0) return
  const currentIdx = selectedFile ? flatFileOrder.indexOf(selectedFile) : -1
  const prev = currentIdx < 0 ? 0 : Math.max(currentIdx - 1, 0)
  selectByPath(flatFileOrder[prev])
}

function scrollToSelected() {
  if (!selectedFile) return
  const items = treeEl.querySelectorAll('[title]')
  for (const item of items) {
    if ((item as HTMLElement).title === selectedFile) {
      item.scrollIntoView({ block: 'nearest' })
      break
    }
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export { setCallbacks, setFiles, clear, getFiles, selectNext, selectPrev, selectByPath }
