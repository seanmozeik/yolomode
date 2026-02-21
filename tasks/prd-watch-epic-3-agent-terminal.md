# PRD: `yolomode watch` — Epic 3: Agent Terminal (Center Panel, Log Viewer)

## Introduction

The center panel is a **read-only log viewer** for the selected session's Ralph agent output. It streams `docker logs -f` output via `Bun.spawn`, autoscrolls by default, and lets the user pause and navigate history. No input forwarding, no PTY complexity — Ralph runs autonomously in the container and this panel just observes it. The panel is intentionally smaller than the diff panel to give the diff view more room.

**Depends on:** Epic 1 (foundation) and Epic 2 (session picker/context). The `app.activeSession` signal drives which container to stream.

**Primary reference:** `flat6solutions/opendocker` — `packages/cli/src/components/panes/container/logs.tsx` (4,268 bytes). Adapt directly, the streaming mechanism is identical.

---

## Goals

- Live `docker logs -f` output streams into the center panel
- Switching sessions (via Epic 2) switches the stream instantly
- Read-only: no keystrokes forwarded to container
- Autoscrolls to bottom; `s` toggles pause with a visible indicator
- `u`/`d` scroll by half-page; `Home`/`End` jump to top/bottom
- Buffer capped at 5,000 lines
- Panel is narrower/shorter than diff panel — Ralph output is supplementary context

---

## User Stories

### US-001: Create Docker log streaming hook
**Description:** As a developer, I want a Solid.js hook that streams `docker logs -f` for the active session so the terminal panel has live data.

**Reference:** opendocker's `packages/cli/src/components/panes/container/logs.tsx`. Their streaming pattern (adapt directly):

```typescript
const proc = Bun.spawn(
  ["docker", "logs", "--follow", "--tail", "200", sessionId],
  { stdout: "pipe", stderr: "pipe" }
)

const reader = proc.stdout.getReader()
const decoder = new TextDecoder()

;(async () => {
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    appendLines(decoder.decode(value))
  }
})()

onCleanup(() => {
  reader.cancel()
  proc.kill()
})
```

Use `docker logs -f` (not `docker attach`) — this gives clean line-buffered text output without VT100 cursor-movement codes, which renders correctly in a `<scrollbox>`.

**Acceptance Criteria:**
- [ ] `src/watch/hooks/useLogStream.ts` created
- [ ] Accepts `sessionId: Accessor<string | null>` (reactive)
- [ ] Returns `{ lines: Accessor<string[]>, clearLines: () => void }`
- [ ] Uses `Bun.spawn(["docker", "logs", "--follow", "--tail", "200", id], { stdout: "pipe", stderr: "pipe" })`
- [ ] Reads stdout with Web Streams API + TextDecoder in an async loop
- [ ] Merges stderr into the same lines array
- [ ] Restarts stream when `sessionId()` changes (kills previous process, clears lines, spawns new)
- [ ] `onCleanup` cancels reader and kills process
- [ ] Buffer cap: when lines exceed 5,000, drop oldest (trim when crossing 5,500 to avoid per-line cost)
- [ ] Typecheck passes

### US-002: Build log viewer panel component
**Description:** As a user, I want to see live Ralph agent output in the center panel so I can monitor what the agent is doing.

**Reference:** opendocker's `logs.tsx` uses `<scrollbox>` with a `<code>` child for ANSI-colored output. Their pause/resume pattern uses a `tempLogs` buffer accumulated during pause, then merged on resume.

ANSI color codes from Ralph (picocolors, ora, boxen) must be preserved — do NOT strip them. opentui's `<scrollbox>/<code>` renders ANSI natively.

**Acceptance Criteria:**
- [ ] `src/watch/components/AgentTerminal.tsx` created
- [ ] Uses `useLogStream(app.activeSession)` from US-001
- [ ] Renders lines in a `<scrollbox>` with ANSI codes preserved
- [ ] Autoscrolls to bottom as new lines arrive (when autoscroll enabled)
- [ ] `s` key toggles autoscroll pause; when paused, shows dim `[scroll paused — s to resume]` text
- [ ] `u`/`d` scroll by half panel height (only when `app.activePane === 'terminal'`)
- [ ] `Home`/`End` jump to top/bottom
- [ ] Panel header shows active session name
- [ ] When no session selected, shows `"Select a session ↑↓ Enter"` placeholder
- [ ] Typecheck passes

### US-003: Wire terminal into three-panel layout
**Description:** As a developer, I want the terminal panel in the layout as a narrower column that leaves the majority of space for the diff panel.

The layout proportions (approximate, based on typical 220-col terminal):
- Left panel (session picker): 30 cols, fixed
- Center panel (log viewer): ~35% of remaining width
- Right panel (diff): ~65% of remaining width

**Acceptance Criteria:**
- [ ] `<AgentTerminal />` is the center column in the main flex layout in `cmd-watch.tsx`
- [ ] Center panel uses `flexGrow={1}` but right panel uses `flexGrow={2}` (2:1 ratio favoring diff)
- [ ] When right panel is hidden, terminal expands to fill remaining space
- [ ] All `Bun.spawn` processes tracked and killed on TUI exit via root component `onCleanup`
- [ ] Typecheck passes

---

## Functional Requirements

- **FR-1:** `src/watch/hooks/useLogStream.ts` — `docker logs --follow --tail 200`, reactive session switching, 5,000-line cap
- **FR-2:** Use `docker logs -f` (not `docker attach`) — clean text output, no VT100 cursor codes
- **FR-3:** `src/watch/components/AgentTerminal.tsx` — scrollbox, autoscroll, `s`/`u`/`d`/`Home`/`End` controls
- **FR-4:** Center panel narrower than diff panel (approx 35:65 ratio)
- **FR-5:** Keybinds only active when `app.activePane === 'terminal'`

---

## Non-Goals

- No input forwarding to the container
- No search/filter within log output
- No interactive shell — Ralph runs autonomously
- No mouse support

---

## Technical Considerations

**Why `docker logs` not `docker attach`:** `docker attach` streams the raw PTY output including cursor-positioning codes (`\x1b[H`, `\x1b[2J` etc) from Claude Code running inside the container. These look like garbage in a scrollbox. `docker logs -f` gives clean line-buffered text — exactly what we need for observing Ralph's output.

**`--tail 200` on attach:** Start with last 200 lines of existing output so the user sees recent context immediately. Don't use `--tail all` — large sessions could have thousands of lines to render at startup.

**Buffer trim strategy:** Only trim when `lines.length > 5500`, then slice to 5000. Avoids array mutation on every new line for busy log streams.

---

## Success Metrics

- Log lines appear within 100ms of being written in the container
- Switching sessions clears output and starts new stream within 200ms
- Autoscroll handles rapid log output without visible jitter

---

## Open Questions

- Should `--tail 200` be user-configurable? Probably not for v1.
