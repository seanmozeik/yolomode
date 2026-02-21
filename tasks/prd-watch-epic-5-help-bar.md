# PRD: `yolomode watch` — Epic 5: Help Bar

## Introduction

A persistent 1-line status bar at the bottom of the TUI shows all available keybindings at a glance. It is always visible, dim/subtle in styling, and automatically reflects which panels are currently open. This is the final polish epic — it falls out naturally from the layout work done in previous epics and requires no new data fetching or complex logic.

**Depends on:** All previous epics (1–4) should be complete for the help bar to show accurate keybindings, though it can be built in parallel with Epics 3–4 since it only reads `app` context state.

**Primary reference:** `flat6solutions/opendocker`
- Footer: `packages/cli/src/components/footer.tsx`
- Keybind display: `packages/cli/src/components/keybinds.tsx`

---

## Goals

- Persistent 1-line help bar at bottom of TUI showing all keybindings
- Dim/subtle styling that does not compete with main content
- Dynamically shows `[` vs `]` toggle states based on panel visibility
- Port forwarding hint shown (`p ports`) since `cmd-forward.ts` exists

---

## User Stories

### US-001: Build the persistent help bar component
**Description:** As a user, I want a dim status bar at the bottom of the TUI showing all keybindings so I can discover actions without leaving the TUI.

**Reference:** opendocker's `packages/cli/src/components/footer.tsx` renders a bottom bar using opentui's flex layout. Their pattern:
```typescript
<box
  height={1}
  width="100%"
  display="flex"
  flexDirection="row"
  paddingX={1}
>
  <text color={theme.muted}>
    {keybinds.map(kb => `${kb.key} ${kb.label}`).join("  ")}
  </text>
</box>
```

The yolomode help bar content (exactly 1 line, fixed):
```
[ left  ] right  Tab focus  j/k nav  r refresh  s scroll  p ports  q quit
```

**Styling:** Use `picocolors` dim or opentui's muted color. The bar should be visually recessed — less prominent than panel borders or content.

**Dynamic hints:** Adapt the `[` / `]` labels to reflect current state:
- When left panel is open: show `[ hide-left`; when closed: show `[ show-left`
- When right panel is open: show `] hide-right`; when closed: `] show-right`
- Or simpler: always show `[ left  ] right` (toggle hint is self-evident from context)

**Acceptance Criteria:**
- [ ] `src/watch/components/HelpBar.tsx` created
- [ ] Renders exactly 1 line at the bottom of the TUI layout
- [ ] Content: `[ left  ] right  Tab focus  j/k nav  r refresh  s scroll  p ports  q quit`
- [ ] Styled with muted/dim color (not bright white)
- [ ] Always visible regardless of panel open/closed state
- [ ] Wired into `cmd-watch.tsx` layout as the bottom row
- [ ] Typecheck passes

### US-002: Wire help bar into main layout
**Description:** As a developer, I want the help bar positioned at the very bottom of the TUI layout so it anchors the UI.

The main layout in `cmd-watch.tsx` should be structured as:
```
<box display="flex" flexDirection="column" width="100%" height="100%">
  <box display="flex" flexDirection="row" flexGrow={1}>
    <Show when={app.leftPanelOpen()}><SessionPicker /></Show>
    <AgentTerminal />
    <Show when={app.rightPanelOpen()}><DiffPanel /></Show>
  </box>
  <HelpBar />   {/* fixed 1-line height at bottom */}
</box>
```

**Acceptance Criteria:**
- [ ] `HelpBar` is the last child in the outermost column flex container
- [ ] `HelpBar` has fixed `height={1}` (does not grow)
- [ ] The panel row above uses `flexGrow={1}` to fill remaining vertical space
- [ ] Help bar text does not wrap (truncate if terminal is very narrow)
- [ ] Typecheck passes

---

## Functional Requirements

- **FR-1:** `src/watch/components/HelpBar.tsx` renders 1-line keybinding reference
- **FR-2:** Content: `[ left  ] right  Tab focus  j/k nav  r refresh  s scroll  p ports  q quit`
- **FR-3:** Styled with dim/muted color from opentui theme or `picocolors.dim()`
- **FR-4:** Fixed `height={1}` — never grows
- **FR-5:** Positioned as the last row in the root column flex layout

---

## Non-Goals

- No interactive help (no `?` key to open a help dialog)
- No context-sensitive help (same bar regardless of which panel is focused)
- No mouse hover tooltips

---

## Technical Considerations

**Height locking:** In opentui, `height={1}` on a `<box>` should fix it to one row. If this causes issues, wrap in `<box height={1} overflow="hidden">`.

**Truncation:** If terminal width is very narrow (< 60 columns), the full help text won't fit. Options:
1. Simple: let it truncate naturally (opentui clips at boundary)
2. Better: abbreviate to just `[ ] Tab j/k r s p q` when width < 60

For v1, option 1 (natural truncation) is sufficient.

**Color:** opendocker uses `theme.muted` from their ThemeContext. For yolomode without a full theme system, use `picocolors.dim(text)` or opentui's built-in `color="gray"` prop.

---

## Success Metrics

- Help bar visible in all terminal sizes ≥ 80 columns
- Help bar never steals vertical space from main panels (fixed 1-line height)
- New users can discover all keybindings from the bar alone

---

## Open Questions

- Should `p ports` be shown even before Epic 6 (port forwarding) is implemented in the TUI? The underlying `cmd-forward.ts` exists but the TUI overlay does not. For now, show it as a hint.
- Should the help bar show the active panel focus (e.g., highlight `j/k nav` when a list panel is focused)?
