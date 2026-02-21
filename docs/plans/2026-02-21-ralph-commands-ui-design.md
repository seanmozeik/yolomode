# Ralph UI/UX Improvement Design

**Date:** 2026-02-21
**File:** `src/cmd-ralph.ts`
**Status:** Approved

## Problem

Ralph's terminal output is visually inconsistent with the rest of the CLI:

- Iteration headers are plain text with no visual separation
- Agent output streams in with no framing — impossible to tell where Ralph's own output ends and the agent begins
- No story-level status (which story is being worked on, how many remain)
- Nothing displayed during the 2s sleep between iterations — unclear if it's hanging
- No color; no spinners; no summary at the end

## Approach: Structured Sections

All changes are isolated to `src/cmd-ralph.ts`. No new dependencies — `boxen` and `ora` are already in use in `cmd-run.ts`.

## Visual Components

### Iteration Header

A `boxen` panel with cyan round border printed before each iteration, showing:

```
╭─ ralph ──────────────────────────────────────────╮
│  story-3: Add user auth endpoint                  │
│  iteration 2/5 · claude                           │
╰──────────────────────────────────────────────────╯
```

Story title is read from `prd.json` in the container before each iteration.

### Agent Output

Streams directly to stdout as today, but framed below the iteration header. No dimming — full fidelity output.

### Inter-iteration Spinner

`ora` spinner between iterations:

```
  ⠋ next story in 2s...
```

Stopped before the next boxen header prints.

### Completion Summary

On `<promise>COMPLETE</promise>`, a final `boxen` panel with green border lists all stories:

```
╭─ complete ───────────────────────────────────────╮
│  ✔ story-1  Setup project structure               │
│  ✔ story-2  Add database schema                   │
│  ✔ story-3  Add user auth endpoint                │
╰──────────────────────────────────────────────────╯
```

### Max-iterations Warning

On hitting the iteration limit, print a summary panel showing incomplete stories, then `warn()` as today.

## Data Flow

Before each iteration:

1. `docker exec -w <workDir> <id> cat prd.json` — read prd.json from the container
2. Parse JSON; find the story with `status === "in_progress"` (or fall back to the highest-priority `pending` story)
3. Display story ID and title in the boxen header
4. Run the agent as normal

After the agent completes (on `COMPLETE` or max iterations):

1. Read `prd.json` one final time for the summary panel

## Error Handling

| Condition | Behavior |
|-----------|----------|
| `prd.json` missing | `die("no prd.json found in work dir")` — fatal exit |
| `prd.json` parse error | `die("prd.json is not valid JSON")` — fatal exit |
| No `in_progress` story | Show `"(picking next pending story)"` — normal, agent sets it |
| Docker exec fails (container stopped) | Existing `ensureRunning` check handles this |

## Implementation Notes

- `docker exec` for prd.json read uses `Bun.spawn` with `stdout: 'pipe'`, not `$` shell — avoids shell escaping issues
- `ora` spinner must be `.stop()`'d before any `console.log` or `boxen` to prevent line corruption
- Summary panel uses the same `boxen` options as `cmd-run.ts` for consistency (`borderStyle: 'round'`, `padding: { top: 1, bottom: 1, left: 2, right: 2 }`)
- Green border color for completion, cyan for iteration headers (matching existing palette)
