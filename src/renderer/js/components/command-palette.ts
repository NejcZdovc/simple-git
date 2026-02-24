export interface PaletteItem {
  id: string
  label: string
  detail: string
  category: 'project' | 'branch' | 'commit' | 'file' | 'action'
  data: string
}

const overlayEl = document.getElementById('command-palette-overlay')!
const inputEl = document.getElementById('command-palette-input') as HTMLInputElement
const resultsEl = document.getElementById('command-palette-results')!

let items: PaletteItem[] = []
let filtered: PaletteItem[] = []
let displayOrder: PaletteItem[] = []
let selectedIndex = 0
let visible = false
let onSelect: ((item: PaletteItem) => void) | null = null

function setOnSelect(cb: (item: PaletteItem) => void) {
  onSelect = cb
}

function show(newItems: PaletteItem[]) {
  items = newItems
  filtered = items
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
      if (lastMatchIdx === ti - 1) score += 2
      if (ti === 0 || lowerText[ti - 1] === '/' || lowerText[ti - 1] === '.') score += 3
      score += 1
      lastMatchIdx = ti
      qi++
    }
  }

  return { match: qi === lowerQuery.length, score }
}

const categoryOrder: PaletteItem['category'][] = ['action', 'project', 'branch', 'commit', 'file']

const categoryLabels: Record<PaletteItem['category'], string> = {
  action: 'Actions',
  project: 'Projects',
  branch: 'Branches',
  commit: 'Commits',
  file: 'Files',
}

const badgeLabels: Record<PaletteItem['category'], string> = {
  action: 'Action',
  project: 'Project',
  branch: 'Branch',
  commit: 'Commit',
  file: 'File',
}

function renderResults() {
  resultsEl.innerHTML = ''

  const limited = filtered.slice(0, 50)

  // Group by category
  const groups = new Map<PaletteItem['category'], PaletteItem[]>()
  for (const item of limited) {
    const list = groups.get(item.category)
    if (list) {
      list.push(item)
    } else {
      groups.set(item.category, [item])
    }
  }

  // Build flat display order matching visual rendering
  displayOrder = []
  for (const cat of categoryOrder) {
    const group = groups.get(cat)
    if (group) {
      displayOrder.push(...group)
    }
  }

  let flatIndex = 0

  for (const cat of categoryOrder) {
    const group = groups.get(cat)
    if (!group) continue

    // Section header
    const header = document.createElement('div')
    header.className =
      'sticky top-0 px-3 py-1.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider bg-bg-secondary z-10'
    header.textContent = categoryLabels[cat]
    resultsEl.appendChild(header)

    for (const item of group) {
      const row = document.createElement('div')
      row.className = 'flex items-center gap-2 px-3 py-[7px] text-sm cursor-pointer transition-[background] duration-75'
      if (flatIndex === selectedIndex) {
        row.classList.add('bg-accent/15', 'text-text-primary')
      } else {
        row.classList.add('text-text-primary', 'hover:bg-white/4')
      }

      // Badge
      const badge = document.createElement('span')
      badge.className = 'text-[10px] text-text-muted px-1.5 py-0.5 rounded-sm bg-white/5 shrink-0'
      badge.textContent = badgeLabels[cat]
      row.appendChild(badge)

      // Label
      const labelSpan = document.createElement('span')
      labelSpan.className = 'font-medium whitespace-nowrap'
      labelSpan.textContent = item.label
      row.appendChild(labelSpan)

      // Detail
      if (item.detail) {
        const detailSpan = document.createElement('span')
        detailSpan.className = 'text-text-muted text-xs whitespace-nowrap overflow-hidden text-ellipsis'
        detailSpan.textContent = item.detail
        row.appendChild(detailSpan)
      }

      const idx = flatIndex
      row.addEventListener('click', () => {
        hide()
        onSelect?.(displayOrder[idx])
      })

      resultsEl.appendChild(row)
      flatIndex++
    }
  }

  if (displayOrder.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'px-3 py-4 text-sm text-text-muted text-center'
    empty.textContent = 'No matching results'
    resultsEl.appendChild(empty)
  }
}

inputEl.addEventListener('input', () => {
  const query = inputEl.value.trim()
  if (query === '') {
    filtered = items
  } else {
    const scored = items
      .map((item) => {
        const labelMatch = fuzzyMatch(query, item.label)
        const detailMatch = fuzzyMatch(query, item.detail)
        const match = labelMatch.match || detailMatch.match
        const score = Math.max(labelMatch.score, detailMatch.score)
        return { item, match, score }
      })
      .filter((r) => r.match)
      .sort((a, b) => b.score - a.score)
    filtered = scored.map((r) => r.item)
  }
  selectedIndex = 0
  renderResults()
})

inputEl.addEventListener('keydown', (e) => {
  const maxIndex = displayOrder.length - 1
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex = Math.min(selectedIndex + 1, maxIndex)
    renderResults()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex = Math.max(selectedIndex - 1, 0)
    renderResults()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (displayOrder.length > 0 && selectedIndex < displayOrder.length) {
      const item = displayOrder[selectedIndex]
      hide()
      onSelect?.(item)
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
