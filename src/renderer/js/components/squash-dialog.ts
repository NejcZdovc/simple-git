const overlayEl = document.getElementById('squash-overlay')!
const titleEl = document.getElementById('squash-title')!
const messageEl = document.getElementById('squash-message') as HTMLTextAreaElement
const cancelBtn = document.getElementById('squash-cancel')!
const confirmBtn = document.getElementById('squash-confirm')!
const closeBtn = document.getElementById('squash-close')!

let onConfirm: ((message: string) => void) | null = null

function show(commitCount: number, combinedMessage: string, cb: (message: string) => void) {
  onConfirm = cb
  titleEl.textContent = `Squash ${commitCount} commits`
  messageEl.value = combinedMessage
  overlayEl.classList.remove('hidden')
  messageEl.focus()
}

function hide() {
  overlayEl.classList.add('hidden')
  onConfirm = null
}

cancelBtn.addEventListener('click', hide)
closeBtn.addEventListener('click', hide)

overlayEl.addEventListener('click', (e) => {
  if (e.target === overlayEl) hide()
})

confirmBtn.addEventListener('click', () => {
  const msg = messageEl.value.trim()
  if (msg && onConfirm) {
    onConfirm(msg)
    hide()
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !overlayEl.classList.contains('hidden')) {
    hide()
  }
})

export { show, hide }
