# PRD: `yolomode watch` — Epic 1: opentui Foundation

## Introduction

Before any TUI panels can be built, the opentui framework and component library must be installed, verified working with Bun, and wired into the CLI. This epic installs `@opentui/core`, `@opentui/solid`, and `@opentui-ui/*` packages, proves the stack compiles and runs, scaffolds `src/cmd-watch.ts`, registers `watch` in the CLI router, and makes `yolomode` with no arguments launch the TUI directly. All subsequent epics build on this foundation.

**Reference:** opendocker uses `@opentui/core@^0.1.79` + `@opentui/solid@^0.1.79` + `solid-js@^1.9.10`. Their entry point is `packages/cli/src/index.tsx`:

```typescript
render(tui, {
  targetFps: 60,
  gatherStats: false,
  exitOnCtrlC: true,
})
```

---

## Goals

- `@opentui/core`, `@opentui/solid`, `solid-js` installed and importable
- `@opentui-ui/dialog` and `@opentui-ui/toast` (Solid variants) available as building blocks
- A minimal opentui app renders, takes keyboard input, and exits cleanly
- `src/cmd-watch.ts` exists and exports `cmdWatch(args: string[]): Promise<void>`
- `watch` command is discoverable in `yolomode --help`
- Running `yolomode` with no arguments launches the TUI directly (no `watch` subcommand required)
- `bun run tc` (typecheck) and `bun run check` (biome lint) pass

---

## User Stories

### US-001: Install opentui and Solid.js packages
**Description:** As a developer, I want the opentui framework installed so I can build TUI components.

**Acceptance Criteria:**
- [ ] `bun add @opentui/core @opentui/solid solid-js` runs successfully
- [ ] `bun add @opentui-ui/dialog @opentui-ui/toast` runs successfully (for dialog/toast support)
- [ ] All packages appear in `package.json` under `dependencies`
- [ ] `import { render } from "@opentui/solid"` resolves without error in a `.tsx` file
- [ ] Typecheck passes

### US-002: Scaffold `src/cmd-watch.ts` with a minimal opentui app
**Description:** As a developer, I want a minimal working opentui app in `cmd-watch.ts` so I can verify the stack before building real panels.

The minimal app should:
1. Render a single `<box>` with a border and the text "yolomode watch"
2. Listen for `q` and `Ctrl-C` to exit
3. Handle `SIGWINCH` (terminal resize) — verify opentui handles this natively; if not, call the framework's re-render trigger

**Reference:** opendocker's `packages/cli/src/index.tsx` initializes the render loop. Their app wraps everything in a provider stack (`ToastProvider → KVProvider → ApplicationProvider → ThemeProvider → KeybindProvider → DialogProvider → BaseLayout`). For the minimal stub, just render a plain box with no providers.

opendocker uses this pattern in `packages/cli/src/components/ui/pane.tsx`:
```typescript
<box
  borderStyle="round"
  paddingLeft={1}
  paddingRight={1}
>
  <text>yolomode watch</text>
</box>
```

**Acceptance Criteria:**
- [ ] `src/cmd-watch.ts` exists and exports `export async function cmdWatch(args: string[]): Promise<void>`
- [ ] Running `bun run src/cli.ts watch` renders a bordered box in the terminal
- [ ] Pressing `q` exits the TUI cleanly with no terminal corruption (raw mode restored)
- [ ] `Ctrl-C` also exits cleanly
- [ ] Terminal resize does not crash or corrupt output
- [ ] Typecheck passes

### US-003: Wire `watch` command in `cli.ts` and as default no-arg behavior
**Description:** As a user, I want `yolomode watch` to appear in `--help` output, `yolomode watch` to invoke the TUI, and `yolomode` with no arguments to launch the TUI directly without needing to type a subcommand.

**Reference:** `src/cli.ts` already has a `switch` on the first argument and a help table. The existing default/undefined case currently shows help. Change the no-arg default to call `cmdWatch([])` instead.

Pattern to follow for `case 'watch':` is identical to the existing `case 'ralph':` block which calls `await cmdRalph(args.slice(1))`.

```typescript
// In the switch statement:
case 'watch':
  await cmdWatch(args.slice(1))
  break

// The default case (no args):
default:
  if (!command) {
    await cmdWatch([])  // Launch TUI as the default entry point
    break
  }
  // ... existing "unknown command" handling
```

**Acceptance Criteria:**
- [ ] `case 'watch':` added to the switch in `src/cli.ts`
- [ ] `import { cmdWatch } from "./cmd-watch"` added at top of `cli.ts`
- [ ] `watch` appears in the help table with description: `"Full TUI session monitor (default)"`
- [ ] `bun run src/cli.ts` (no args) launches the TUI directly
- [ ] `bun run src/cli.ts watch` also works and invokes the same TUI
- [ ] `bun run src/cli.ts --help` still shows help (flag handling before the default case)
- [ ] Typecheck passes

---

## Functional Requirements

- **FR-1:** `@opentui/core`, `@opentui/solid`, `solid-js`, `@opentui-ui/dialog`, `@opentui-ui/toast` installed as production dependencies
- **FR-2:** `src/cmd-watch.ts` exports `cmdWatch(args: string[]): Promise<void>`
- **FR-3:** The minimal stub renders a bordered box and exits cleanly on `q` or `Ctrl-C`
- **FR-4:** `case 'watch':` in `src/cli.ts` dispatches to `cmdWatch(args.slice(1))`
- **FR-4b:** No-arg default case in `src/cli.ts` calls `cmdWatch([])` — TUI is the primary entry point
- **FR-5:** `watch [name] [--all]` usage shown in help table with `(default)` note
- **FR-6:** `bun run tc` passes (no TypeScript errors)
- **FR-7:** `bun run check` passes (no Biome lint errors)

---

## Non-Goals

- No real panel content yet (session picker, terminal, diff — those are later epics)
- No opentui-skill installation (separate setup step, not code)
- No multi-panel layout yet
- No Docker integration yet

---

## Technical Considerations

**JSX config:** `tsconfig.json` must be updated to support Solid.js JSX. Solid uses `"jsx": "preserve"` with `"jsxImportSource": "solid-js"`. Check existing `tsconfig.json` and add if missing.

**Bun + opentui compatibility:** opendocker uses Bun as runtime. The `render()` call from `@opentui/solid` is synchronous-init but async in execution — wrap in a `Promise` that resolves on exit:
```typescript
export async function cmdWatch(args: string[]): Promise<void> {
  return new Promise((resolve) => {
    render(() => <App onExit={resolve} />, { exitOnCtrlC: true })
  })
}
```

**`exitOnCtrlC: true`** in the render options handles Ctrl-C automatically. For `q`, register a keydown handler inside the app component.

**SIGWINCH:** opentui handles resize natively via its render loop. No manual `SIGWINCH` listener needed unless testing reveals otherwise.

**File extension:** Use `.tsx` for any file containing JSX. `src/cmd-watch.ts` can remain `.ts` if it just calls `render()` imported from a `.tsx` module, or rename to `.tsx` if JSX is used directly.

---

## Success Metrics

- `bun run src/cli.ts watch` shows a bordered box in under 100ms
- `q` exits cleanly: cursor restored, terminal in normal mode, no stray output
- `bun run tc && bun run check` both pass with zero errors
- `yolomode --help` lists `watch` command

---

## Open Questions

- Does opentui's `render()` return a cleanup function or does it block until exit? (Check `@opentui/solid` types.)
- Does Biome need any config changes for Solid.js JSX (vs React JSX)?
- Should `cmd-watch.tsx` be a `.tsx` file from the start, or start as `.ts` and rename when JSX is needed?
