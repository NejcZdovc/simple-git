export interface ContextMenuItem {
  label: string
  action: () => void
  disabled?: boolean
  destructive?: boolean
}

const menuEl = document.getElementById('context-menu')!

let visible = false

function show(x: number, y: number, items: ContextMenuItem[]) {
  menuEl.innerHTML = ''

  for (const item of items) {
    const btn = document.createElement('button')
    btn.className =
      'block w-full px-3.5 py-[7px] border-none bg-transparent text-text-primary text-sm font-[inherit] cursor-pointer text-left transition-[background] duration-100 hover:bg-white/6'
    if (item.disabled) {
      btn.classList.remove('text-text-primary')
      btn.classList.add('text-text-muted', 'pointer-events-none')
    }
    if (item.destructive) {
      btn.classList.remove('text-text-primary', 'hover:bg-white/6')
      btn.classList.add('text-red', 'hover:bg-red/10')
    }
    btn.textContent = item.label
    btn.addEventListener('click', () => {
      hide()
      if (!item.disabled) item.action()
    })
    menuEl.appendChild(btn)
  }

  // Position, keeping on screen
  menuEl.classList.remove('hidden')
  visible = true

  const rect = menuEl.getBoundingClientRect()
  const finalX = Math.min(x, window.innerWidth - rect.width - 8)
  const finalY = Math.min(y, window.innerHeight - rect.height - 8)
  menuEl.style.left = `${finalX}px`
  menuEl.style.top = `${finalY}px`
}

function hide() {
  menuEl.classList.add('hidden')
  visible = false
}

// Close on click outside or Escape
document.addEventListener('click', () => {
  if (visible) hide()
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && visible) hide()
})

export { show, hide }
