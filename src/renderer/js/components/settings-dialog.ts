const overlayEl = document.getElementById('settings-overlay')!
const closeBtn = document.getElementById('settings-close')!
const doneBtn = document.getElementById('settings-done')!
const dropModeSelect = document.getElementById('settings-drop-mode') as HTMLSelectElement
const diffViewModeSelect = document.getElementById('settings-diff-view-mode') as HTMLSelectElement
const commitModeSelect = document.getElementById('settings-commit-mode') as HTMLSelectElement

async function show() {
  const settings = await window.git.getSettings()
  dropModeSelect.value = settings.dropMode
  diffViewModeSelect.value = settings.diffViewMode
  commitModeSelect.value = settings.commitMode
  overlayEl.classList.remove('hidden')
}

function hide() {
  overlayEl.classList.add('hidden')
}

closeBtn.addEventListener('click', hide)

overlayEl.addEventListener('click', (e) => {
  if (e.target === overlayEl) hide()
})

dropModeSelect.addEventListener('change', async () => {
  await window.git.updateSettings({ dropMode: dropModeSelect.value })
})

let onDiffViewModeChange: (() => void) | null = null

function setOnDiffViewModeChange(cb: () => void) {
  onDiffViewModeChange = cb
}

diffViewModeSelect.addEventListener('change', async () => {
  await window.git.updateSettings({ diffViewMode: diffViewModeSelect.value })
  onDiffViewModeChange?.()
})

let onCommitModeChange: (() => void) | null = null

function setOnCommitModeChange(cb: () => void) {
  onCommitModeChange = cb
}

commitModeSelect.addEventListener('change', async () => {
  await window.git.updateSettings({ commitMode: commitModeSelect.value })
  onCommitModeChange?.()
})

doneBtn.addEventListener('click', hide)

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !overlayEl.classList.contains('hidden')) {
    hide()
  }
})

export { show, hide, setOnDiffViewModeChange, setOnCommitModeChange }
