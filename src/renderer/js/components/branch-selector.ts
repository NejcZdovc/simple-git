import type { BranchInfo } from '../types'

const container = document.getElementById('branch-selector')!

let currentBranch = ''
let branches: BranchInfo[] = []
let menuOpen = false
let onBranchChange: ((name: string) => void) | null = null
let syncStatus: { ahead: number; behind: number } | null = null
let onSyncClick: (() => void) | null = null

function setOnBranchChange(cb: (name: string) => void) {
  onBranchChange = cb
}

function render() {
  container.innerHTML = ''
  container.className = 'relative flex items-center gap-1.5'

  const btn = document.createElement('button')
  btn.className =
    'flex items-center gap-1.5 px-3 py-[5px] border border-border rounded-sm bg-bg-secondary text-text-primary text-sm font-medium cursor-pointer transition-all duration-150 whitespace-nowrap font-[inherit] hover:bg-bg-card hover:border-white/15'
  btn.innerHTML = `
    <span>${currentBranch || 'No branch'}</span>
    <span class="text-[10px] text-text-secondary ml-0.5">▾</span>
  `
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleMenu()
  })
  container.appendChild(btn)

  if (syncStatus && (syncStatus.ahead > 0 || syncStatus.behind > 0)) {
    const badge = document.createElement('button')
    badge.type = 'button'
    const parts: string[] = []
    if (syncStatus.ahead > 0) parts.push(`↑${syncStatus.ahead}`)
    if (syncStatus.behind > 0) parts.push(`↓${syncStatus.behind}`)
    badge.textContent = parts.join(' ')

    const titleParts: string[] = []
    if (syncStatus.ahead > 0)
      titleParts.push(`${syncStatus.ahead} commit${syncStatus.ahead === 1 ? '' : 's'} ahead of origin`)
    if (syncStatus.behind > 0)
      titleParts.push(`${syncStatus.behind} commit${syncStatus.behind === 1 ? '' : 's'} behind origin`)
    titleParts.push('Click to pull')
    badge.title = titleParts.join(' · ')

    let colorClasses: string
    if (syncStatus.behind > 0 && syncStatus.ahead > 0) {
      colorClasses = 'text-yellow-400'
    } else if (syncStatus.behind > 0) {
      colorClasses = 'text-yellow-400'
    } else {
      colorClasses = 'text-accent'
    }

    badge.className = `flex items-center px-2 py-[5px] border border-border rounded-sm bg-bg-secondary text-xs font-medium cursor-pointer transition-all duration-150 font-[inherit] hover:bg-bg-card hover:border-white/15 ${colorClasses}`
    badge.addEventListener('click', (e) => {
      e.stopPropagation()
      onSyncClick?.()
    })
    container.appendChild(badge)
  }
}

function toggleMenu() {
  if (menuOpen) {
    closeMenu()
    return
  }
  menuOpen = true

  const menu = document.createElement('div')
  menu.className =
    'absolute top-[calc(100%+4px)] left-0 min-w-[200px] max-w-[350px] max-h-[300px] overflow-hidden bg-bg-secondary border border-border rounded-sm shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-300 flex flex-col'

  const searchInput = document.createElement('input')
  searchInput.type = 'text'
  searchInput.placeholder = 'Search branches...'
  searchInput.className =
    'w-full px-3 py-2 border-b border-border bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted shrink-0'
  let activeIdx = -1

  function getVisibleItems(): HTMLElement[] {
    const items: HTMLElement[] = []
    for (const child of itemsContainer.children) {
      const el = child as HTMLElement
      if (el.style.display !== 'none') items.push(el)
    }
    return items
  }

  function updateHighlight() {
    const visible = getVisibleItems()
    for (let i = 0; i < visible.length; i++) {
      if (i === activeIdx) {
        visible[i].classList.add('bg-white/6')
      } else {
        visible[i].classList.remove('bg-white/6')
      }
    }
    if (activeIdx >= 0 && activeIdx < visible.length) {
      visible[activeIdx].scrollIntoView({ block: 'nearest' })
    }
  }

  function selectActive() {
    const visible = getVisibleItems()
    if (activeIdx >= 0 && activeIdx < visible.length) {
      visible[activeIdx].click()
    }
  }

  searchInput.addEventListener('click', (e) => e.stopPropagation())
  searchInput.addEventListener('input', () => {
    const term = searchInput.value.toLowerCase()
    for (const child of itemsContainer.children) {
      const el = child as HTMLElement
      const name = el.dataset.branchName || ''
      el.style.display = name.toLowerCase().includes(term) ? '' : 'none'
    }
    activeIdx = -1
    updateHighlight()
  })
  searchInput.addEventListener('keydown', (e) => {
    const visible = getVisibleItems()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeIdx = Math.min(activeIdx + 1, visible.length - 1)
      updateHighlight()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeIdx = Math.max(activeIdx - 1, 0)
      updateHighlight()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectActive()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu()
    }
  })
  menu.appendChild(searchInput)

  const itemsContainer = document.createElement('div')
  itemsContainer.className = 'overflow-y-auto py-1 flex-1 min-h-0'

  for (const b of branches) {
    const item = document.createElement('div')
    item.className =
      'flex items-center gap-2 px-3 py-[7px] text-sm text-text-primary cursor-pointer transition-[background] duration-100 whitespace-nowrap overflow-hidden text-ellipsis border-none bg-transparent w-full text-left font-[inherit] hover:bg-white/6'
    item.dataset.branchName = b.name
    if (b.current) item.classList.add('text-accent')

    if (b.current) {
      const dot = document.createElement('span')
      dot.className = 'w-1.5 h-1.5 rounded-full bg-accent shrink-0'
      item.appendChild(dot)
    }

    const nameSpan = document.createElement('span')
    nameSpan.textContent = b.name
    item.appendChild(nameSpan)

    item.addEventListener('click', () => {
      closeMenu()
      if (b.name !== currentBranch) {
        onBranchChange?.(b.name)
      }
    })
    itemsContainer.appendChild(item)
  }

  menu.appendChild(itemsContainer)
  container.appendChild(menu)

  searchInput.focus()

  const closeHandler = () => {
    closeMenu()
    document.removeEventListener('click', closeHandler)
  }
  setTimeout(() => document.addEventListener('click', closeHandler), 0)
}

function closeMenu() {
  menuOpen = false
  const menu = container.querySelector('.absolute')
  if (menu) menu.remove()
}

function setBranches(list: BranchInfo[], current: string) {
  branches = list
  currentBranch = current
  render()
}

function getCurrentBranch(): string {
  return currentBranch
}

function setSyncStatus(status: { ahead: number; behind: number } | null) {
  syncStatus = status
  render()
}

function setOnSyncClick(cb: () => void) {
  onSyncClick = cb
}

export { setOnBranchChange, setBranches, getCurrentBranch, setSyncStatus, setOnSyncClick }
