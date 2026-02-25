const containerEl = document.getElementById('toast-container')!

let hideTimer: ReturnType<typeof setTimeout> | null = null

function show(message: string) {
  containerEl.textContent = message
  containerEl.classList.remove('hidden', 'opacity-0')
  containerEl.classList.add('opacity-100')

  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    containerEl.classList.remove('opacity-100')
    containerEl.classList.add('opacity-0')
    setTimeout(() => {
      containerEl.classList.add('hidden')
    }, 200)
    hideTimer = null
  }, 5000)
}

export { show }
