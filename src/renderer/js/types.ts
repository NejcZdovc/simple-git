export interface CommitInfo {
  hash: string
  message: string
  authorName: string
  authorEmail: string
  date: string
  refs: string
}

export interface BranchInfo {
  name: string
  current: boolean
}

export interface FileChange {
  path: string
  status: string
  insertions: number
  deletions: number
}

export interface FileDiff {
  oldContent: string
  newContent: string
  filePath: string
  status: string
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context'
  oldLineNo?: number
  newLineNo?: number
  content: string
}

export interface AppSettings {
  dropMode: 'hard' | 'soft'
  diffViewMode: 'full' | 'minimal'
}
