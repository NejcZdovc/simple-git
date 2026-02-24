const overlayEl = document.getElementById('checkout-overlay')!
const titleEl = document.getElementById('checkout-title')!
const fileListEl = document.getElementById('checkout-file-list')!
const cancelBtn = document.getElementById('checkout-cancel')!
const discardBtn = document.getElementById('checkout-discard')!
const stashBtn = document.getElementById('checkout-stash')!
const closeBtn = document.getElementById('checkout-close')!

type CheckoutAction = 'discard' | 'stash' | 'cancel'

let onAction: ((action: CheckoutAction) => void) | null = null

const statusLabels: Record<string, { label: string; className: string }> = {
  M: { label: 'M', className: 'bg-yellow/20 text-yellow' },
  A: { label: 'A', className: 'bg-green/20 text-green' },
  D: { label: 'D', className: 'bg-red/20 text-red' },
  '?': { label: 'A', className: 'bg-green/20 text-green' },
}

function show(branch: string, files: { path: string; status: string }[], cb: (action: CheckoutAction) => void) {
  onAction = cb
  titleEl.textContent = `Switch to ${branch}`

  fileListEl.innerHTML = ''
  for (const file of files) {
    const row = document.createElement('div')
    row.className = 'flex items-center gap-2 py-1 px-2 rounded-sm'

    const badge = document.createElement('span')
    const info = statusLabels[file.status] || statusLabels.M
    badge.className = `text-[11px] font-bold w-4 text-center shrink-0 rounded-[2px] ${info.className}`
    badge.textContent = info.label

    const name = document.createElement('span')
    name.className = 'text-[13px] text-text-primary font-mono truncate'
    name.textContent = file.path

    row.appendChild(badge)
    row.appendChild(name)
    fileListEl.appendChild(row)
  }

  overlayEl.classList.remove('hidden')
}

function hide() {
  overlayEl.classList.add('hidden')
  onAction = null
}

function resolve(action: CheckoutAction) {
  if (onAction) {
    onAction(action)
    hide()
  }
}

cancelBtn.addEventListener('click', () => resolve('cancel'))
closeBtn.addEventListener('click', () => resolve('cancel'))
discardBtn.addEventListener('click', () => resolve('discard'))
stashBtn.addEventListener('click', () => resolve('stash'))

overlayEl.addEventListener('click', (e) => {
  if (e.target === overlayEl) resolve('cancel')
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !overlayEl.classList.contains('hidden')) {
    resolve('cancel')
  }
})

export { show, hide }
