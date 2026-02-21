# PRD: `yolomode watch` — Epic 2: Session Picker (Left Panel)

## Introduction

The left panel shows all yolomode Docker containers (running and stopped) with status indicators. The user navigates with `j`/`k` or arrow keys and presses `Enter` to switch which session's output is shown in the center panel. The panel is 30 columns wide and toggleable with `[`. This epic adapts opendocker's container picker directly, changing only the Docker filter from all containers to `ancestor=yolomode`.

**Depends on:** Epic 1 (opentui foundation) must be complete.

**Primary reference:** `flat6solutions/opendocker`
- Container list: `packages/cli/src/components/panes/container/list.tsx` (5,990 bytes)
- Application state: `packages/cli/src/context/application.tsx` (3,553 bytes)
- Docker wrapper: `packages/cli/src/lib/docker.ts` (5,053 bytes)
- Context factory: `packages/cli/src/context/helper.tsx`

---

## Goals

- Left panel renders all yolomode sessions with name, status, and uptime
- `j`/`k` and arrow keys navigate the list
- `Enter` switches the active session (fires an event the center panel will react to)
- `[` toggles the panel open/closed
- Panel is 30 columns wide, fixed
- Adapts opendocker's code directly with minimal changes

---

## User Stories

### US-001: Create session state context
**Description:** As a developer, I want a Solid.js context that stores session list state so all panels can react to the active session.

**Reference:** opendocker's `packages/cli/src/context/application.tsx` defines a central store with `createSimpleContext` from `packages/cli/src/context/helper.tsx`. The helper is a factory:
```typescript
createSimpleContext<T, Props>({
  name: "ContextName",
  init: (props) => { /* createStore() here */ }
})
// Returns: { provider: Component, use: Hook }
```

The application store in opendocker tracks:
```typescript
{
  containers: Container[],
  activeContainer: string | null,
  activePane: 'containers' | 'images' | 'volumes',
  filtering: boolean,
  docker: Docker,
}
```

For yolomode, adapt to:
```typescript
{
  sessions: Session[],       // { id, name, status, uptime }
  activeSession: string | null,
  activePane: 'sessions' | 'terminal' | 'diff',
  leftPanelOpen: boolean,
  rightPanelOpen: boolean,
}
```

**Acceptance Criteria:**
- [ ] `src/watch/context/app.tsx` created with a Solid.js context using `createSimpleContext` pattern
- [ ] Context exports `AppProvider` component and `useApp()` hook
- [ ] Store shape: `{ sessions, activeSession, activePane, leftPanelOpen, rightPanelOpen }`
- [ ] `useApp()` accessible inside any child of `<AppProvider>`
- [ ] Typecheck passes

### US-002: Create Docker session fetcher
**Description:** As a developer, I want a function that lists yolomode Docker containers so the session picker has data to display.

**Reference:** opendocker's `packages/cli/src/lib/docker.ts` uses a Singleton pattern with HTTP calls to the Docker socket. For yolomode, we use simpler `Bun.spawn` calls instead (consistent with existing `utils.ts` patterns):

```typescript
// Existing pattern in src/utils.ts:
const result = await Bun.$`docker ps -a --filter ancestor=yolomode --format json`.text()
```

The session list result shape needed:
```typescript
type Session = {
  id: string       // Container ID (short)
  name: string     // Container name (without leading /)
  status: 'running' | 'stopped'
  uptime: string   // e.g. "2 hours ago"
}
```

**Acceptance Criteria:**
- [ ] `src/watch/docker.ts` created with `listSessions(): Promise<Session[]>` function
- [ ] Filters containers with `--filter ancestor=yolomode` (matches the image used in `constants.ts`)
- [ ] Returns sessions sorted: running first, then stopped; alphabetical within each group
- [ ] Each session has `id`, `name` (stripped of leading `/`), `status`, `uptime`
- [ ] Function is pure (no side effects, no singletons needed)
- [ ] Typecheck passes

### US-003: Build session picker list component
**Description:** As a user, I want to see all my yolomode sessions listed with status indicators so I can choose which one to monitor.

**Reference:** opendocker's `packages/cli/src/components/panes/container/list.tsx` is the direct template. Key patterns to adapt:

1. **Auto-refresh:** `setInterval(() => refresh(), 1000)` with `onCleanup` to clear it
2. **Navigation:** keydown handler checking `app.activePane === 'sessions'`; Up/Down arrows move selection with wrap-around
3. **Rendering:**
```typescript
<For each={sessions()}>
  {(session) => (
    <text color={isActive(session.id) ? "green" : "white"} bold={isActive(session.id)}>
      {`  ${session.status === 'running' ? '●' : '○'}  ${session.name}`}
    </text>
  )}
</For>
```
4. **Status icons:** `●` green for running, `○` dim for stopped (Nerd Font container icon `` as prefix is optional for this story, nice-to-have)

**Acceptance Criteria:**
- [ ] `src/watch/components/SessionList.tsx` created
- [ ] Displays all sessions returned by `listSessions()` with a spinner during initial load
- [ ] Each entry shows: status indicator (`●` green / `○` dim), session name, uptime string
- [ ] Auto-refreshes session list every 1000ms
- [ ] `j`/`k` and Up/Down arrow keys navigate when left panel is focused
- [ ] `Enter` calls `app.setActiveSession(session.id)` on the selected entry
- [ ] Active selection shown in green + bold
- [ ] Empty state: shows "No sessions found" when list is empty after loading
- [ ] `onCleanup` cancels the refresh interval
- [ ] Typecheck passes

### US-004: Left panel layout with toggle
**Description:** As a user, I want the session picker in a left panel that I can hide to give more space to the terminal.

**Reference:** opendocker's `packages/cli/src/components/left-sidebar.tsx` wraps content in a flex column. opendocker's pane wrapper (`packages/cli/src/ui/pane.tsx`) provides a bordered container with a header:
```typescript
<box borderStyle="round" width={30} height="100%">
  <text> Sessions </text>
  <SessionList />
</box>
```

The `[` keybind toggles `leftPanelOpen` in the app context. When closed, the box renders with `width={0}` and `overflow="hidden"` (or simply not rendered with `<Show>`).

**Acceptance Criteria:**
- [ ] Left panel renders `<SessionList />` inside a 30-column bordered box with header "Sessions"
- [ ] `[` keypress toggles `leftPanelOpen` in app context
- [ ] When `leftPanelOpen` is false, panel is not rendered (uses `<Show>`)
- [ ] Panel header shows "Sessions" label
- [ ] `Tab` key cycles focus: `sessions → terminal → diff → sessions` (sets `app.activePane`)
- [ ] Layout is a horizontal flex row: `[left panel] [center panel] [right panel]`
- [ ] Typecheck passes

---

## Functional Requirements

- **FR-1:** `src/watch/context/app.tsx` — Solid.js context with `AppProvider` and `useApp()`
- **FR-2:** `src/watch/docker.ts` — `listSessions()` filters `ancestor=yolomode`, returns `Session[]`
- **FR-3:** `src/watch/components/SessionList.tsx` — list with j/k nav, Enter to switch, 1s refresh
- **FR-4:** Left panel is 30 columns wide, bordered, toggleable with `[`
- **FR-5:** `Tab` cycles focus between panels via `app.activePane`
- **FR-6:** Panel only responds to j/k/Enter when `app.activePane === 'sessions'`
- **FR-7:** Status: `●` green (running), `○` dim (stopped), with session name and uptime

---

## Non-Goals

- No container filtering/search within the picker (that's opendocker's `filter.tsx` — not needed for v1)
- No keyboard shortcut to create/destroy sessions from the TUI
- No mouse support

---

## Design Considerations

**Layout mockup:**
```
┌─ Sessions ──────────┐
│  ● bold-fox    2h   │
│  ● quiet-owl   5m   │
│  ○ lazy-bear   1d   │
└─────────────────────┘
```

Width: 30 columns. Status col: 2 chars. Name: up to 18 chars (truncate with `…`). Uptime: right-aligned.

---

## Technical Considerations

**Bun.spawn for Docker queries:** `listSessions()` must use non-interactive I/O — `Bun.spawn` or `Bun.$` template. Never inherit the raw TTY (the TUI owns it). Use `{ stdout: "pipe", stderr: "pipe" }`.

**opendocker filter change:** The only change needed to opendocker's list logic is the Docker filter. opendocker fetches all containers; yolomode filters with `--filter ancestor=yolomode`. The container name format in yolomode is `adjective-animal` (from `constants.ts`).

**Context structure:** Following opendocker's pattern, keep one top-level `AppProvider` in `cmd-watch.tsx` that wraps all panels. Each panel reads from `useApp()`.

**Focus management:** `app.activePane` is a string signal. Each component's keydown handler checks `app.activePane === 'sessions'` before responding. Tab increments through the pane cycle.

**Solid.js `createEffect` for selection validation:** When `sessions()` changes, validate that `app.activeSession` still exists in the new list. If not, select the first session. This mirrors opendocker's `validateActiveContainer()` pattern.

---

## Success Metrics

- Session list loads and renders within 200ms of TUI launch
- Switching sessions with Enter fires the `activeSession` signal change
- `[` toggle shows/hides panel without flickering
- Auto-refresh doesn't cause visible flicker

---

## Open Questions

- Should the session picker show the session's running command or just the name/status?
- Should uptime be relative ("2h ago") or absolute start time? Relative matches opendocker's display.
- If no sessions exist, should the TUI show a "run `yolomode run` to create a session" message?
