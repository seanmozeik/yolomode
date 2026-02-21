# Ralph UI/UX Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve `ralph` terminal output with boxen iteration headers showing active story, ora spinner between iterations, and a completion summary panel.

**Architecture:** All changes are in `src/cmd-ralph.ts`. Before each iteration, read `prd.json` from the container via `docker exec ... cat prd.json` to get the active story. Print a boxen header, stream agent output, show ora spinner during the 2s sleep, then print a summary boxen at completion. Missing/invalid `prd.json` is a fatal error.

**Tech Stack:** TypeScript, Bun, picocolors (`pc`), boxen, ora — all already installed and used in the project.

---

### Task 1: Add prd.json reading helper

**Files:**
- Modify: `src/cmd-ralph.ts`

**Context:** `die()` and `warn()` are imported from `./utils`. `boxen` and `ora` are used in `cmd-run.ts` and are available in the project. `pc` (picocolors) is already imported in `cmd-ralph.ts`.

**Step 1: Add boxen and ora imports to cmd-ralph.ts**

Open `src/cmd-ralph.ts`. The current imports are:

```ts
import pc from 'picocolors';
import RALPH_SH from '../ralph.sh' with { type: 'text' };
import { die, ensureRunning, getFlags, getWorkDir, resolveSession, warn } from './utils';
```

Add `boxen` and `ora`:

```ts
import boxen from 'boxen';
import ora from 'ora';
import pc from 'picocolors';
import RALPH_SH from '../ralph.sh' with { type: 'text' };
import { die, ensureRunning, getFlags, getWorkDir, resolveSession, warn } from './utils';
```

**Step 2: Add the prd.json story interface and reader function**

Add this after the `isRalphAgent` function (before `cmdRalph`):

```ts
interface PrdStory {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'complete';
  priority?: number;
}

interface Prd {
  stories: PrdStory[];
}

async function readPrd(containerId: string, workDir: string): Promise<Prd> {
  const proc = Bun.spawn(['docker', 'exec', '-w', workDir, containerId, 'cat', 'prd.json'], {
    stderr: 'pipe',
    stdout: 'pipe'
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    die('no prd.json found in work dir');
  }
  const text = await new Response(proc.stdout).text();
  let prd: Prd;
  try {
    prd = JSON.parse(text) as Prd;
  } catch {
    die('prd.json is not valid JSON');
  }
  if (!Array.isArray(prd.stories)) {
    die('prd.json is missing a "stories" array');
  }
  return prd;
}

function activeStory(prd: Prd): PrdStory | undefined {
  return (
    prd.stories.find((s) => s.status === 'in_progress') ??
    prd.stories
      .filter((s) => s.status === 'pending')
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))[0]
  );
}
```

**Step 3: Verify TypeScript compiles**

Run: `bun run typecheck` (or `bun tsc --noEmit` if no typecheck script)

Check `package.json` scripts first: `cat package.json | grep -A5 '"scripts"'`

Expected: no errors.

**Step 4: Commit**

```bash
git add src/cmd-ralph.ts
git commit -m "feat(ralph): add prd.json reader and story helpers"
```

---

### Task 2: Replace iteration header with boxen panel

**Files:**
- Modify: `src/cmd-ralph.ts`

**Context:** Currently the iteration header is:
```ts
console.log(`\n${pc.cyan(pc.bold(`ralph: iteration ${i}/${maxIter}`))}`);
```

**Step 1: Read prd.json before each iteration and print boxen header**

Find the `for` loop in `cmdRalph`. The loop starts with:
```ts
for (let i = 1; i <= maxIter; i++) {
  console.log(`\n${pc.cyan(pc.bold(`ralph: iteration ${i}/${maxIter}`))}`);
```

Replace the `console.log` inside the loop with:

```ts
for (let i = 1; i <= maxIter; i++) {
  const prd = await readPrd(id, workDir);
  const story = activeStory(prd);
  const storyLine = story
    ? `${pc.cyan(pc.bold(story.id))}: ${story.title}`
    : pc.dim('(picking next pending story)');
  console.log(
    boxen(`${storyLine}\n${pc.dim(`iteration ${i}/${maxIter} · ${agent}`)}`, {
      borderColor: 'cyan',
      borderStyle: 'round',
      padding: { bottom: 0, left: 2, right: 2, top: 0 },
      title: pc.cyan(pc.bold('ralph')),
      titleAlignment: 'left'
    })
  );
```

Note: the `boxen` call must leave the `}` for the `for` block open — you're only replacing the single `console.log` line, not the entire loop body.

**Step 2: Run the CLI to sanity check (dry run)**

```bash
bun run src/cli.ts ralph --help 2>&1 || true
```

Expected: usage error message prints (no crashes from the import changes).

**Step 3: Commit**

```bash
git add src/cmd-ralph.ts
git commit -m "feat(ralph): boxen iteration header with active story"
```

---

### Task 3: Add ora spinner between iterations

**Files:**
- Modify: `src/cmd-ralph.ts`

**Context:** Currently the inter-iteration sleep is:
```ts
if (i < maxIter) {
  await Bun.sleep(2000);
}
```

**Step 1: Replace bare sleep with ora spinner**

Find the sleep block and replace it:

```ts
if (i < maxIter) {
  const sleepSpinner = ora({ text: pc.dim('next story in 2s…'), color: 'cyan' }).start();
  await Bun.sleep(2000);
  sleepSpinner.stop();
}
```

Note: `.stop()` (not `.succeed()`) so no checkmark is printed — we just want the spinner to go away cleanly before the next boxen header.

**Step 2: Test the timing visually**

Run a quick ralph invocation against a real session if one is available, or just verify no TypeScript errors:

```bash
bun run typecheck 2>&1 || bun tsc --noEmit 2>&1
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/cmd-ralph.ts
git commit -m "feat(ralph): ora spinner during inter-iteration sleep"
```

---

### Task 4: Add completion summary panel

**Files:**
- Modify: `src/cmd-ralph.ts`

**Context:** Currently when `COMPLETE` is detected:
```ts
if (output.includes('<promise>COMPLETE</promise>')) {
  console.log(pc.green(pc.bold('\nralph: all stories complete!')));
  process.exit(0);
}
```

And on max-iterations:
```ts
warn(`max iterations (${maxIter}) reached`);
process.exit(1);
```

**Step 1: Add a summary helper function**

Add this function after `activeStory`:

```ts
function summaryPanel(prd: Prd, success: boolean): string {
  const lines = prd.stories.map((s) => {
    const icon =
      s.status === 'complete' ? pc.green('✔') : s.status === 'in_progress' ? pc.yellow('…') : pc.red('✗');
    return `${icon}  ${pc.dim(s.id.padEnd(12))} ${s.title}`;
  });
  return boxen(lines.join('\n'), {
    borderColor: success ? 'green' : 'yellow',
    borderStyle: 'round',
    padding: { bottom: 0, left: 2, right: 2, top: 0 },
    title: success ? pc.green(pc.bold('complete')) : pc.yellow(pc.bold('incomplete')),
    titleAlignment: 'left'
  });
}
```

**Step 2: Replace the COMPLETE handler**

Find:
```ts
if (output.includes('<promise>COMPLETE</promise>')) {
  console.log(pc.green(pc.bold('\nralph: all stories complete!')));
  process.exit(0);
}
```

Replace with:
```ts
if (output.includes('<promise>COMPLETE</promise>')) {
  const finalPrd = await readPrd(id, workDir);
  console.log('\n' + summaryPanel(finalPrd, true));
  process.exit(0);
}
```

**Step 3: Replace the max-iterations warning**

Find:
```ts
warn(`max iterations (${maxIter}) reached`);
process.exit(1);
```

Replace with:
```ts
const finalPrd = await readPrd(id, workDir);
console.log('\n' + summaryPanel(finalPrd, false));
warn(`max iterations (${maxIter}) reached`);
process.exit(1);
```

**Step 4: Verify TypeScript**

```bash
bun run typecheck 2>&1 || bun tsc --noEmit 2>&1
```

Expected: no errors.

**Step 5: Commit**

```bash
git add src/cmd-ralph.ts
git commit -m "feat(ralph): completion and failure summary panels"
```

---

### Task 5: Final review and cleanup

**Files:**
- Review: `src/cmd-ralph.ts`

**Step 1: Read the full file and verify structure**

Open `src/cmd-ralph.ts` and check:
- [ ] `boxen` and `ora` imports at top
- [ ] `readPrd`, `activeStory`, `summaryPanel` helpers defined before `cmdRalph`
- [ ] Iteration loop: boxen header → agent stream → spinner sleep
- [ ] COMPLETE path: reads final prd.json, prints green summary, exits 0
- [ ] Max-iterations path: reads final prd.json, prints yellow summary, `warn()`, exits 1
- [ ] No `console.log` of the old `ralph: iteration N/N` plain text remains

**Step 2: Run typecheck one final time**

```bash
bun run typecheck 2>&1 || bun tsc --noEmit 2>&1
```

Expected: clean.

**Step 3: Commit if any cleanup was needed**

```bash
git add src/cmd-ralph.ts
git commit -m "chore(ralph): cleanup and final review"
```
