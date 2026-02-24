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
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
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

function updateSettings(partial: Partial<AppSettings>): AppSettings {
  const settings = getSettings()
  const updated = { ...settings, ...partial }
  writeJson('settings.json', updated)
  return updated
}

export { getProjects, addProject, removeProject, setLastProject, getSettings, updateSettings }
export type { ProjectStore, ProjectEntry, AppSettings }
