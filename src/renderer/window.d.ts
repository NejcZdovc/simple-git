interface ProjectEntry {
  path: string
  name: string
}

interface GitApi {
  // Store
  getProjects(): Promise<{ projects: ProjectEntry[]; lastProject?: string }>
  addProject(path: string, name: string): Promise<{ projects: ProjectEntry[]; lastProject?: string }>
  removeProject(path: string): Promise<{ projects: ProjectEntry[]; lastProject?: string }>
  setLastProject(path: string): Promise<void>
  getSettings(): Promise<{ dropMode: 'hard' | 'soft'; diffViewMode: 'full' | 'minimal' }>
  updateSettings(
    partial: Record<string, unknown>,
  ): Promise<{ dropMode: 'hard' | 'soft'; diffViewMode: 'full' | 'minimal' }>

  // Dialog
  openFolder(): Promise<string | null>

  // Git
  openRepo(path: string): Promise<boolean>
  getBranches(): Promise<{ branches: { name: string; current: boolean }[]; current: string }>
  getLocalChanges(): Promise<{ path: string; status: string }[]>
  discardLocalChanges(): Promise<void>
  checkoutBranch(branch: string): Promise<void>
  stashAndCheckout(branch: string): Promise<void>
  discardAndCheckout(branch: string): Promise<void>
  getLog(
    branch: string,
    page: number,
    pageSize: number,
  ): Promise<{
    commits: {
      hash: string
      message: string
      authorName: string
      authorEmail: string
      date: string
      refs: string
    }[]
    total: number
  }>
  getCommitFiles(hash: string): Promise<{ path: string; status: string; insertions: number; deletions: number }[]>
  getFileDiff(
    hash: string,
    filePath: string,
  ): Promise<{ oldContent: string; newContent: string; filePath: string; status: string; tooLarge?: boolean }>
  revertFile(hash: string, filePath: string): Promise<void>
  dropCommit(hash: string): Promise<void>
  squashCommits(hashes: string[], message: string): Promise<void>
  getCommitMessage(hash: string): Promise<string>
  writeFileContent(filePath: string, content: string): Promise<void>

  // Events
  onOpenSettings(callback: () => void): void
}

interface Window {
  git: GitApi
}
