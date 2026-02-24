const overlayEl = document.getElementById('add-project-overlay')!
const pathInput = document.getElementById('add-project-path') as HTMLInputElement
const nameInput = document.getElementById('add-project-name') as HTMLInputElement
const browseBtn = document.getElementById('add-project-browse')!
const cancelBtn = document.getElementById('add-project-cancel')!
const confirmBtn = document.getElementById('add-project-confirm') as HTMLButtonElement
const closeBtn = document.getElementById('add-project-close')!

let selectedPath: string | null = null
let onConfirm: ((path: string, name: string) => void) | null = null

function show(cb: (path: string, name: string) => void) {
  onConfirm = cb
  selectedPath = null
  pathInput.value = ''
  nameInput.value = ''
  confirmBtn.disabled = true
  overlayEl.classList.remove('hidden')
}

function hide() {
  overlayEl.classList.add('hidden')
  onConfirm = null
  selectedPath = null
}

function basename(p: string): string {
  return p.split('/').pop() || p
}

browseBtn.addEventListener('click', async () => {
  const folderPath = await window.git.openFolder()
  if (folderPath) {
    selectedPath = folderPath
    pathInput.value = folderPath
    if (!nameInput.value) {
      nameInput.placeholder = basename(folderPath)
    }
    confirmBtn.disabled = false
  }
})

cancelBtn.addEventListener('click', hide)
closeBtn.addEventListener('click', hide)

overlayEl.addEventListener('click', (e) => {
  if (e.target === overlayEl) hide()
})

confirmBtn.addEventListener('click', () => {
  if (!selectedPath || !onConfirm) return
  const name = nameInput.value.trim() || basename(selectedPath)
  onConfirm(selectedPath, name)
  hide()
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !overlayEl.classList.contains('hidden')) {
    hide()
  }
  if (e.key === 'Enter' && !overlayEl.classList.contains('hidden') && selectedPath) {
    confirmBtn.click()
  }
})

export { show, hide }
