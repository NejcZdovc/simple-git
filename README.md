# Simple Git

A lightweight macOS desktop app for browsing Git history, viewing diffs with syntax highlighting, and performing commit operations like drop, squash, and per-hunk revert.

Built because existing Git GUIs are either too bloated or too limited. Simple Git focuses on the essentials: fast history browsing, readable diffs, and quick commit manipulation.

![macOS](https://img.shields.io/badge/platform-macOS-000000?logo=apple&logoColor=white)
![Electron](https://img.shields.io/badge/electron-40-47848F?logo=electron&logoColor=white)

## Why

Most Git GUIs try to do everything — staging wizards, merge conflict editors, remote management, stash UIs — and end up slow and complex. The terminal is powerful but makes reviewing diffs and history browsing tedious.

Simple Git takes a different approach:

- **Focused** — commit history, diffs, and manipulation. Nothing else.
- **Fast** — Vite-powered renderer, optimized LCS diff algorithm, paginated history
- **Readable diffs** — side-by-side view with syntax highlighting for 20+ languages
- **Destructive with intent** — drop, squash, and revert operations front and center, not buried in menus

Whether you want to clean up a branch before merging, quickly browse what changed in a commit, or revert a single hunk without touching the rest of the file — Simple Git gets it done in fewer clicks.

## Features

### Commit History

- Paginated commit log with author, date, and message
- Multi-select with click, Shift+range, and Cmd+toggle
- Context menu with copy commit ID, drop, and squash operations
- Branch switching via searchable dropdown with keyboard navigation

### Side-by-Side Diffs

- Syntax highlighting for 20+ languages (TypeScript, Python, Go, Rust, and more)
- Synchronized scrolling between left and right panels
- Auto-scrolls to the first change when opening a file
- Large file warning for files over 2,000 lines

### Diff View Modes

- **Full** — shows the entire file with changes highlighted
- **Minimal** — shows only changes with 10 lines of surrounding context, collapsing unchanged sections into expandable separators that can be clicked to reveal hidden lines

### Commit Manipulation

- **Drop commits** — remove commits with hard mode (discard changes) or soft mode (keep changes as unstaged)
- **Squash commits** — select multiple commits and combine them with a custom message (pre-populated with original messages)
- **Per-hunk revert** — click the revert button on any change in the diff gutter to undo just that hunk
- **File revert** — right-click any changed file to restore it to the pre-commit state

### Working Copy

- View and commit uncommitted changes
- Commit all or commit selected files
- Amend mode for modifying the last commit
- Auto-focuses working copy when switching to a project with local changes
- Multi-select files with Cmd+click, Shift+range, or Space key

### File Browser

- **Tree view** — hierarchical folder structure with collapse/expand
- **List view** — flat file list with path breadcrumbs
- File type badges (TS, JS, CSS, PY, etc.) with color coding
- Status indicators: Added (green), Modified (yellow), Deleted (red), Renamed (orange)
- Insertion/deletion counts per file
- Resizable panel with persistent width

### Command Palette (Cmd+P)

- Unified fuzzy search across projects, branches, commits, and files
- Results grouped by category with section headers and colored badges
- Arrow key navigation and Enter to select
- Selecting a project switches to it, a branch triggers checkout (with stash dialog if dirty), a commit highlights it and loads its files, a file jumps to its diff

### File Search (Cmd+F)

- Fuzzy file search within the current commit's changed files
- Keyboard navigation with Arrow keys, Enter to select, Escape to close

### Branch Switching

- Searchable branch dropdown with keyboard navigation
- Uncommitted changes detection when switching branches
- Three options: cancel, discard changes, or stash and switch

### Multi-Project Support

- Switch between repositories from the header dropdown
- Add and remove projects with custom names
- Remembers the last opened project across sessions

### Keyboard Navigation

| Shortcut            | Action                                       |
| ------------------- | -------------------------------------------- |
| `Cmd+P`             | Open command palette                         |
| `Cmd+F`             | Search files in current commit               |
| `Cmd+C`             | Copy selected text from diff view            |
| `Tab` / `Shift+Tab` | Switch between commits, files, and diff panels |
| `Arrow Up/Down`     | Navigate within the active panel             |
| `Space`             | Toggle file selection (working copy mode)    |
| `Enter`             | Select highlighted item                      |
| `Escape`            | Close palette / search                       |

### Auto Updates

- Checks for updates on launch and once daily
- Retries failed checks automatically (up to 3 attempts)
- Menu item to check manually or upgrade when an update is ready
- Silent update check when opening the About panel

### Push and Pull

- Push to origin from the command palette
- Pull with rebase when push is rejected (with automatic rebase abort on conflicts)
- Force push with confirmation

### Settings

- **Drop mode** — hard (discard changes) or soft (keep as unstaged)
- **Diff view mode** — full file or minimal (changes only)
- **Commit mode** — normal or amend

## Download

1. Go to the [Releases](https://github.com/NejcZdovc/simple-git/releases/latest) page
2. Download **Simple Git.dmg** (or the ZIP)
3. Open the DMG and drag **Simple Git** to your Applications folder
4. Launch Simple Git from Applications

## Development

### Prerequisites

- **macOS** (Apple Silicon or Intel)
- **Node.js** 18+ and npm

### Setup

```bash
# Clone the repository
git clone https://github.com/NejcZdovc/simple-git.git
cd simple-git

# Install dependencies
npm install

# Run the app
npm start
```

### Code Quality

```bash
# Lint with Biome
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Format code
npm run format

# Type check
npm run typecheck

# Full check (lint + typecheck)
npm run full-check
```

### Building for Distribution

```bash
# Package the app
npm run package

# Create DMG + ZIP installers
npm run make
```

The packaged app will appear in the `out/` directory.

## Architecture

```
src/
├── main/                          # Electron main process
│   ├── main.ts                    # App entry, menu, IPC registration
│   ├── window-manager.ts          # Window creation and lifecycle
│   ├── git-service.ts             # Git operations (log, diff, drop, squash, revert)
│   ├── auto-updater.ts            # Auto-update with retry and periodic checks
│   ├── ipc-handlers.ts            # IPC bridge between main and renderer
│   └── store.ts                   # Persistent settings and project storage
├── renderer/
│   ├── main_window/
│   │   └── index.html             # Main window layout and dialogs
│   ├── js/
│   │   ├── app.ts                 # App controller and orchestration
│   │   ├── types.ts               # Shared TypeScript interfaces
│   │   └── components/
│   │       ├── commit-list.ts     # Paginated commit list with multi-select
│   │       ├── file-tree.ts       # Tree/list view with status badges
│   │       ├── diff-viewer.ts     # Side-by-side diff with syntax highlighting
│   │       ├── branch-selector.ts # Searchable branch dropdown
│   │       ├── project-selector.ts # Project switching
│   │       ├── command-palette.ts # Cmd+P command palette with fuzzy search
│   │       ├── checkout-dialog.ts # Uncommitted changes dialog
│   │       ├── squash-dialog.ts   # Squash commit message dialog
│   │       ├── settings-dialog.ts # App settings
│   │       ├── file-search.ts     # Fuzzy file search overlay
│   │       ├── context-menu.ts    # Right-click context menu
│   │       └── add-project-dialog.ts
│   ├── styles/
│   │   └── main.css               # Tailwind CSS theme and base styles
│   ├── preload.ts                 # Context bridge API
│   └── window.d.ts                # Window type declarations
└── assets/                        # App icons
```

### Key Design Decisions

- **LCS diff with Int32Array** — memory-efficient longest common subsequence algorithm with automatic fallback to full replacement for very large files
- **No frameworks** — vanilla TypeScript frontend, keeping the dependency tree minimal
- **IPC separation** — all Git operations run in the main process; the renderer only sends requests through a typed bridge
- **JSON file storage** — settings and project list stored as simple JSON in the user data directory

## Tech Stack

- **[Electron](https://www.electronjs.org/)** — native desktop shell
- **[TypeScript](https://www.typescriptlang.org/)** — end-to-end type safety
- **[Vite](https://vite.dev/)** — fast bundling for main, preload, and renderer
- **[Tailwind CSS v4](https://tailwindcss.com/)** — utility-first styling
- **[simple-git](https://github.com/steveukx/git-js)** — Node.js Git wrapper
- **[highlight.js](https://highlightjs.org/)** — syntax highlighting in diffs
- **[Electron Forge](https://www.electronforge.io/)** — packaging and distribution
- **[Biome](https://biomejs.dev/)** — linting and formatting

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and ensure `npm run full-check` passes
4. Commit your changes
5. Push to the branch and open a Pull Request

## License

MIT
