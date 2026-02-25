import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import diffLang from 'highlight.js/lib/languages/diff'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import 'highlight.js/styles/vs2015.css'
import type { DiffLine, FileDiff } from '../types'

interface SeparatorLine {
  type: 'separator'
  hiddenStart: number
  hiddenEnd: number
}

type DisplayLine = DiffLine | SeparatorLine

let currentDiffData: { diff: FileDiff; commitHash: string } | null = null
let expandedSeparators = new Set<string>()
let reverting = false
let scrollLeft: HTMLElement | null = null
let scrollRight: HTMLElement | null = null
let scrollGutterInner: HTMLElement | null = null
let leftScrollHandler: (() => void) | null = null
let rightScrollHandler: (() => void) | null = null

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('css', css)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('json', json)
hljs.registerLanguage('python', python)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('java', java)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('php', php)
hljs.registerLanguage('diff', diffLang)

const extensionMap: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  css: 'css',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  json: 'json',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  md: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'sql',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  rb: 'ruby',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  php: 'php',
  diff: 'diff',
  patch: 'diff',
}

const ROW_HEIGHT = 20

const headerEl = document.getElementById('diff-header')!
const bodyEl = document.getElementById('diff-body')!

function getLanguageFromPath(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (!ext) return undefined
  return extensionMap[ext]
}

function splitHighlightedLines(html: string): string[] {
  const lines = html.split('\n')
  const result: string[] = []
  const openSpans: string[] = []

  for (const line of lines) {
    const prefix = openSpans.join('')
    let output = prefix + line

    const openRegex = /<span[^>]*>/g
    const closeRegex = /<\/span>/g
    let match: RegExpExecArray | null = null

    const fullLine = line
    const opens: string[] = []
    const closeCount = (fullLine.match(closeRegex) || []).length

    match = openRegex.exec(fullLine)
    while (match !== null) {
      opens.push(match[0])
      match = openRegex.exec(fullLine)
    }

    for (let i = 0; i < closeCount; i++) {
      openSpans.pop()
    }
    for (const o of opens) {
      openSpans.push(o)
    }

    const unclosed = openSpans.length
    for (let i = 0; i < unclosed; i++) {
      output += '</span>'
    }

    result.push(output)
  }

  return result
}

function highlightLines(content: string, filePath: string): string[] {
  const lang = getLanguageFromPath(filePath)
  if (!lang) {
    return content.split('\n').map((line) => escapeHtml(line))
  }
  try {
    const highlighted = hljs.highlight(content, { language: lang })
    return splitHighlightedLines(highlighted.value)
  } catch {
    return content.split('\n').map((line) => escapeHtml(line))
  }
}

interface Hunk {
  oldStart: number
  oldEnd: number
  newStart: number
  newEnd: number
  lines: DiffLine[]
}

function computeHunks(lines: DiffLine[]): Hunk[] {
  const hunks: Hunk[] = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].type !== 'context') {
      const hunkLines: DiffLine[] = []
      let oldStart = Number.MAX_SAFE_INTEGER
      let oldEnd = 0
      let newStart = Number.MAX_SAFE_INTEGER
      let newEnd = 0

      while (i < lines.length && lines[i].type !== 'context') {
        const line = lines[i]
        hunkLines.push(line)
        if (line.type === 'remove' && line.oldLineNo != null) {
          oldStart = Math.min(oldStart, line.oldLineNo)
          oldEnd = Math.max(oldEnd, line.oldLineNo)
        }
        if (line.type === 'add' && line.newLineNo != null) {
          newStart = Math.min(newStart, line.newLineNo)
          newEnd = Math.max(newEnd, line.newLineNo)
        }
        i++
      }

      if (oldStart === Number.MAX_SAFE_INTEGER) oldStart = 0
      if (newStart === Number.MAX_SAFE_INTEGER) newStart = 0

      hunks.push({ oldStart, oldEnd, newStart, newEnd, lines: hunkLines })
    } else {
      i++
    }
  }
  return hunks
}

let onRefreshDiff: (() => void) | null = null

function setOnRefreshDiff(cb: () => void) {
  onRefreshDiff = cb
}

function filterMinimalLines(lines: DiffLine[], contextRadius: number, expanded: Set<string>): DisplayLine[] {
  const changeIndices = new Set<number>()
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== 'context') {
      changeIndices.add(i)
    }
  }

  const keepIndices = new Set<number>()
  for (const idx of changeIndices) {
    for (let j = Math.max(0, idx - contextRadius); j <= Math.min(lines.length - 1, idx + contextRadius); j++) {
      keepIndices.add(j)
    }
  }

  const sorted = [...keepIndices].sort((a, b) => a - b)
  const result: DisplayLine[] = []
  let lastIdx = -1

  for (const idx of sorted) {
    if (lastIdx >= 0 && idx > lastIdx + 1) {
      const hiddenStart = lastIdx + 1
      const hiddenEnd = idx - 1
      const key = `${hiddenStart}-${hiddenEnd}`
      if (expanded.has(key)) {
        for (let h = hiddenStart; h <= hiddenEnd; h++) {
          result.push(lines[h])
        }
      } else {
        result.push({ type: 'separator', hiddenStart, hiddenEnd })
      }
    }
    result.push(lines[idx])
    lastIdx = idx
  }

  // Handle leading hidden lines (before first kept index)
  if (sorted.length > 0 && sorted[0] > 0) {
    const hiddenEnd = sorted[0] - 1
    const key = `0-${hiddenEnd}`
    if (expanded.has(key)) {
      const leading: DisplayLine[] = []
      for (let h = 0; h <= hiddenEnd; h++) {
        leading.push(lines[h])
      }
      result.unshift(...leading)
    } else {
      result.unshift({ type: 'separator', hiddenStart: 0, hiddenEnd })
    }
  }

  // Handle trailing hidden lines (after last kept index)
  if (sorted.length > 0 && sorted[sorted.length - 1] < lines.length - 1) {
    const hiddenStart = sorted[sorted.length - 1] + 1
    const hiddenEnd = lines.length - 1
    const key = `${hiddenStart}-${hiddenEnd}`
    if (expanded.has(key)) {
      for (let h = hiddenStart; h <= hiddenEnd; h++) {
        result.push(lines[h])
      }
    } else {
      result.push({ type: 'separator', hiddenStart, hiddenEnd })
    }
  }

  return result
}

async function showDiff(diff: FileDiff, commitHash: string) {
  currentDiffData = { diff, commitHash }
  expandedSeparators = new Set()
  await renderDiff()
}

async function renderDiff() {
  if (!currentDiffData) return
  const { diff } = currentDiffData

  headerEl.classList.remove('hidden')
  headerEl.innerHTML = `<span class="font-mono text-xs text-text-primary">${escapeHtml(diff.filePath)}</span>`

  const settings = await window.git.getSettings()

  const lines = computeDiff(diff.oldContent, diff.newContent)

  const oldHighlighted = highlightLines(diff.oldContent, diff.filePath)
  const newHighlighted = highlightLines(diff.newContent, diff.filePath)
  const displayLines: DisplayLine[] =
    settings.diffViewMode === 'minimal' ? filterMinimalLines(lines, 10, expandedSeparators) : lines

  const hunks = computeHunks(lines)

  // Build O(1) lookup from line identity to original index
  const lineToIdx = new Map<DiffLine, number>()
  for (let i = 0; i < lines.length; i++) {
    lineToIdx.set(lines[i], i)
  }

  const lineToHunk = new Map<number, Hunk>()
  for (const hunk of hunks) {
    for (const hl of hunk.lines) {
      const idx = lineToIdx.get(hl)
      if (idx !== undefined) lineToHunk.set(idx, hunk)
    }
  }

  // Map display indices to hunk start positions
  const displayHunkStarts = new Set<number>()
  const displayLineToHunk = new Map<number, Hunk>()
  for (let di = 0; di < displayLines.length; di++) {
    const dl = displayLines[di]
    if (dl.type === 'separator') continue
    const origIdx = lineToIdx.get(dl as DiffLine)
    if (origIdx !== undefined) {
      const hunk = lineToHunk.get(origIdx)
      if (hunk) {
        displayLineToHunk.set(di, hunk)
        if (dl === hunk.lines[0]) {
          displayHunkStarts.add(di)
        }
      }
    }
  }

  bodyEl.innerHTML = ''

  const leftSide = document.createElement('div')
  leftSide.className = 'flex-1 overflow-auto min-w-0 border-r border-border'

  const gutter = document.createElement('div')
  gutter.className = 'w-[28px] shrink-0 overflow-hidden relative bg-bg-secondary border-r border-border'

  const gutterInner = document.createElement('div')
  gutterInner.className = 'relative'
  gutterInner.style.height = `${displayLines.length * ROW_HEIGHT}px`

  const gutterButtons: { startIdx: number; btn: HTMLButtonElement }[] = []
  for (const startIdx of displayHunkStarts) {
    const hunk = displayLineToHunk.get(startIdx)!
    const btn = document.createElement('button')
    btn.className =
      'absolute left-[3px] w-[22px] h-[20px] flex items-center justify-center text-[12px] rounded-sm cursor-pointer border-none bg-accent/20 text-accent transition-colors duration-100 hover:bg-accent/40'
    btn.style.top = `${startIdx * ROW_HEIGHT}px`
    btn.innerHTML = '&#x21A9;'
    btn.title = 'Revert this change'
    btn.addEventListener('click', () => {
      revertHunk(hunk, diff.oldContent, diff.newContent, diff.filePath)
    })
    gutterInner.appendChild(btn)
    gutterButtons.push({ startIdx, btn })
  }

  gutter.appendChild(gutterInner)

  const rightSide = document.createElement('div')
  rightSide.className = 'flex-1 overflow-auto min-w-0'

  const leftTable = document.createElement('table')
  leftTable.className = 'w-full border-collapse font-mono text-[13px] leading-[20px]'
  const leftBody = document.createElement('tbody')

  const rightTable = document.createElement('table')
  rightTable.className = 'w-full border-collapse font-mono text-[13px] leading-[20px]'
  const rightBody = document.createElement('tbody')

  let firstChangeDisplayIdx = -1

  for (let i = 0; i < displayLines.length; i++) {
    const dl = displayLines[i]

    if (dl.type === 'separator') {
      const hiddenCount = dl.hiddenEnd - dl.hiddenStart + 1
      const separatorKey = `${dl.hiddenStart}-${dl.hiddenEnd}`

      const leftRow = document.createElement('tr')
      leftRow.className = 'cursor-pointer hover:bg-white/4 transition-colors'
      const leftCell = document.createElement('td')
      leftCell.colSpan = 2
      leftCell.className =
        'text-center text-text-muted text-[12px] select-none border-t border-b border-border bg-bg-secondary'
      leftCell.textContent = `\u25BC ${hiddenCount} hidden lines`
      leftRow.appendChild(leftCell)
      leftBody.appendChild(leftRow)

      const rightRow = document.createElement('tr')
      rightRow.className = 'cursor-pointer hover:bg-white/4 transition-colors'
      const rightCell = document.createElement('td')
      rightCell.colSpan = 2
      rightCell.className =
        'text-center text-text-muted text-[12px] select-none border-t border-b border-border bg-bg-secondary'
      rightCell.textContent = `\u25BC ${hiddenCount} hidden lines`
      rightRow.appendChild(rightCell)
      rightBody.appendChild(rightRow)

      const expandHandler = () => {
        expandedSeparators.add(separatorKey)
        renderDiff()
      }
      leftRow.addEventListener('click', expandHandler)
      rightRow.addEventListener('click', expandHandler)
      continue
    }

    const line = dl as DiffLine

    if (firstChangeDisplayIdx < 0 && line.type !== 'context') {
      firstChangeDisplayIdx = i
    }

    // Left side
    const leftRow = document.createElement('tr')

    const leftLineNo = document.createElement('td')
    leftLineNo.className = 'w-[50px] min-w-[50px] text-right px-2 text-[13px] text-text-muted select-none align-top'
    leftLineNo.textContent = line.type !== 'add' && line.oldLineNo != null ? String(line.oldLineNo) : ''

    const leftContent = document.createElement('td')
    leftContent.className = 'px-3 whitespace-pre tab-[4] hljs'

    if (line.type === 'remove') {
      leftRow.className = 'bg-red/15'
      leftLineNo.classList.add('bg-red/20')
      leftContent.innerHTML = line.oldLineNo != null ? oldHighlighted[line.oldLineNo - 1] || '' : ''
    } else if (line.type === 'add') {
      leftRow.className = 'bg-white/2'
      leftContent.innerHTML = '\u00A0'
    } else if (line.type === 'context') {
      leftContent.innerHTML = line.oldLineNo != null ? oldHighlighted[line.oldLineNo - 1] || '' : ''
    }

    leftRow.appendChild(leftLineNo)
    leftRow.appendChild(leftContent)
    leftBody.appendChild(leftRow)

    // Right side
    const rightRow = document.createElement('tr')

    const rightLineNo = document.createElement('td')
    rightLineNo.className = 'w-[50px] min-w-[50px] text-right px-2 text-[13px] text-text-muted select-none align-top'
    rightLineNo.textContent = line.type !== 'remove' && line.newLineNo != null ? String(line.newLineNo) : ''

    const rightContent = document.createElement('td')
    rightContent.className = 'px-3 whitespace-pre tab-[4] hljs'

    if (line.type === 'add') {
      rightRow.className = 'bg-green/15'
      rightLineNo.classList.add('bg-green/20')
      rightContent.innerHTML = line.newLineNo != null ? newHighlighted[line.newLineNo - 1] || '' : ''
    } else if (line.type === 'remove') {
      rightRow.className = 'bg-white/2'
      rightContent.innerHTML = '\u00A0'
    } else if (line.type === 'context') {
      rightContent.innerHTML = line.newLineNo != null ? newHighlighted[line.newLineNo - 1] || '' : ''
    }

    rightRow.appendChild(rightLineNo)
    rightRow.appendChild(rightContent)
    rightBody.appendChild(rightRow)
  }

  leftTable.appendChild(leftBody)
  rightTable.appendChild(rightBody)
  leftSide.appendChild(leftTable)
  rightSide.appendChild(rightTable)
  bodyEl.appendChild(leftSide)
  bodyEl.appendChild(gutter)
  bodyEl.appendChild(rightSide)

  // Clean up previous scroll listeners
  if (scrollLeft && leftScrollHandler) scrollLeft.removeEventListener('scroll', leftScrollHandler)
  if (scrollRight && rightScrollHandler) scrollRight.removeEventListener('scroll', rightScrollHandler)

  // Synchronized scrolling
  scrollLeft = leftSide
  scrollRight = rightSide
  scrollGutterInner = gutterInner
  let syncing = false
  leftScrollHandler = () => {
    if (syncing) return
    syncing = true
    rightSide.scrollTop = leftSide.scrollTop
    rightSide.scrollLeft = leftSide.scrollLeft
    gutterInner.style.transform = `translateY(-${leftSide.scrollTop}px)`
    syncing = false
  }
  rightScrollHandler = () => {
    if (syncing) return
    syncing = true
    leftSide.scrollTop = rightSide.scrollTop
    leftSide.scrollLeft = rightSide.scrollLeft
    gutterInner.style.transform = `translateY(-${rightSide.scrollTop}px)`
    syncing = false
  }
  leftSide.addEventListener('scroll', leftScrollHandler)
  rightSide.addEventListener('scroll', rightScrollHandler)

  // Align gutter buttons to actual row positions and scroll to first change
  requestAnimationFrame(() => {
    for (const { startIdx, btn } of gutterButtons) {
      const row = leftBody.children[startIdx] as HTMLElement | undefined
      if (row) {
        btn.style.top = `${row.offsetTop}px`
      }
    }
    gutterInner.style.height = `${leftTable.offsetHeight}px`

    if (firstChangeDisplayIdx > 0) {
      const firstRow = leftBody.children[firstChangeDisplayIdx] as HTMLElement | undefined
      const scrollTop = firstRow ? firstRow.offsetTop : firstChangeDisplayIdx * ROW_HEIGHT
      leftSide.scrollTop = scrollTop
      rightSide.scrollTop = scrollTop
      gutterInner.style.transform = `translateY(-${scrollTop}px)`
    }
  })
}

async function revertHunk(hunk: Hunk, oldContent: string, newContent: string, filePath: string): Promise<void> {
  if (reverting) return
  reverting = true
  try {
    await doRevertHunk(hunk, oldContent, newContent, filePath)
  } finally {
    reverting = false
  }
}

async function doRevertHunk(hunk: Hunk, oldContent: string, newContent: string, filePath: string): Promise<void> {
  const newLines = newContent.split('\n')

  const oldLines: string[] = []
  for (const line of hunk.lines) {
    if (line.type === 'remove') {
      oldLines.push(line.content)
    }
  }

  if (hunk.newStart > 0 && hunk.newEnd > 0) {
    newLines.splice(hunk.newStart - 1, hunk.newEnd - hunk.newStart + 1, ...oldLines)
  } else if (hunk.newStart === 0 && oldLines.length > 0) {
    const firstRemoveLine = hunk.lines.find((l) => l.type === 'remove')
    if (firstRemoveLine?.oldLineNo != null) {
      const insertAt = Math.min(firstRemoveLine.oldLineNo - 1, newLines.length)
      newLines.splice(insertAt, 0, ...oldLines)
    }
  } else if (hunk.newStart > 0 && oldLines.length === 0) {
    newLines.splice(hunk.newStart - 1, hunk.newEnd - hunk.newStart + 1)
  }

  const result = newLines.join('\n')
  await window.git.writeFileContent(filePath, result)
  onRefreshDiff?.()
}

function showTooLarge(filePath: string) {
  currentDiffData = null
  headerEl.classList.remove('hidden')
  headerEl.innerHTML = `<span class="font-mono text-xs text-text-primary">${escapeHtml(filePath)}</span>`
  bodyEl.innerHTML =
    '<div class="flex-1 flex items-center justify-center h-full text-text-muted text-sm">File too large to diff (over 2 MB)</div>'
}

function clear() {
  headerEl.classList.add('hidden')
  bodyEl.innerHTML =
    '<div class="flex-1 flex items-center justify-center h-full text-text-muted text-sm">Select a file to view diff</div>'
}

// LCS-based diff algorithm with prefix/suffix trimming and memory-safe fallback
function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText ? oldText.split('\n') : []
  const newLines = newText ? newText.split('\n') : []

  if (oldLines.length === 0 && newLines.length === 0) return []

  if (oldLines.length === 0) {
    return newLines.map((line, i) => ({ type: 'add' as const, newLineNo: i + 1, content: line }))
  }

  if (newLines.length === 0) {
    return oldLines.map((line, i) => ({ type: 'remove' as const, oldLineNo: i + 1, content: line }))
  }

  // Trim common prefix
  let prefixLen = 0
  const minLen = Math.min(oldLines.length, newLines.length)
  while (prefixLen < minLen && oldLines[prefixLen] === newLines[prefixLen]) {
    prefixLen++
  }

  // Trim common suffix
  let suffixLen = 0
  while (
    suffixLen < oldLines.length - prefixLen &&
    suffixLen < newLines.length - prefixLen &&
    oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++
  }

  const result: DiffLine[] = []

  for (let i = 0; i < prefixLen; i++) {
    result.push({ type: 'context', oldLineNo: i + 1, newLineNo: i + 1, content: oldLines[i] })
  }

  const midOld = oldLines.slice(prefixLen, oldLines.length - suffixLen)
  const midNew = newLines.slice(prefixLen, newLines.length - suffixLen)

  if (midOld.length === 0 && midNew.length === 0) {
    // identical middle — nothing to do
  } else if (midOld.length === 0) {
    for (let i = 0; i < midNew.length; i++) {
      result.push({ type: 'add', newLineNo: prefixLen + i + 1, content: midNew[i] })
    }
  } else if (midNew.length === 0) {
    for (let i = 0; i < midOld.length; i++) {
      result.push({ type: 'remove', oldLineNo: prefixLen + i + 1, content: midOld[i] })
    }
  } else if (midOld.length * midNew.length > 4_000_000) {
    // Too large for LCS — show as full replacement to avoid OOM
    for (let i = 0; i < midOld.length; i++) {
      result.push({ type: 'remove', oldLineNo: prefixLen + i + 1, content: midOld[i] })
    }
    for (let i = 0; i < midNew.length; i++) {
      result.push({ type: 'add', newLineNo: prefixLen + i + 1, content: midNew[i] })
    }
  } else {
    // LCS with flat Int32Array (4 bytes per cell instead of ~40+ for JS number[][])
    const m = midOld.length
    const n = midNew.length
    const cols = n + 1
    const dp = new Int32Array((m + 1) * cols)

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (midOld[i - 1] === midNew[j - 1]) {
          dp[i * cols + j] = dp[(i - 1) * cols + (j - 1)] + 1
        } else {
          dp[i * cols + j] = Math.max(dp[(i - 1) * cols + j], dp[i * cols + (j - 1)])
        }
      }
    }

    const midResult: DiffLine[] = []
    let i = m
    let j = n

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && midOld[i - 1] === midNew[j - 1]) {
        midResult.push({ type: 'context', oldLineNo: prefixLen + i, newLineNo: prefixLen + j, content: midOld[i - 1] })
        i--
        j--
      } else if (j > 0 && (i === 0 || dp[i * cols + (j - 1)] >= dp[(i - 1) * cols + j])) {
        midResult.push({ type: 'add', newLineNo: prefixLen + j, content: midNew[j - 1] })
        j--
      } else {
        midResult.push({ type: 'remove', oldLineNo: prefixLen + i, content: midOld[i - 1] })
        i--
      }
    }

    midResult.reverse()
    result.push(...midResult)
  }

  const oldSuffixStart = oldLines.length - suffixLen
  const newSuffixStart = newLines.length - suffixLen
  for (let i = 0; i < suffixLen; i++) {
    result.push({
      type: 'context',
      oldLineNo: oldSuffixStart + i + 1,
      newLineNo: newSuffixStart + i + 1,
      content: oldLines[oldSuffixStart + i],
    })
  }

  return result
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export { showDiff, showTooLarge, clear, setOnRefreshDiff }
