import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

interface ProjectEntry {
  path: string
  name: string
}

interface ProjectStore {
  projects: ProjectEntry[]
  lastProject?: string
}

interface AppSettings {
  dropMode: 'hard' | 'soft'
  diffViewMode: 'full' | 'minimal'
}

const defaultSettings: AppSettings = {
  dropMode: 'hard',
  diffViewMode: 'full',
}

function getStorePath(filename: string): string {
  return path.join(app.getPath('userData'), filename)
}

function readJson<T>(filename: string, fallback: T): T {
  const filePath = getStorePath(filename)
  try {
    const data = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(data) as T
  } catch {
    return fallback
  }
}

function writeJson<T>(filename: string, data: T): void {
  const filePath = getStorePath(filename)
  const tmpPath = `${filePath}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

// Migrate old string[] format to ProjectEntry[]
function migrateProjects(raw: { projects: (string | ProjectEntry)[]; lastProject?: string }): ProjectStore {
  const projects: ProjectEntry[] = raw.projects.map((p) => {
    if (typeof p === 'string') {
      return { path: p, name: p.split('/').pop() || p }
    }
    return p
  })
  return { projects, lastProject: raw.lastProject }
}

// Projects
function getProjects(): ProjectStore {
  const raw = readJson<{ projects: (string | ProjectEntry)[]; lastProject?: string }>('projects.json', {
    projects: [],
  })
  return migrateProjects(raw)
}

function addProject(projectPath: string, projectName: string): ProjectStore {
  const store = getProjects()
  if (!store.projects.some((p) => p.path === projectPath)) {
    store.projects.push({ path: projectPath, name: projectName })
  }
  store.lastProject = projectPath
  writeJson('projects.json', store)
  return store
}

function removeProject(projectPath: string): ProjectStore {
  const store = getProjects()
  store.projects = store.projects.filter((p) => p.path !== projectPath)
  if (store.lastProject === projectPath) {
    store.lastProject = store.projects[0]?.path
  }
  writeJson('projects.json', store)
  return store
}

function setLastProject(projectPath: string): void {
  const store = getProjects()
  store.lastProject = projectPath
  writeJson('projects.json', store)
}

// Settings
function getSettings(): AppSettings {
  return { ...defaultSettings, ...readJson<Partial<AppSettings>>('settings.json', {}) }
}

const VALID_DROP_MODES: AppSettings['dropMode'][] = ['hard', 'soft']
const VALID_DIFF_VIEW_MODES: AppSettings['diffViewMode'][] = ['full', 'minimal']

function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const settings = getSettings()
  const sanitized: Partial<AppSettings> = {}
  if ('dropMode' in partial && VALID_DROP_MODES.includes(partial.dropMode as AppSettings['dropMode'])) {
    sanitized.dropMode = partial.dropMode
  }
  if (
    'diffViewMode' in partial &&
    VALID_DIFF_VIEW_MODES.includes(partial.diffViewMode as AppSettings['diffViewMode'])
  ) {
    sanitized.diffViewMode = partial.diffViewMode
  }
  const updated = { ...settings, ...sanitized }
  writeJson('settings.json', updated)
  return updated
}

export { getProjects, addProject, removeProject, setLastProject, getSettings, updateSettings }
export type { ProjectStore, ProjectEntry, AppSettings }
