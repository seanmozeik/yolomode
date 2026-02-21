# PRD: `yolomode watch` — Epic 4: Diff Panel (Right Panel)

## Introduction

The right panel shows two stacked sections: a file list of everything the agent has changed (vs `yolomode-base`), and below it a syntax-highlighted diff of the selected file. The panel is toggleable with `]`, and a background poller updates a "new changes" indicator every 3 seconds. This epic **copies** `remorses/critique`'s components as directly as possible — the diff renderer, file tree, balance-delimiters preprocessing, and filetype detection — porting them from React to Solid (swap hooks only; all logic and the `<diff>` core element are identical).

**Framework clarity:** `<diff>` lives in `@opentui/core` and works with both `@opentui/react` and `@opentui/solid`. critique uses the React binding; we use the Solid binding. The port is mechanical: `useState` → `createSignal`, `useEffect` → `createEffect`, `useMemo` → `createMemo`. All business logic, the `<diff>` element usage, and Tree-sitter integration are copied verbatim.

**Depends on:** Epic 1 (foundation) and Epic 2 (session picker/context) must be complete. Reads `app.activeSession` to know which container to query.

**Primary reference:** `remorses/critique` — copy these files directly, port React → Solid hooks only:
- File tree: `src/components/directory-tree-view.tsx`
- Directory tree builder: `src/directory-tree.ts` (pure TS, no React — copy verbatim)
- Diff renderer: `src/components/diff-view.tsx`
- Delimiter balancing: `src/balance-delimiters.ts` (pure TS — copy verbatim)
- Watch/polling: `src/review/yaml-watcher.ts` (adapt polling strategy for Docker)
- Filetype detection: `src/diff-utils.ts` → `detectFiletype()` (pure TS — copy verbatim)
- Syntax highlighting: `src/monochrome.ts` (pure TS — copy verbatim)

---

## Goals

- File list shows all files changed vs `yolomode-base` inside the active container
- Noisy files (lockfiles, build artifacts) excluded by default; `--all` flag shows them dimmed
- Files sorted by mtime (most recently changed first)
- Selecting a file renders its diff with syntax highlighting
- Background poll every 3s shows "● new changes" in header without auto-refreshing
- `r` manually refreshes the file list, preserving selection if file still present
- `]` toggles the right panel open/closed

---

## User Stories

### US-001: Fetch changed-file list from container
**Description:** As a developer, I want a function that retrieves `git diff --name-status yolomode-base` from inside the active Docker container so the file list has data.

**Git command (run via `docker exec`):**
```bash
docker exec <container-id> git -C /workspace diff --name-status yolomode-base
```

Output format:
```
M       src/cmd-watch.ts
A       src/watch/context/app.tsx
D       src/old-file.ts
R100    src/old-name.ts    src/new-name.ts
```

Parse into:
```typescript
type DiffFile = {
  status: 'M' | 'A' | 'D' | 'R'
  path: string          // For renames: use the new path
  oldPath?: string      // For renames: original path
}
```

**mtime sort:** After getting the file list, fetch mtime for each file:
```bash
docker exec <container-id> stat -c %Y /workspace/src/cmd-watch.ts
```
Run all `stat` calls in parallel with `Promise.all`. Sort descending by mtime; alphabetical as tiebreaker.

**Noisy-file blocklist** (from PRD FR-5):
```
bun.lock, package-lock.json, yarn.lock, pnpm-lock.yaml,
Cargo.lock, go.sum, poetry.lock, Pipfile.lock, composer.lock,
*.min.js, *.min.css, *.map,
dist/**, build/**, __pycache__/**, .next/**,
*.pyc, .DS_Store, *.snap
```

Use `minimatch` or a simple custom glob matcher for pattern matching.

**Acceptance Criteria:**
- [ ] `src/watch/docker.ts` extended with `listChangedFiles(sessionId: string, showAll: boolean): Promise<DiffFile[]>`
- [ ] Runs `git diff --name-status yolomode-base` via `docker exec` (non-interactive, piped I/O)
- [ ] Parses M/A/D/R status from git output
- [ ] Fetches mtime for each file in parallel
- [ ] Sorts results by mtime descending (newest first), alphabetical tiebreaker
- [ ] Filters out noisy files when `showAll === false`; includes them (dimmed in UI) when `showAll === true`
- [ ] Returns empty array (not an error) if `yolomode-base` branch doesn't exist in container
- [ ] Typecheck passes

### US-002: Build file list component
**Description:** As a user, I want to see a tree-structured list of changed files with color-coded status badges so I know what the agent has touched.

**Reference:** critique's `src/components/directory-tree-view.tsx` renders the file tree. It uses three helper functions from `src/directory-tree.ts`:
1. `buildInternalTree()` — splits paths on `/`, builds hierarchical map
2. `collapseNode()` — merges single-child directory chains (e.g. `src/watch/` not split if only one child dir)
3. `flattenTree()` — converts to linear array with Unicode tree connectors (`├──`, `└──`)

Each rendered entry shows:
- Unicode connector (`├──` or `└──`)
- Nerd Font file-type icon (from extension map in `src/ui/icons.ts`)
- Status badge: `M` yellow, `A` green, `D` red, `R` cyan
- Filename

**Nerd Font icons:** Create `src/watch/ui/icons.ts` with a lookup table mapping file extensions to Nerd Font characters. Key entries:
```typescript
export const FILE_ICONS: Record<string, string> = {
  '.ts':   '',   // nf-seti-typescript
  '.tsx':  '',
  '.js':   '',   // nf-seti-javascript
  '.json': '',   // nf-seti-json
  '.md':   '',   // nf-seti-markdown
  '.sh':   '',   // nf-seti-shell
  '.toml': '',   // nf-seti-config
  '.yaml': '',
  '.yml':  '',
  default: '',   // nf-fa-file
}
```

**Acceptance Criteria:**
- [ ] `src/watch/components/FileList.tsx` created
- [ ] Renders files as a tree using critique's `buildInternalTree → collapseNode → flattenTree` pipeline (ported to Solid.js from React)
- [ ] Each file entry shows: connector, Nerd Font icon, status badge (`M`/`A`/`D`/`R`) with color, filename
- [ ] `j`/`k` navigate the list when right panel is focused (`app.activePane === 'diff'`)
- [ ] `Enter` on a file sets `selectedFile` signal to that file's path
- [ ] `Ctrl+P` opens a fuzzy finder overlay (simple: filter list by typed string, adapt critique's picker pattern)
- [ ] Noisy files shown dimmed at bottom when `showAll=true`, hidden when `showAll=false`
- [ ] Empty state: "No changes yet" when list is empty
- [ ] Typecheck passes

### US-003: Build diff viewer with syntax highlighting
**Description:** As a user, I want to see a syntax-highlighted diff of the selected file so I can review the agent's changes inline.

**Fetch diff command:**
```bash
docker exec <container-id> git -C /workspace diff yolomode-base -- src/cmd-watch.ts
```

This returns a unified diff. Feed it to critique's diff renderer.

**Reference:** critique's `src/components/diff-view.tsx` wraps opentui's `<diff>` element:
```typescript
<diff
  diff={balancedDiff}
  viewMode="unified"
  filetype={filetype}
  themeName={themeName}
  wrapMode="word"
/>
```

Before rendering, critique calls `balanceDelimiters()` from `src/balance-delimiters.ts` to fix tree-sitter parsing of partial hunks (e.g., a hunk starting inside a multi-line string). **Port this preprocessing step exactly** — it's critical for correct syntax highlighting.

**Filetype detection:** critique's `src/diff-utils.ts` exports `detectFiletype(filename)` which maps extensions to tree-sitter parser names. Port or import this function.

**Syntax highlighting:** critique uses TextMate scope selectors via `src/monochrome.ts`, not Tree-sitter directly. The `<diff>` element from `@opentui/core` handles the rendering; filetype determines which grammar to apply.

**Acceptance Criteria:**
- [ ] `src/watch/components/DiffView.tsx` created
- [ ] Fetches `git diff yolomode-base -- <file>` via `docker exec` when `selectedFile` changes
- [ ] Passes diff through `balanceDelimiters()` (ported from critique's `src/balance-delimiters.ts`)
- [ ] Renders using opentui's `<diff>` element with correct `filetype` and unified view mode
- [ ] `u`/`d` scroll the diff view (separate from terminal panel scrolling)
- [ ] `f` toggles full-panel diff (hides FileList, maximizes DiffView within right panel)
- [ ] Added files shown fully highlighted green; deleted files fully highlighted red
- [ ] Dirty indicator in panel header: `[● updated]` when new diff fetched after file change
- [ ] Loading state: spinner while fetching diff
- [ ] Typecheck passes

### US-004: Add background poller and dirty indicator
**Description:** As a user, I want to know when new files have been changed without the view jumping so I can review at my own pace.

**Reference:** critique's `src/review/yaml-watcher.ts` uses dual strategy:
```typescript
// Native watcher with 100ms debounce
const watcher = fs.watch(path, (eventType) => {
  if (eventType === "change") {
    clearTimeout(debounceTimeout)
    debounceTimeout = setTimeout(parseAndUpdate, 100)
  }
})
// 500ms polling fallback
const pollInterval = setInterval(parseAndUpdate, 500)
```

For yolomode, we can't watch files inside a Docker container via `fs.watch`. Use polling only — every 3 seconds run `git diff --name-only yolomode-base` inside the container and compare to the current file list. If different, show the dirty indicator.

**Dirty indicator:** displayed in the top-right of the panel header:
```
┌─ Changed Files ──────────── [● new changes — r] ─┐
```

**Acceptance Criteria:**
- [ ] `src/watch/hooks/useDirtyPoller.ts` created
- [ ] Polls every 3,000ms: runs `git diff --name-only yolomode-base` via `docker exec`
- [ ] Compares result to current `fileList` (by sorted path string)
- [ ] Returns `{ dirty: Accessor<boolean> }` — true if server-side list differs from displayed list
- [ ] `r` keypress in the right panel calls `refreshFileList()` and clears `dirty`
- [ ] After refresh, if previously selected file still in list, selection preserved; else first file selected
- [ ] Poller never triggers an automatic re-render of panels (indicator only)
- [ ] Poller pauses when right panel is closed (no wasted docker exec calls)
- [ ] `onCleanup` cancels the interval
- [ ] Typecheck passes

### US-005: Right panel layout with toggle
**Description:** As a user, I want the diff panel in a right column that I can hide to give more space to the terminal.

The right panel has two stacked sections:
- **Top half:** `<FileList />` (scrollable)
- **Bottom half:** `<DiffView />` (scrollable)

A horizontal divider separates them. `f` key (in US-003) collapses the file list to show only the diff.

**Acceptance Criteria:**
- [ ] `src/watch/components/DiffPanel.tsx` created, containing `<FileList />` above `<DiffView />`
- [ ] `]` keypress toggles `rightPanelOpen` in app context
- [ ] Right panel uses `<Show when={app.rightPanelOpen()}>`
- [ ] Panel width: fixed at `Math.floor(terminalWidth * 0.4)` columns (approximately 40% of total)
- [ ] Horizontal divider between FileList and DiffView sections
- [ ] Panel header shows: "Changed Files" on the left, dirty indicator on the right
- [ ] `f` collapses FileList row height to 0 and expands DiffView (toggle back with `f` again)
- [ ] Typecheck passes

---

## Functional Requirements

- **FR-1:** `listChangedFiles(sessionId, showAll)` — `git diff --name-status yolomode-base` via docker exec, mtime sorted
- **FR-2:** Noisy-file blocklist filtering with `minimatch` or equivalent
- **FR-3:** `FileList.tsx` — tree view with status badges, j/k nav, Enter to select, Ctrl+P fuzzy find
- **FR-4:** `DiffView.tsx` — opentui `<diff>` with `balanceDelimiters()` preprocessing, syntax highlighting
- **FR-5:** `useDirtyPoller.ts` — 3s poll, dirty signal, never auto-redraws panels
- **FR-6:** `DiffPanel.tsx` — stacked FileList + DiffView, `]` toggle, dirty indicator in header
- **FR-7:** `src/watch/ui/icons.ts` — Nerd Font icon lookup table by extension

---

## Non-Goals

- No write operations (no stage/commit/discard from TUI)
- No diff between arbitrary git refs (always vs `yolomode-base`)
- No multi-file diff simultaneously
- No `git blame` or line history

---

## Design Considerations

**Right panel layout:**
```
┌─ Changed Files ──────────── [● new changes — r] ─┐
│  src/                                              │
│  ├──  cmd-watch.ts  M                             │
│  ├──  cmd-run.ts    A                             │
│  ├──  cli.ts        M                             │
│  └──  utils.ts      M                             │
│  ─────────────────────────────────────────────    │
│  @@ -12,4 +12,4 @@                               │
│  - old line                                       │
│  + new line                                       │
└───────────────────────────────────────────────────┘
```

---

## Technical Considerations

**`docker exec` non-interactive I/O:** All `docker exec` calls must use `{ stdin: "pipe", stdout: "pipe", stderr: "pipe" }` — never inherit the raw terminal that the TUI owns.

**Porting critique's React components to Solid.js (mechanical, not creative):**
- `useState` → `createSignal`
- `useEffect` → `createEffect`
- `useMemo` → `createMemo`
- `useCallback` → inline function (Solid doesn't need memoized callbacks)
- Content factory functions for Solid JSX must be functions, not eagerly-evaluated values
- Everything else — all business logic, `<diff>` element usage, Tree-sitter calls — copied verbatim

**The `<diff>` element is in `@opentui/core`** and is framework-agnostic. critique's `diff-view.tsx` passes props to `<diff>`; we do the same through the Solid binding. No compatibility issue.

**`balanceDelimiters()` port:** The function in `src/balance-delimiters.ts` is pure TypeScript (no React dependencies). Copy it verbatim to `src/watch/utils/balanceDelimiters.ts`.

**`detectFiletype()` port:** From critique's `src/diff-utils.ts`. Also pure TypeScript. Copy to `src/watch/utils/detectFiletype.ts`.

**Fuzzy finder (Ctrl+P):** For v1, implement as a simple text filter: type characters, filter the file list in real time, Enter to select. No need for full fuzzy matching algorithm. Use `@opentui-ui/dialog` for the overlay.

**mtime parallel fetch:** `Promise.all(files.map(f => execInContainer(id, ["stat", "-c", "%Y", `/workspace/${f.path}`])))` — runs in parallel. Limit to 20 concurrent to avoid overwhelming Docker daemon (use `p-limit` or manual batching).

---

## Success Metrics

- File list loads within 500ms of panel open
- Switching files shows diff within 300ms
- Dirty indicator appears within 3s of a file change in the container
- `r` refresh preserves selection when file still present

---

## Open Questions

- ~~Does opentui's `<diff>` work with `@opentui/solid`?~~ **Resolved: yes. `<diff>` is in `@opentui/core`, framework-agnostic. Both bindings work.**
- Ctrl+P fuzzy finder: filenames or content grep? **Decision: filenames only for v1.**
- `minimatch` for noisy-file blocklist. **Decision: yes, use `minimatch`.**
