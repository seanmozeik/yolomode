# PRD: `yolomode watch` — Full TUI Session Monitor

## Introduction

`yolomode watch` is a full-screen TUI that unifies everything you need to supervise an agent session: a container/session picker on the left, the agent's live shell output in the center, and a syntax-highlighted diff viewer on the right. Side panels are independently hideable. The agent panel is always present and is the primary focus.

Rather than building from scratch, this project assembles and adapts three existing open-source opentui apps:

| Reference | What we borrow |
|---|---|
| [`msmps/opentui-ui`](https://github.com/msmps/opentui-ui) | Reusable UI component library (boxes, lists, inputs) |
| [`flat6solutions/opendocker`](https://github.com/flat6solutions/opendocker) | Container picker (left panel) + Docker socket terminal streaming (center panel) — Solid.js + opentui |
| [`remorses/critique`](https://github.com/remorses/critique) | Diff viewer with watch mode, Tree-sitter syntax highlighting, file picker (right panel) |

Additionally, the [`msmps/opentui-skill`](https://github.com/msmps/opentui-skill) is installed as an AI coding assistant skill to guide all opentui development in this project.

The vision extends beyond `watch`: over time `yolomode` becomes primarily a TUI for managing sessions, interacting with agent shells, reviewing diffs, and forwarding dev server ports — with the CLI commands as secondary entry points.

Build order: opentui setup → container picker → agent terminal → diff viewer → port forwarding.

---

## Goals

- Agent shell output is always visible and is the primary focus
- Container/session picker and diff panels are available on demand, not in the way by default
- Noisy files (lockfiles, generated output) never pollute the diff file list
- Nerd Font icons and colors throughout (yazi-style file browser aesthetics)
- Dev server ports detected inside the container and forwardable to the host in one keystroke
- Maximize reuse from opendocker, critique, and opentui-ui rather than reimplementing

---

## User Stories

### US-000: opentui project setup
**Description:** As a developer, I want the opentui foundation and skill installed before writing any TUI code, so all subsequent stories have a working framework and AI guidance.

**Acceptance Criteria:**
- [ ] `@opentui/core` (and `@opentui/solid` if opendocker's Solid.js approach is adopted) installed as dependencies
- [ ] `msmps/opentui-skill` installed via `npx skills add msmps/opentui-skill` and available in the project
- [ ] `opentui-ui` component library added as a dependency or vendored into `src/ui/`
- [ ] A minimal opentui app renders a bordered box and exits cleanly with `q` — proves the stack works with Bun
- [ ] `SIGWINCH` resize handled at framework level (verify opentui handles it natively)
- [ ] `src/cmd-watch.ts` scaffolded with `export async function cmdWatch(args: string[]): Promise<void>`
- [ ] `case 'watch':` wired in `cli.ts`, registered in help table
- [ ] Typecheck/lint passes

### US-001: Session/container picker (left panel, hideable)
**Description:** As a user, I want a left panel listing all yolomode sessions with their status, so I can switch between containers without leaving the TUI.

**Acceptance Criteria:**
- [ ] Left panel lists all containers with `ancestor=yolomode` filter (running and stopped)
- [ ] Each entry shows: session name, status indicator (● running green, ○ stopped dim), and uptime
- [ ] Nerd Font icon prefix per entry (e.g. `` for container)
- [ ] `j`/`k` or arrow keys navigate; `Enter` switches the center panel to that session's stream
- [ ] `[` toggles the left panel open/closed
- [ ] `Tab` cycles focus: left → center → right → left
- [ ] Adapts opendocker's container picker component directly; adjust filter to `ancestor=yolomode`
- [ ] Panel width: ~30 columns, fixed
- [ ] Typecheck/lint passes

### US-002: Agent terminal panel (center, always visible)
**Description:** As a user, I want to see the selected session's live shell output in the center, so I always know what the agent is doing.

**Acceptance Criteria:**
- [ ] Streams live output from the selected container via Docker socket or `docker logs -f` (adapt opendocker's streaming mechanism)
- [ ] Output is read-only — keystrokes not forwarded to container
- [ ] Autoscrolls to bottom as output arrives; `s` toggles autoscroll pause
- [ ] When paused, dim `[scroll paused — s to resume]` indicator shown
- [ ] `Home`/`End` jump to top/bottom; `u`/`d` scroll by half-page
- [ ] Output buffer capped at 5000 lines
- [ ] Panel fills full terminal width when both side panels are hidden
- [ ] Typecheck/lint passes

### US-003: Changed-file list in diff panel (right, hideable)
**Description:** As a user, I want a file list inside the right panel showing what the agent has changed, so I can navigate to a diff without leaving the TUI.

**Acceptance Criteria:**
- [ ] `]` toggles the right panel open/closed
- [ ] File list shows files changed vs `yolomode-base` (`git diff --name-status yolomode-base` inside container)
- [ ] Each entry shows: Nerd Font file-type icon, status badge (`M` yellow / `A` green / `D` red / `R` cyan), filename
- [ ] Files sorted by mtime inside the container, most recent first
- [ ] Noisy files excluded by default (FR-5 blocklist); `--all` flag shows them dimmed at bottom
- [ ] `j`/`k` navigates; `Enter` loads that file's diff below (or inline in the panel)
- [ ] `Ctrl+P` opens fuzzy file picker (adapt critique's picker)
- [ ] Adapt critique's file list component directly
- [ ] Typecheck/lint passes

### US-004: Diff view (right panel, below file list)
**Description:** As a user, I want to see a syntax-highlighted diff of the selected file, rendered beautifully.

**Acceptance Criteria:**
- [ ] Renders `git diff yolomode-base -- <file>` with Tree-sitter syntax highlighting (adapt critique's diff renderer)
- [ ] Watch mode: diff auto-refreshes when the file changes inside the container (adapt critique's watch mode using fs events or polling)
- [ ] Word-level change highlighting within modified lines
- [ ] `u`/`d` scroll the diff view; `f` toggles full-panel diff (hides file list, maximises diff)
- [ ] Added files shown fully highlighted green; deleted files fully highlighted red
- [ ] Dirty indicator in panel header when new changes detected: `[● updated — auto-refreshing]`
- [ ] Typecheck/lint passes

### US-005: Dirty indicator + manual refresh (file list)
**Description:** As a user, I want to know when new files have been changed without the view jumping.

**Acceptance Criteria:**
- [ ] Background poller every 3 seconds checks `git diff --name-only yolomode-base` inside container
- [ ] If file list changed, global header shows `[● new changes — r to refresh]`
- [ ] `r` refreshes file list; selection preserved if file still present, otherwise first file selected
- [ ] Poller never auto-redraws panels mid-read
- [ ] Typecheck/lint passes

### US-006: Port forwarding
**Description:** As a user, I want to forward a dev server port from the container to my host with one keystroke, so I can open it in a browser without manual setup.

**Acceptance Criteria:**
- [ ] `p` opens a port panel (overlay or bottom strip) showing ports currently listening inside the container (`docker exec <id> ss -tlnp`)
- [ ] Each port entry shows: port number, process name, and forwarding status (forwarded / not forwarded)
- [ ] `Enter` on a port starts forwarding: spawns `socat TCP-LISTEN:<host-port>,fork TCP:<container-ip>:<container-port>` on the host
- [ ] Host port defaults to same number as container port; if already in use, next available port is chosen
- [ ] Forwarded ports shown with `` icon and `localhost:<host-port>` label
- [ ] `x` on a forwarded port stops it (kills the socat process)
- [ ] All socat processes are killed cleanly on TUI exit
- [ ] `p` again closes the port panel
- [ ] Typecheck/lint passes

### US-007: Help bar
**Description:** As a user, I want visible keybindings at a glance.

**Acceptance Criteria:**
- [ ] Persistent status bar (1 line): `[ left  ] right  Tab focus  j/k nav  r refresh  s scroll  p ports  q quit`
- [ ] Dim/subtle styling, not distracting
- [ ] Typecheck/lint passes

---

## Functional Requirements

- **FR-1:** Command: `yolomode watch [name] [--all]`. Auto-resolves session if one running; `--all` disables noisy-file filter.
- **FR-2:** Layout: `[session picker ~30col] [agent terminal, fills remaining] [diff panel ~40% total width]`. Side panels independently hideable. Center never hidden.
- **FR-3:** Framework: `@opentui/core` + `@opentui/solid` (matching opendocker's stack). Component library: `msmps/opentui-ui`. Skill: `msmps/opentui-skill`.
- **FR-4:** Agent streaming: `Bun.spawn(["docker", "logs", "-f", id], { stdout: "pipe" })` with an async reader loop appending lines to the center panel buffer.
- **FR-5:** Noisy-file blocklist (excluded from diff file list by default):
  ```
  bun.lock, package-lock.json, yarn.lock, pnpm-lock.yaml,
  Cargo.lock, go.sum, poetry.lock, Pipfile.lock, composer.lock,
  *.min.js, *.min.css, *.map,
  dist/**, build/**, __pycache__/**, .next/**,
  *.pyc, .DS_Store, *.snap
  ```
- **FR-6:** File sort: mtime inside container (`docker exec <id> stat -c %Y <file>`), descending. Alphabetical as tiebreaker.
- **FR-7:** Dirty poll: 3-second interval, indicator only, no auto-redraw.
- **FR-8:** Keybindings: `[` left panel, `]` right panel, `Tab` cycle focus, `p` ports panel, `r` refresh, `s` scroll toggle, `q`/`Ctrl-C` exit.
- **FR-9:** Port forwarding via `socat` on host. Container IP from `docker inspect --format '{{.NetworkSettings.IPAddress}}'`. All socat PIDs tracked and killed on exit.
- **FR-10:** Nerd Font icons throughout: file-type icons in diff file list (adapt from yazi icon set), container icon in session picker, port icon in port panel.
- **FR-11:** `src/cmd-watch.ts` exports `cmdWatch(args: string[]): Promise<void>`.

---

## Non-Goals

- No input forwarding to the agent shell (read-only observation)
- No write operations from TUI (no stage/commit/discard)
- No mouse support (v1)
- No multi-file simultaneous diff
- No diff between arbitrary git refs — always vs `yolomode-base`
- No automatic port forwarding at session start — always user-initiated
- No TLS/tunnelling for port forwarding — local loopback only (security boundary: already local)

---

## Layout

```
┌─ yolomode watch: bold-fox ───────────────────────── [● new changes — r] ───────────────┐
│  bold-fox      ●  │ [agent output — autoscrolling]      │  src/                         │
│  quiet-owl     ○  │                                     │  ├──  cmd-watch.ts  M         │
│                   │  ✔ Extracted execShell()            │  ├──  cmd-run.ts    A         │
│                   │  ✔ Fixed resolveSession             │  ├──  cli.ts        M         │
│                   │  ◐ Running biome check...           │  └──  utils.ts      M         │
│                   │                                     │  ───────────────────────────  │
│                   │  [scroll paused — s to resume]      │  @@ -12,4 +12,4 @@            │
│                   │                                     │  - old line                   │
│                   │                                     │  + new line                   │
├───────────────────┴─────────────────────────────────────┴───────────────────────────── ┤
│  [ left  ] right  Tab focus  j/k nav  r refresh  s scroll  p ports  q quit             │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

Port panel overlay (press `p`):
```
│  Listening ports in bold-fox                                          │
│   3000  node (Next.js)     →  localhost:3000  [Enter to forward]     │
│   5432  postgres           →  not forwarded   [Enter to forward]     │
│   8080  python             ●  localhost:8080  [x to stop]            │
```

---

## Build Order

1. **US-000** — opentui setup: install deps, skill, verify Bun compatibility, scaffold `cmd-watch.ts`
2. **US-001** — Session picker: adapt opendocker's container list panel, filter to `ancestor=yolomode`
3. **US-002** — Agent terminal: stream `docker logs -f` via Bun.spawn into center panel
4. **US-003 + US-004** — Diff panel: adapt critique's file list + diff renderer + watch mode
5. **US-005** — Dirty indicator + manual refresh
6. **US-006** — Port forwarding overlay
7. **US-007** — Help bar (falls out naturally from layout work)

---

## Technical Considerations

- **Framework choice**: opendocker uses `@opentui/solid` (Solid.js reconciler). Critique uses `@opentui/react`. Adopt Solid.js to match opendocker since the container streaming is the hardest piece and we want to borrow its code as directly as possible.
- **opentui-skill**: install before writing any TUI code — it provides decision trees and component references that guide the implementation correctly from the start.
- **Agent streaming**: use `Bun.spawn(["docker", "logs", "-f", id], { stdout: "pipe" })` with an async reader loop — consistent with the existing Bun shell spawn pattern throughout the codebase. No Docker socket required.
- **critique diff renderer**: uses Tree-sitter for per-language syntax highlighting inside diffs. Richer than `git-delta` for the embedded panel use case since output is already ANSI-decorated text that opentui can render. `git-delta` may still be useful as a secondary renderer for the raw patch view.
- **Nerd Font icons**: source from the same icon mapping yazi uses (`nvim-web-devicons` icon set). Map file extensions → icons in a lookup table in `src/ui/icons.ts`.
- **Port forwarding security**: `socat` binds to `127.0.0.1` only (not `0.0.0.0`) by default. Explicitly pass `TCP4-LISTEN:<port>,bind=127.0.0.1,fork` to ensure ports are never exposed beyond localhost.
- **socat availability**: `socat` must be present on the host. Check at startup and warn if missing; suggest `brew install socat` / `apt install socat`.
- **TTY ownership**: TUI owns the host TTY in raw mode. All `docker exec` polling calls use piped I/O and never inherit the raw terminal.
- **SIGWINCH**: verify opentui/solid handles resize natively; if not, listen for `SIGWINCH` and call the framework's re-render trigger.

---

## Success Metrics

- Switch between sessions, read agent output, navigate to a changed file, and view its diff — all without leaving the TUI
- Noisy files never appear in diff file list unless `--all` is passed
- TUI exits with zero terminal corruption in all cases (normal quit, Ctrl-C, error)
- Port forwarding starts within 1 second of pressing Enter and is confirmed with a visible label
- Works with 0 changed files (empty state) and 200+ changed files

---

## Open Questions

- **Solid.js vs React**: opendocker uses Solid, critique uses React — adopting Solid is recommended to match opendocker, but confirm critique's diff renderer can be ported cleanly without the React reconciler.
- **Docker socket access on host**: confirm `/var/run/docker.sock` is accessible from the host process (it should be, since `docker` CLI works).
- **`socat` on host**: confirm availability or add to yolomode's install docs as a prerequisite.
- **Nerd Font detection**: should the TUI auto-detect Nerd Font support (check `TERM_PROGRAM`, font name) or always render icons and let the user configure off?
- **critique watch mode implementation**: inspect source to confirm it uses Bun's `fs.watch` or polling — matters for reliability inside a Docker container path.
