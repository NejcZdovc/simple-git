const containerEl = document.getElementById('toast-container')!

let hideTimer: ReturnType<typeof setTimeout> | null = null

function show(message: string, action?: { label: string; onClick: () => void }) {
  containerEl.textContent = ''

  const textNode = document.createTextNode(message)
  containerEl.appendChild(textNode)

  if (action) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.textContent = action.label
    btn.className =
      'ml-3 px-2 py-0.5 text-[13px] font-semibold text-accent hover:text-accent-hover bg-transparent border-none cursor-pointer'
    btn.addEventListener('click', action.onClick)
    containerEl.appendChild(btn)
  }

  containerEl.classList.remove('hidden', 'opacity-0')
  containerEl.classList.add('opacity-100')

  if (hideTimer) clearTimeout(hideTimer)

  if (!action) {
    hideTimer = setTimeout(() => {
      containerEl.classList.remove('opacity-100')
      containerEl.classList.add('opacity-0')
      setTimeout(() => {
        containerEl.classList.add('hidden')
      }, 200)
      hideTimer = null
    }, 5000)
  }
}

export { show }
