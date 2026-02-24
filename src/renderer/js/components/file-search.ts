import type { FileChange } from '../types'

const overlayEl = document.getElementById('file-search-overlay')!
const inputEl = document.getElementById('file-search-input') as HTMLInputElement
const resultsEl = document.getElementById('file-search-results')!

let files: FileChange[] = []
let filtered: FileChange[] = []
let selectedIndex = 0
let visible = false
let onSelect: ((path: string) => void) | null = null

function setOnSelect(cb: (path: string) => void) {
  onSelect = cb
}

function show(currentFiles: FileChange[]) {
  files = currentFiles
  filtered = files
  selectedIndex = 0
  inputEl.value = ''
  visible = true
  overlayEl.classList.remove('hidden')
  renderResults()
  inputEl.focus()
}

function hide() {
  visible = false
  overlayEl.classList.add('hidden')
  inputEl.value = ''
}

function isVisible(): boolean {
  return visible
}

function fuzzyMatch(query: string, text: string): { match: boolean; score: number } {
  const lowerQuery = query.toLowerCase()
  const lowerText = text.toLowerCase()

  if (lowerQuery.length === 0) return { match: true, score: 0 }

  let qi = 0
  let score = 0
  let lastMatchIdx = -1

  for (let ti = 0; ti < lowerText.length && qi < lowerQuery.length; ti++) {
    if (lowerText[ti] === lowerQuery[qi]) {
      // Bonus for consecutive matches
      if (lastMatchIdx === ti - 1) score += 2
      // Bonus for matching at start or after separator
      if (ti === 0 || lowerText[ti - 1] === '/' || lowerText[ti - 1] === '.') score += 3
      score += 1
      lastMatchIdx = ti
      qi++
    }
  }

  return { match: qi === lowerQuery.length, score }
}

function renderResults() {
  resultsEl.innerHTML = ''

  for (let i = 0; i < filtered.length && i < 20; i++) {
    const f = filtered[i]
    const fileName = f.path.split('/').pop()!
    const lastSlash = f.path.lastIndexOf('/')
    const dirPath = lastSlash >= 0 ? f.path.slice(0, lastSlash) : ''

    const item = document.createElement('div')
    item.className = 'flex items-center gap-2 px-3 py-[7px] text-sm cursor-pointer transition-[background] duration-75'
    if (i === selectedIndex) {
      item.classList.add('bg-accent/15', 'text-text-primary')
    } else {
      item.classList.add('text-text-primary', 'hover:bg-white/4')
    }

    const nameSpan = document.createElement('span')
    nameSpan.className = 'font-medium whitespace-nowrap'
    nameSpan.textContent = fileName
    item.appendChild(nameSpan)

    if (dirPath) {
      const pathSpan = document.createElement('span')
      pathSpan.className = 'text-text-muted text-xs whitespace-nowrap overflow-hidden text-ellipsis'
      pathSpan.textContent = dirPath
      item.appendChild(pathSpan)
    }

    item.addEventListener('click', () => {
      hide()
      onSelect?.(f.path)
    })

    resultsEl.appendChild(item)
  }

  if (filtered.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'px-3 py-4 text-sm text-text-muted text-center'
    empty.textContent = 'No matching files'
    resultsEl.appendChild(empty)
  }
}

inputEl.addEventListener('input', () => {
  const query = inputEl.value.trim()
  if (query === '') {
    filtered = files
  } else {
    const scored = files
      .map((f) => ({ file: f, ...fuzzyMatch(query, f.path) }))
      .filter((r) => r.match)
      .sort((a, b) => b.score - a.score)
    filtered = scored.map((r) => r.file)
  }
  selectedIndex = 0
  renderResults()
})

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex = Math.min(selectedIndex + 1, Math.min(filtered.length - 1, 19))
    renderResults()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex = Math.max(selectedIndex - 1, 0)
    renderResults()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (filtered.length > 0 && selectedIndex < filtered.length) {
      hide()
      onSelect?.(filtered[selectedIndex].path)
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    hide()
  }
})

overlayEl.addEventListener('click', (e) => {
  if (e.target === overlayEl) {
    hide()
  }
})

export { setOnSelect, show, hide, isVisible }
