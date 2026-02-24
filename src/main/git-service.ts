import simpleGit, { type SimpleGit } from 'simple-git'
import { getSettings } from './store'

let git: SimpleGit | null = null
let repoPath: string | null = null

const HASH_RE = /^[0-9a-f]{4,40}$/i
const MAX_DIFF_FILE_SIZE = 2 * 1024 * 1024 // 2 MB

function validateHash(hash: string): void {
  if (!HASH_RE.test(hash)) {
    throw new Error(`Invalid commit hash: ${hash}`)
  }
}

function validateBranchName(name: string): void {
  if (name.startsWith('-')) {
    throw new Error(`Invalid branch name: ${name}`)
  }
  if (name.includes('..')) {
    throw new Error(`Invalid branch name: ${name}`)
  }
}

function safeResolvePath(base: string, relative: string): string {
  const path = require('node:path') as typeof import('node:path')
  const resolved = path.resolve(base, relative)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`Path escapes repository: ${relative}`)
  }
  return resolved
}

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
  tooLarge?: boolean
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
  validateBranchName(branch)
  const g = ensureGit()
  await g.checkout(branch)
}

async function stashAndCheckout(branch: string): Promise<void> {
  validateBranchName(branch)
  const g = ensureGit()
  await g.stash(['push', '-m', `Auto-stash before switching to ${branch}`])
  try {
    await g.checkout(branch)
  } catch (err) {
    await g.stash(['pop'])
    throw err
  }
}

async function discardAndCheckout(branch: string): Promise<void> {
  validateBranchName(branch)
  const g = ensureGit()
  await g.stash(['push', '-m', `Safety stash before discard-and-checkout to ${branch}`])
  try {
    await g.checkout(branch)
  } catch (err) {
    await g.stash(['pop'])
    throw err
  }
  // Checkout succeeded — drop the safety stash
  await g.stash(['drop'])
}

async function getLog(
  branch: string,
  page: number,
  pageSize: number,
): Promise<{ commits: CommitInfo[]; total: number }> {
  validateBranchName(branch)
  const g = ensureGit()
  pageSize = Math.min(Math.max(pageSize, 1), 200)

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
  validateHash(hash)
  const g = ensureGit()

  // --root makes diff-tree work for root commits (no parent)
  const diffArgs = ['diff-tree', '--root', '--no-commit-id', '-r', '--numstat', '--diff-filter=AMDRT', hash]
  const result = await g.raw(diffArgs)

  const statusArgs = ['diff-tree', '--root', '--no-commit-id', '-r', '--name-status', hash]
  const statusResult = await g.raw(statusArgs)

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
  validateHash(hash)
  if (repoPath) safeResolvePath(repoPath, filePath)
  const g = ensureGit()

  // Get the file status to know how to handle it (--root handles root commits)
  const statusResult = await g.raw([
    'diff-tree',
    '--root',
    '--no-commit-id',
    '-r',
    '--name-status',
    hash,
    '--',
    filePath,
  ])
  const status = statusResult.trim().split('\t')[0] || 'M'

  // Check file sizes before loading content
  try {
    if (status !== 'A') {
      const oldSize = Number.parseInt((await g.raw(['cat-file', '-s', `${hash}^:${filePath}`])).trim(), 10)
      if (oldSize > MAX_DIFF_FILE_SIZE) {
        return { oldContent: '', newContent: '', filePath, status, tooLarge: true }
      }
    }
    if (status !== 'D') {
      const newSize = Number.parseInt((await g.raw(['cat-file', '-s', `${hash}:${filePath}`])).trim(), 10)
      if (newSize > MAX_DIFF_FILE_SIZE) {
        return { oldContent: '', newContent: '', filePath, status, tooLarge: true }
      }
    }
  } catch {
    // If cat-file fails, proceed without size check
  }

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
  validateHash(hash)
  if (!repoPath) throw new Error('No repository opened')
  const fullPath = safeResolvePath(repoPath, filePath)
  const g = ensureGit()

  const statusResult = await g.raw(['diff-tree', '--no-commit-id', '-r', '--name-status', hash, '--', filePath])
  const status = statusResult.trim().split('\t')[0] || 'M'

  if (status === 'A') {
    // File was added in this commit — remove it
    const fs = await import('node:fs/promises')
    await g.raw(['rm', '--cached', filePath])
    try {
      await fs.unlink(fullPath)
    } catch (unlinkErr) {
      // Rollback: re-add the file to the index
      await g.raw(['add', filePath])
      throw unlinkErr
    }
  } else {
    // File was modified or deleted — restore parent version
    await g.raw(['checkout', `${hash}^`, '--', filePath])
    await g.raw(['reset', 'HEAD', '--', filePath])
  }
}

async function dropCommit(hash: string): Promise<void> {
  validateHash(hash)
  const g = ensureGit()
  const settings = getSettings()

  // Verify the commit has a parent (not a root commit)
  try {
    await g.raw(['rev-parse', '--verify', `${hash}^`])
  } catch {
    throw new Error('Cannot drop the root commit — it has no parent')
  }

  // Check if this is the HEAD commit
  const headHash = (await g.raw(['rev-parse', 'HEAD'])).trim()
  const isHead = headHash === hash

  if (settings.dropMode === 'soft') {
    if (isHead) {
      await g.raw(['reset', '--soft', 'HEAD~1'])
    } else {
      const parentHash = (await g.raw(['rev-parse', `${hash}^`])).trim()
      try {
        await g.raw(['rebase', '--onto', parentHash, hash])
      } catch {
        await g.raw(['rebase', '--abort'])
        throw new Error(
          `Rebase failed while dropping commit ${hash.slice(0, 7)} — operation aborted, repository restored`,
        )
      }
    }
  } else {
    // Hard drop: remove commit and its changes
    if (isHead) {
      await g.raw(['reset', '--hard', 'HEAD~1'])
    } else {
      const parentHash = (await g.raw(['rev-parse', `${hash}^`])).trim()
      try {
        await g.raw(['rebase', '--onto', parentHash, hash])
      } catch {
        await g.raw(['rebase', '--abort'])
        throw new Error(
          `Rebase failed while dropping commit ${hash.slice(0, 7)} — operation aborted, repository restored`,
        )
      }
    }
  }
}

async function squashCommits(hashes: string[], message: string): Promise<void> {
  const g = ensureGit()

  if (hashes.length < 2) {
    throw new Error('Need at least 2 commits to squash')
  }

  for (const hash of hashes) {
    validateHash(hash)
  }

  // Get the full commit log from HEAD to verify contiguity
  const hashSet = new Set(hashes)

  // Walk back from HEAD enough commits to cover all selected
  const logResult = await g.raw(['log', '--format=%H', `-n`, `${hashes.length + 10}`])
  const headLog = logResult.trim().split('\n').filter(Boolean)

  // Find the indices of selected commits in the log
  const indices: number[] = []
  for (const h of headLog) {
    if (hashSet.has(h)) {
      indices.push(headLog.indexOf(h))
    }
  }

  if (indices.length !== hashes.length) {
    throw new Error('Some selected commits are not in the recent history — cannot squash')
  }

  indices.sort((a, b) => a - b)

  // Must include HEAD (index 0)
  if (indices[0] !== 0) {
    throw new Error('Squash must include the most recent commit (HEAD)')
  }

  // Must be contiguous
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1) {
      throw new Error('Selected commits must be contiguous — there are gaps in the selection')
    }
  }

  // Oldest selected commit is at the largest index
  const oldestHash = headLog[indices[indices.length - 1]]

  // Verify oldest has a parent (not root)
  try {
    await g.raw(['rev-parse', '--verify', `${oldestHash}^`])
  } catch {
    throw new Error('Cannot squash — the oldest selected commit is the root commit (no parent)')
  }

  const parentHash = (await g.raw(['rev-parse', `${oldestHash}^`])).trim()

  // Soft reset to the parent of the oldest commit, then recommit
  await g.raw(['reset', '--soft', parentHash])
  await g.raw(['commit', '-m', message])
}

async function getCommitMessage(hash: string): Promise<string> {
  validateHash(hash)
  const g = ensureGit()
  return (await g.raw(['log', '-1', '--format=%B', hash])).trim()
}

async function getLocalChangesWithStats(): Promise<FileChange[]> {
  const g = ensureGit()
  const status = await g.status()

  const files: FileChange[] = []
  for (const f of status.files) {
    const fileStatus = f.working_dir === '?' ? 'A' : f.working_dir || f.index || 'M'
    let insertions = 0
    let deletions = 0

    // Try to get numstat for tracked files
    if (fileStatus !== 'A' && f.working_dir !== '?') {
      try {
        const numstat = await g.raw(['diff', '--numstat', '--', f.path])
        const parts = numstat.trim().split('\t')
        if (parts.length >= 2) {
          insertions = parts[0] === '-' ? 0 : Number.parseInt(parts[0], 10)
          deletions = parts[1] === '-' ? 0 : Number.parseInt(parts[1], 10)
        }
      } catch {
        // ignore
      }
    }

    files.push({ path: f.path, status: fileStatus, insertions, deletions })
  }

  return files
}

async function getLocalFileDiff(filePath: string): Promise<FileDiff> {
  if (!repoPath) throw new Error('No repository opened')
  safeResolvePath(repoPath, filePath)
  const g = ensureGit()
  const fs = await import('node:fs/promises')
  const pathMod = await import('node:path')

  const fullPath = pathMod.resolve(repoPath, filePath)

  // Determine file status
  const status = await g.status()
  const fileInfo = status.files.find((f) => f.path === filePath)
  if (!fileInfo) {
    throw new Error(`File not found in local changes: ${filePath}`)
  }

  const fileStatus = fileInfo.working_dir === '?' ? 'A' : fileInfo.working_dir || fileInfo.index || 'M'

  let oldContent = ''
  let newContent = ''

  // Check file size
  try {
    const stat = await fs.stat(fullPath)
    if (stat.size > MAX_DIFF_FILE_SIZE) {
      return { oldContent: '', newContent: '', filePath, status: fileStatus, tooLarge: true }
    }
  } catch {
    // File might be deleted
  }

  if (fileStatus !== 'A' && fileInfo.working_dir !== '?') {
    // Get HEAD version
    try {
      const headSize = Number.parseInt((await g.raw(['cat-file', '-s', `HEAD:${filePath}`])).trim(), 10)
      if (headSize > MAX_DIFF_FILE_SIZE) {
        return { oldContent: '', newContent: '', filePath, status: fileStatus, tooLarge: true }
      }
      oldContent = await g.raw(['show', `HEAD:${filePath}`])
    } catch {
      oldContent = ''
    }
  }

  if (fileStatus !== 'D') {
    try {
      newContent = await fs.readFile(fullPath, 'utf-8')
    } catch {
      newContent = ''
    }
  }

  return { oldContent, newContent, filePath, status: fileStatus }
}

async function writeFileContent(filePath: string, content: string): Promise<void> {
  if (!repoPath) throw new Error('No repository opened')
  const fullPath = safeResolvePath(repoPath, filePath)
  const fs = await import('node:fs/promises')
  await fs.writeFile(fullPath, content, 'utf-8')
}

async function commitAll(message: string): Promise<void> {
  const g = ensureGit()
  if (!message.trim()) throw new Error('Commit message cannot be empty')
  await g.raw(['add', '-A'])
  await g.raw(['commit', '-m', message])
}

async function commitFiles(filePaths: string[], message: string): Promise<void> {
  if (!repoPath) throw new Error('No repository opened')
  const g = ensureGit()
  if (!message.trim()) throw new Error('Commit message cannot be empty')
  if (filePaths.length === 0) throw new Error('No files specified')
  for (const fp of filePaths) {
    safeResolvePath(repoPath, fp)
  }
  await g.raw(['add', '--', ...filePaths])
  await g.raw(['commit', '-m', message, '--', ...filePaths])
}

export {
  openRepo,
  getBranches,
  getLocalChanges,
  getLocalChangesWithStats,
  getLocalFileDiff,
  discardLocalChanges,
  checkoutBranch,
  stashAndCheckout,
  discardAndCheckout,
  getLog,
  getCommitFiles,
  getFileDiff,
  revertFile,
  dropCommit,
  squashCommits,
  getCommitMessage,
  writeFileContent,
  commitAll,
  commitFiles,
}
export type { CommitInfo, BranchInfo, FileChange, FileDiff }
