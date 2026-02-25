import { execFileSync } from 'node:child_process'

const EXTRA_PATHS = ['/usr/local/bin', '/opt/homebrew/bin']

export function fixPath(): void {
  if (process.platform !== 'darwin') return

  const current = process.env.PATH ?? ''
  const segments = current.split(':')

  // Try to get the user's full shell PATH
  try {
    const shell = process.env.SHELL || '/bin/zsh'
    const shellPath = execFileSync(shell, ['-ilc', 'echo $PATH'], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim()
    if (shellPath) {
      process.env.PATH = shellPath
      return
    }
  } catch {
    // Fall through to manual fix
  }

  // Fallback: append common Homebrew paths
  const missing = EXTRA_PATHS.filter((p) => !segments.includes(p))
  if (missing.length > 0) {
    process.env.PATH = `${current}:${missing.join(':')}`
  }
}
