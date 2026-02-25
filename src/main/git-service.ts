import type { FSWatcher } from 'node:fs'
import simpleGit, { type SimpleGit } from 'simple-git'
import { getSettings } from './store'

let git: SimpleGit | null = null
let repoPath: string | null = null
let gitWatchers: FSWatcher[] = []
let worktreeWatcher: FSWatcher | null = null
let onGitChange: (() => void) | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let suppressWatcher = false

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
  pushed: boolean
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

function stopWatching() {
  for (const w of gitWatchers) {
    w.close()
  }
  gitWatchers = []
  stopWorktreeWatcher()
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

function stopWorktreeWatcher() {
  if (worktreeWatcher) {
    worktreeWatcher.close()
    worktreeWatcher = null
  }
}

function emitChange() {
  if (suppressWatcher) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    onGitChange?.()
  }, 500)
}

async function withSuppressedWatcher<T>(fn: () => Promise<T>): Promise<T> {
  suppressWatcher = true
  try {
    return await fn()
  } finally {
    // Keep suppressed briefly so the fs events from our own operation are ignored
    setTimeout(() => {
      suppressWatcher = false
    }, 600)
  }
}

async function startWatching(repoDir: string) {
  stopWatching()
  const fs = await import('node:fs')
  const pathMod = await import('node:path')

  const gitDir = pathMod.join(repoDir, '.git')

  // Watch refs/heads for commit changes (new commits, branch updates)
  const refsDir = pathMod.join(gitDir, 'refs', 'heads')
  try {
    const w = fs.watch(refsDir, { recursive: true }, () => emitChange())
    gitWatchers.push(w)
  } catch {
    // Directory may not exist yet
  }

  // Watch HEAD for branch switches
  const headPath = pathMod.join(gitDir, 'HEAD')
  try {
    const w = fs.watch(headPath, () => emitChange())
    gitWatchers.push(w)
  } catch {
    // ignore
  }
}

async function startWorktreeWatcher(): Promise<void> {
  stopWorktreeWatcher()
  if (!repoPath) return
  const fs = await import('node:fs')
  try {
    worktreeWatcher = fs.watch(repoPath, { recursive: true }, (_event, filename) => {
      if (filename?.startsWith('.git')) return
      emitChange()
    })
  } catch {
    // ignore
  }
}

function setOnGitChange(cb: () => void) {
  onGitChange = cb
}

async function openRepo(path: string): Promise<boolean> {
  const instance = simpleGit(path)
  const isRepo = await instance.checkIsRepo()
  if (!isRepo) {
    throw new Error('Not a git repository')
  }
  git = instance
  repoPath = path
  await startWatching(path)
  return true
}

function ensureGit(): SimpleGit {
  if (!git) throw new Error('No repository opened')
  return git
}

async function getBranches(): Promise<{ branches: BranchInfo[]; current: string }> {
  const g = ensureGit()
  const summary = await g.branchLocal()

  // Detached HEAD (e.g., mid-rebase) returns names like "(no" — resolve to actual branch
  let current = summary.current
  if (summary.detached || !summary.all.includes(current)) {
    const head = (await g.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
    current = head === 'HEAD' ? summary.all[0] || 'main' : head
  }

  const branches: BranchInfo[] = summary.all.map((name) => ({
    name,
    current: name === current,
  }))
  return { branches, current }
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

  // Find unpushed commits by checking what's ahead of origin/<branch>
  const unpushedHashes = new Set<string>()
  try {
    const unpushedResult = await g.raw(['rev-list', `origin/${branch}..${branch}`])
    for (const line of unpushedResult.trim().split('\n')) {
      if (line) unpushedHashes.add(line)
    }
  } catch {
    // No remote tracking branch — all commits are local-only
  }

  const commits: CommitInfo[] = []
  const lines = logResult.trim().split('\n')
  for (let i = 0; i < lines.length; i += 6) {
    if (!lines[i]) break
    const hash = lines[i]
    commits.push({
      hash,
      message: lines[i + 1],
      authorName: lines[i + 2],
      authorEmail: lines[i + 3],
      date: lines[i + 4],
      refs: lines[i + 5] || '',
      pushed: unpushedHashes.size > 0 ? !unpushedHashes.has(hash) : true,
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

async function getCommitMessage(ref: string): Promise<string> {
  if (ref !== 'HEAD') validateHash(ref)
  const g = ensureGit()
  return (await g.raw(['log', '-1', '--format=%B', ref])).trim()
}

async function getLocalChangesWithStats(): Promise<FileChange[]> {
  const g = ensureGit()
  const status = await g.status()

  // Batch numstat: single git call for all tracked files
  const numstatMap = new Map<string, { insertions: number; deletions: number }>()
  try {
    const numstat = await g.raw(['diff', '--numstat'])
    for (const line of numstat.trim().split('\n')) {
      if (!line) continue
      const parts = line.split('\t')
      if (parts.length >= 3) {
        numstatMap.set(parts[2], {
          insertions: parts[0] === '-' ? 0 : Number.parseInt(parts[0], 10),
          deletions: parts[1] === '-' ? 0 : Number.parseInt(parts[1], 10),
        })
      }
    }
  } catch {
    // ignore
  }

  const files: FileChange[] = []
  for (const f of status.files) {
    const fileStatus = f.working_dir === '?' ? 'A' : f.working_dir || f.index || 'M'
    const stats = numstatMap.get(f.path)
    files.push({
      path: f.path,
      status: fileStatus,
      insertions: stats?.insertions ?? 0,
      deletions: stats?.deletions ?? 0,
    })
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

async function commitAll(message: string, amend?: boolean): Promise<void> {
  const g = ensureGit()
  if (!message.trim()) throw new Error('Commit message cannot be empty')
  await g.raw(['add', '-A'])
  const commitArgs = ['commit', '-m', message]
  if (amend) commitArgs.push('--amend')
  await g.raw(commitArgs)
}

async function commitFiles(filePaths: string[], message: string, amend?: boolean): Promise<void> {
  if (!repoPath) throw new Error('No repository opened')
  const g = ensureGit()
  if (!message.trim()) throw new Error('Commit message cannot be empty')
  if (filePaths.length === 0) throw new Error('No files specified')
  for (const fp of filePaths) {
    safeResolvePath(repoPath, fp)
  }
  await g.raw(['add', '--', ...filePaths])
  const commitArgs = ['commit', '-m', message]
  if (amend) commitArgs.push('--amend')
  commitArgs.push('--', ...filePaths)
  await g.raw(commitArgs)
}

async function pushToOrigin(): Promise<void> {
  const g = ensureGit()
  const branch = (await g.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  await g.raw(['push', 'origin', branch])
}

async function forcePushToOrigin(): Promise<void> {
  const g = ensureGit()
  const branch = (await g.raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  await g.raw(['push', 'origin', branch, '--force-with-lease'])
}

async function pullRebase(): Promise<void> {
  const g = ensureGit()
  try {
    await g.raw(['pull', '--rebase'])
  } catch (err) {
    // Abort the rebase so the repo doesn't get stuck in a broken state
    try {
      await g.raw(['rebase', '--abort'])
    } catch {
      // Already aborted or not in rebase state
    }
    throw err
  }
}

export {
  openRepo,
  setOnGitChange,
  startWorktreeWatcher,
  stopWorktreeWatcher,
  withSuppressedWatcher,
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
  pushToOrigin,
  forcePushToOrigin,
  pullRebase,
}
export type { CommitInfo, BranchInfo, FileChange, FileDiff }
