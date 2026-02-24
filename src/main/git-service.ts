import simpleGit, { type SimpleGit } from 'simple-git'
import { getSettings } from './store'

let git: SimpleGit | null = null
let repoPath: string | null = null

interface CommitInfo {
  hash: string
  message: string
  authorName: string
  authorEmail: string
  date: string
  refs: string
}

interface BranchInfo {
  name: string
  current: boolean
}

interface FileChange {
  path: string
  status: string
  insertions: number
  deletions: number
}

interface FileDiff {
  oldContent: string
  newContent: string
  filePath: string
  status: string
}

async function openRepo(path: string): Promise<boolean> {
  const instance = simpleGit(path)
  const isRepo = await instance.checkIsRepo()
  if (!isRepo) {
    throw new Error('Not a git repository')
  }
  git = instance
  repoPath = path
  return true
}

function ensureGit(): SimpleGit {
  if (!git) throw new Error('No repository opened')
  return git
}

async function getBranches(): Promise<{ branches: BranchInfo[]; current: string }> {
  const g = ensureGit()
  const summary = await g.branchLocal()
  const branches: BranchInfo[] = summary.all.map((name) => ({
    name,
    current: name === summary.current,
  }))
  return { branches, current: summary.current }
}

interface LocalChange {
  path: string
  status: string
}

async function getLocalChanges(): Promise<LocalChange[]> {
  const g = ensureGit()
  const status = await g.status()
  return status.files.map((f) => ({
    path: f.path,
    status: f.working_dir === '?' ? 'A' : f.working_dir || f.index || 'M',
  }))
}

async function discardLocalChanges(): Promise<void> {
  const g = ensureGit()
  await g.checkout(['.'])
  await g.clean('f', ['-d'])
}

async function checkoutBranch(branch: string): Promise<void> {
  const g = ensureGit()
  await g.checkout(branch)
}

async function stashAndCheckout(branch: string): Promise<void> {
  const g = ensureGit()
  await g.stash(['push', '-m', `Auto-stash before switching to ${branch}`])
  await g.checkout(branch)
}

async function getLog(
  branch: string,
  page: number,
  pageSize: number,
): Promise<{ commits: CommitInfo[]; total: number }> {
  const g = ensureGit()

  // Get total count
  const countResult = await g.raw(['rev-list', '--count', branch])
  const total = Number.parseInt(countResult.trim(), 10)

  const skip = page * pageSize
  const logResult = await g.raw([
    'log',
    branch,
    `--skip=${skip}`,
    `-n`,
    `${pageSize}`,
    '--format=%H%n%s%n%an%n%ae%n%aI%n%D',
    '--',
  ])

  const commits: CommitInfo[] = []
  const lines = logResult.trim().split('\n')
  for (let i = 0; i < lines.length; i += 6) {
    if (!lines[i]) break
    commits.push({
      hash: lines[i],
      message: lines[i + 1],
      authorName: lines[i + 2],
      authorEmail: lines[i + 3],
      date: lines[i + 4],
      refs: lines[i + 5] || '',
    })
  }

  return { commits, total }
}

async function getCommitFiles(hash: string): Promise<FileChange[]> {
  const g = ensureGit()

  // Use diff-tree to get changed files with status
  const result = await g.raw(['diff-tree', '--no-commit-id', '-r', '--numstat', '--diff-filter=AMDRT', hash])

  const statusResult = await g.raw(['diff-tree', '--no-commit-id', '-r', '--name-status', hash])

  const statusMap = new Map<string, string>()
  for (const line of statusResult.trim().split('\n')) {
    if (!line) continue
    const parts = line.split('\t')
    if (parts.length >= 2) {
      statusMap.set(parts[1], parts[0])
    }
  }

  const files: FileChange[] = []
  for (const line of result.trim().split('\n')) {
    if (!line) continue
    const parts = line.split('\t')
    if (parts.length >= 3) {
      const insertions = parts[0] === '-' ? 0 : Number.parseInt(parts[0], 10)
      const deletions = parts[1] === '-' ? 0 : Number.parseInt(parts[1], 10)
      const filePath = parts[2]
      files.push({
        path: filePath,
        status: statusMap.get(filePath) || 'M',
        insertions,
        deletions,
      })
    }
  }

  return files
}

async function getFileDiff(hash: string, filePath: string): Promise<FileDiff> {
  const g = ensureGit()

  // Get the file status to know how to handle it
  const statusResult = await g.raw(['diff-tree', '--no-commit-id', '-r', '--name-status', hash, '--', filePath])
  const status = statusResult.trim().split('\t')[0] || 'M'

  let oldContent = ''
  let newContent = ''

  try {
    if (status !== 'A') {
      // Get old content from parent commit
      oldContent = await g.raw(['show', `${hash}^:${filePath}`])
    }
  } catch {
    oldContent = ''
  }

  try {
    if (status !== 'D') {
      // Get new content from this commit
      newContent = await g.raw(['show', `${hash}:${filePath}`])
    }
  } catch {
    newContent = ''
  }

  return { oldContent, newContent, filePath, status }
}

async function revertFile(hash: string, filePath: string): Promise<void> {
  const g = ensureGit()

  const statusResult = await g.raw(['diff-tree', '--no-commit-id', '-r', '--name-status', hash, '--', filePath])
  const status = statusResult.trim().split('\t')[0] || 'M'

  if (status === 'A') {
    // File was added in this commit — remove it
    const fs = await import('node:fs')
    const path = await import('node:path')
    const fullPath = path.join(repoPath!, filePath)
    if (fs.existsSync(fullPath)) {
      await g.raw(['rm', '--cached', filePath])
      fs.unlinkSync(fullPath)
    }
  } else {
    // File was modified or deleted — restore parent version
    await g.raw(['checkout', `${hash}^`, '--', filePath])
    await g.raw(['reset', 'HEAD', '--', filePath])
  }
}

async function dropCommit(hash: string): Promise<void> {
  const g = ensureGit()
  const settings = getSettings()

  // Check if this is the HEAD commit
  const headHash = (await g.raw(['rev-parse', 'HEAD'])).trim()
  const isHead = headHash === hash

  if (settings.dropMode === 'soft') {
    if (isHead) {
      await g.raw(['reset', '--soft', 'HEAD~1'])
    } else {
      // For non-HEAD commits in soft mode:
      // We need to remove the commit but keep its changes
      // Use rebase to remove the commit, then the changes will conflict or be lost
      // Better approach: rebase --onto to skip the commit
      const parentHash = (await g.raw(['rev-parse', `${hash}^`])).trim()
      await g.raw(['rebase', '--onto', parentHash, hash])
    }
  } else {
    // Hard drop: remove commit and its changes
    if (isHead) {
      await g.raw(['reset', '--hard', 'HEAD~1'])
    } else {
      const parentHash = (await g.raw(['rev-parse', `${hash}^`])).trim()
      await g.raw(['rebase', '--onto', parentHash, hash])
    }
  }
}

async function squashCommits(hashes: string[], message: string): Promise<void> {
  const g = ensureGit()

  if (hashes.length < 2) {
    throw new Error('Need at least 2 commits to squash')
  }

  // Sort hashes by commit order (newest first) to find the range
  // Get the commit timestamps to sort
  const commitDates: { hash: string; timestamp: number }[] = []
  for (const hash of hashes) {
    const ts = await g.raw(['show', '-s', '--format=%ct', hash])
    commitDates.push({ hash, timestamp: Number.parseInt(ts.trim(), 10) })
  }
  commitDates.sort((a, b) => a.timestamp - b.timestamp)

  // Oldest commit's parent is our reset target
  const oldestHash = commitDates[0].hash
  const parentHash = (await g.raw(['rev-parse', `${oldestHash}^`])).trim()

  // Soft reset to the parent of the oldest commit, then recommit
  await g.raw(['reset', '--soft', parentHash])
  await g.raw(['commit', '-m', message])
}

async function getCommitMessage(hash: string): Promise<string> {
  const g = ensureGit()
  return (await g.raw(['log', '-1', '--format=%B', hash])).trim()
}

async function writeFileContent(filePath: string, content: string): Promise<void> {
  if (!repoPath) throw new Error('No repository opened')
  const path = await import('node:path')
  const fs = await import('node:fs/promises')
  const fullPath = path.join(repoPath, filePath)
  await fs.writeFile(fullPath, content, 'utf-8')
}

export {
  openRepo,
  getBranches,
  getLocalChanges,
  discardLocalChanges,
  checkoutBranch,
  stashAndCheckout,
  getLog,
  getCommitFiles,
  getFileDiff,
  revertFile,
  dropCommit,
  squashCommits,
  getCommitMessage,
  writeFileContent,
}
export type { CommitInfo, BranchInfo, FileChange, FileDiff }
