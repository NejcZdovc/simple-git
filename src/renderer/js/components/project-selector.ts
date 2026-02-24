import * as addProjectDialog from './add-project-dialog'

const container = document.getElementById('project-selector')!

let currentProject: string | null = null
let projects: { path: string; name: string }[] = []
let menuOpen = false
let onProjectChange: ((path: string) => void) | null = null

function setOnProjectChange(cb: (path: string) => void) {
  onProjectChange = cb
}

function render() {
  container.innerHTML = ''

  const currentEntry = projects.find((p) => p.path === currentProject)
  const label = currentEntry ? currentEntry.name : currentProject ? currentProject.split('/').pop()! : 'Select Project'

  const btn = document.createElement('button')
  btn.className =
    'flex items-center gap-1.5 px-3 py-[5px] border border-border rounded-sm bg-bg-secondary text-text-primary text-sm font-medium cursor-pointer transition-all duration-150 whitespace-nowrap font-[inherit] hover:bg-bg-card hover:border-white/15'
  btn.innerHTML = `
    <span>${label}</span>
    <span class="text-[10px] text-text-secondary ml-0.5">▾</span>
  `
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleMenu()
  })
  container.appendChild(btn)
}

function toggleMenu() {
  if (menuOpen) {
    closeMenu()
    return
  }
  menuOpen = true

  const backdrop = document.createElement('div')
  backdrop.className = 'fixed inset-0 z-[299]'
  backdrop.addEventListener('click', () => closeMenu())
  container.appendChild(backdrop)

  const menu = document.createElement('div')
  menu.className =
    'absolute top-[calc(100%+4px)] left-0 min-w-[200px] max-w-[350px] max-h-[300px] overflow-y-auto bg-bg-secondary border border-border rounded-sm shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-300 py-1'

  const projectsToShow = [...projects]
  if (currentProject && !projects.some((p) => p.path === currentProject)) {
    const name = currentProject.split('/').pop() || currentProject
    projectsToShow.unshift({ path: currentProject, name })
  }

  for (const p of projectsToShow) {
    const item = document.createElement('div')
    item.className =
      'flex items-center gap-2 px-3 py-[7px] text-sm text-text-primary cursor-pointer transition-[background] duration-100 whitespace-nowrap overflow-hidden text-ellipsis border-none bg-transparent w-full text-left font-[inherit] hover:bg-white/6'
    if (p.path === currentProject) item.classList.add('text-accent')

    if (p.path === currentProject) {
      const dot = document.createElement('span')
      dot.className = 'w-1.5 h-1.5 rounded-full bg-accent shrink-0'
      item.appendChild(dot)
    }

    const nameSpan = document.createElement('span')
    nameSpan.textContent = p.name
    nameSpan.title = p.path
    nameSpan.style.flex = '1'
    nameSpan.style.overflow = 'hidden'
    nameSpan.style.textOverflow = 'ellipsis'
    item.appendChild(nameSpan)

    const removeBtn = document.createElement('button')
    removeBtn.className =
      'ml-auto px-1 text-text-muted text-base leading-none cursor-pointer border-none bg-transparent rounded-[3px] shrink-0 hover:text-red hover:bg-red/10'
    removeBtn.textContent = '×'
    removeBtn.title = 'Remove project'
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      await window.git.removeProject(p.path)
      const store = await window.git.getProjects()
      projects = store.projects
      closeMenu()
      render()
      if (p.path === currentProject && projects.length > 0) {
        onProjectChange?.(projects[0].path)
      }
    })
    item.appendChild(removeBtn)

    item.addEventListener('click', () => {
      closeMenu()
      if (p.path !== currentProject) {
        onProjectChange?.(p.path)
      }
    })
    menu.appendChild(item)
  }

  if (projectsToShow.length > 0) {
    const sep = document.createElement('div')
    sep.className = 'h-px bg-border my-1'
    menu.appendChild(sep)
  }

  const addItem = document.createElement('div')
  addItem.className =
    'flex items-center gap-2 px-3 py-[7px] text-sm text-accent cursor-pointer transition-[background] duration-100 whitespace-nowrap overflow-hidden text-ellipsis border-none bg-transparent w-full text-left font-[inherit] hover:bg-white/6'
  addItem.textContent = 'Add Project...'
  addItem.addEventListener('click', () => {
    closeMenu()
    addProjectDialog.show(async (folderPath, name) => {
      await window.git.addProject(folderPath, name)
      const store = await window.git.getProjects()
      projects = store.projects
      render()
      onProjectChange?.(folderPath)
    })
  })
  menu.appendChild(addItem)

  container.appendChild(menu)
}

function closeMenu() {
  menuOpen = false
  const backdrop = container.querySelector('.fixed')
  if (backdrop) backdrop.remove()
  const menu = container.querySelector('.absolute')
  if (menu) menu.remove()
}

function setProjects(list: { path: string; name: string }[], current: string | null) {
  projects = list
  currentProject = current
  render()
}

function setCurrentProject(p: string) {
  currentProject = p
  render()
}

export { setOnProjectChange, setProjects, setCurrentProject }
