import type { CommitInfo } from '../types'
import * as contextMenu from './context-menu'

const listEl = document.getElementById('commit-list')!
const countEl = document.getElementById('commit-count')!
const loadMoreContainer = document.getElementById('load-more-container')!
const loadMoreBtn = document.getElementById('load-more-btn')!

let commits: CommitInfo[] = []
const selectedHashes = new Set<string>()
let lastClickedIndex = -1
let total = 0

let onCommitSelect: ((hash: string) => void) | null = null
let onDropCommit: ((hash: string) => void) | null = null
let onSquashCommits: ((hashes: string[]) => void) | null = null
let onLoadMore: (() => void) | null = null

function setCallbacks(cbs: {
  onCommitSelect: (hash: string) => void
  onDropCommit: (hash: string) => void
  onSquashCommits: (hashes: string[]) => void
  onLoadMore: () => void
}) {
  onCommitSelect = cbs.onCommitSelect
  onDropCommit = cbs.onDropCommit
  onSquashCommits = cbs.onSquashCommits
  onLoadMore = cbs.onLoadMore
}

function setCommits(newCommits: CommitInfo[], newTotal: number, append: boolean) {
  if (append) {
    commits = [...commits, ...newCommits]
  } else {
    commits = newCommits
    selectedHashes.clear()
    lastClickedIndex = -1
  }
  total = newTotal
  render()
}

function render() {
  listEl.innerHTML = ''
  countEl.textContent = `${commits.length} / ${total}`

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i]
    const row = document.createElement('div')
    row.className =
      'flex flex-col px-3 py-2 cursor-pointer transition-[background] duration-100 border-b border-white/3 select-none hover:bg-white/4'
    if (selectedHashes.has(c.hash)) {
      row.classList.add('bg-accent/15')
      row.classList.remove('hover:bg-white/4')
      row.classList.add('hover:bg-accent/20')
    }

    row.innerHTML = `
      <div class="text-sm font-medium text-text-primary whitespace-nowrap overflow-hidden text-ellipsis mb-[3px]">${escapeHtml(c.message)}</div>
      <div class="flex items-center gap-2 text-xs text-text-secondary">
        <span class="font-mono text-text-muted">${c.hash.slice(0, 7)}</span>
        <span class="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">${escapeHtml(c.authorName)}</span>
        <span class="whitespace-nowrap text-text-secondary shrink-0">${formatRelativeDate(c.date)}</span>
      </div>
    `

    row.addEventListener('click', (e) => handleClick(i, e))
    row.addEventListener('contextmenu', (e) => handleContextMenu(i, e))

    listEl.appendChild(row)
  }

  // Show/hide load more
  if (commits.length < total) {
    loadMoreContainer.classList.remove('hidden')
  } else {
    loadMoreContainer.classList.add('hidden')
  }
}

function handleClick(index: number, e: MouseEvent) {
  const hash = commits[index].hash

  if (e.metaKey || e.ctrlKey) {
    // Toggle single item
    if (selectedHashes.has(hash)) {
      selectedHashes.delete(hash)
    } else {
      selectedHashes.add(hash)
    }
    lastClickedIndex = index
  } else if (e.shiftKey && lastClickedIndex >= 0) {
    // Range select
    const start = Math.min(lastClickedIndex, index)
    const end = Math.max(lastClickedIndex, index)
    selectedHashes.clear()
    for (let i = start; i <= end; i++) {
      selectedHashes.add(commits[i].hash)
    }
  } else {
    // Single select
    selectedHashes.clear()
    selectedHashes.add(hash)
    lastClickedIndex = index
  }

  render()

  if (selectedHashes.size === 1) {
    onCommitSelect?.(hash)
  }
}

function handleContextMenu(index: number, e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()

  // If right-clicked item is not selected, select it
  const hash = commits[index].hash
  if (!selectedHashes.has(hash)) {
    selectedHashes.clear()
    selectedHashes.add(hash)
    lastClickedIndex = index
    render()
    onCommitSelect?.(hash)
  }

  const items: contextMenu.ContextMenuItem[] = []

  if (selectedHashes.size === 1) {
    items.push({
      label: 'Drop Commit',
      destructive: true,
      action: () => onDropCommit?.(hash),
    })
  } else if (selectedHashes.size > 1) {
    const hashes = getSelectedHashesOrdered()
    items.push({
      label: `Squash ${selectedHashes.size} Commits`,
      action: () => onSquashCommits?.(hashes),
    })
    items.push({
      label: `Drop ${selectedHashes.size} Commits`,
      destructive: true,
      action: () => {
        // Drop one by one from newest to oldest
        for (const h of hashes) {
          onDropCommit?.(h)
        }
      },
    })
  }

  contextMenu.show(e.clientX, e.clientY, items)
}

function getSelectedHashesOrdered(): string[] {
  // Return selected hashes in commit order (newest first)
  return commits.filter((c) => selectedHashes.has(c.hash)).map((c) => c.hash)
}

function getSelectedHashes(): string[] {
  return getSelectedHashesOrdered()
}

function getCurrentIndex(): number {
  if (lastClickedIndex >= 0) return lastClickedIndex
  if (selectedHashes.size === 1) {
    const hash = [...selectedHashes][0]
    return commits.findIndex((c) => c.hash === hash)
  }
  return -1
}

function selectByIndex(index: number) {
  if (index < 0 || index >= commits.length) return
  selectedHashes.clear()
  selectedHashes.add(commits[index].hash)
  lastClickedIndex = index
  render()
  scrollToIndex(index)
  onCommitSelect?.(commits[index].hash)
}

function selectNext() {
  const current = getCurrentIndex()
  const next = current < 0 ? 0 : Math.min(current + 1, commits.length - 1)
  selectByIndex(next)
}

function selectPrev() {
  const current = getCurrentIndex()
  const prev = current < 0 ? 0 : Math.max(current - 1, 0)
  selectByIndex(prev)
}

function scrollToIndex(index: number) {
  const rows = listEl.children
  if (index >= 0 && index < rows.length) {
    rows[index].scrollIntoView({ block: 'nearest' })
  }
}

loadMoreBtn.addEventListener('click', () => {
  onLoadMore?.()
})

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

export { setCallbacks, setCommits, getSelectedHashes, selectByIndex, selectNext, selectPrev, getCurrentIndex }
