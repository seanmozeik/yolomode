/**
 * Tests for useDirtyPoller hook.
 *
 * The hook uses setInterval (not createRenderEffect) so that it checks
 * sessionId() and rightPanelOpen() reactively on every tick.
 *
 * Tests use a short intervalMs (10-20ms) and await tick(80ms) to let
 * multiple polls fire before asserting.
 */
import { describe, expect, it, mock } from 'bun:test';
import { createRoot } from 'solid-js';
import { type ExecFn, useDirtyPoller } from '../hooks/useDirtyPoller';

const tick = (ms = 80) => new Promise<void>((r) => setTimeout(r, ms));

describe('useDirtyPoller', () => {
  it('starts with dirty = false', () => {
    const execFn: ExecFn = mock(async () => '');
    let result!: ReturnType<typeof useDirtyPoller>;
    const dispose = createRoot((d) => {
      result = useDirtyPoller(
        () => 'abc123',
        () => true,
        execFn,
        10000
      );
      return d;
    });
    expect(result.dirty()).toBe(false);
    dispose();
  });

  it('does not call exec when sessionId is null', async () => {
    const execFn: ExecFn = mock(async () => '');
    const dispose = createRoot((d) => {
      useDirtyPoller(
        () => null,
        () => true,
        execFn,
        10
      );
      return d;
    });
    await tick();
    expect(execFn).not.toHaveBeenCalled();
    dispose();
  });

  it('does not call exec when rightPanelOpen is false', async () => {
    const execFn: ExecFn = mock(async () => '');
    const dispose = createRoot((d) => {
      useDirtyPoller(
        () => 'abc123',
        () => false,
        execFn,
        10
      );
      return d;
    });
    await tick();
    expect(execFn).not.toHaveBeenCalled();
    dispose();
  });

  it('calls exec with the correct sessionId', async () => {
    const execFn: ExecFn = mock(async () => '');
    const dispose = createRoot((d) => {
      useDirtyPoller(
        () => 'sess-xyz',
        () => true,
        execFn,
        10
      );
      return d;
    });
    await tick();
    expect(execFn).toHaveBeenCalledWith('sess-xyz');
    dispose();
  });

  it('keeps dirty false after first poll (baseline established, no prior list)', async () => {
    const execFn: ExecFn = mock(async () => 'a.ts\nb.ts\n');
    let result!: ReturnType<typeof useDirtyPoller>;
    const dispose = createRoot((d) => {
      result = useDirtyPoller(
        () => 'abc123',
        () => true,
        execFn,
        10
      );
      return d;
    });
    await tick();
    expect(result.dirty()).toBe(false);
    dispose();
  });

  it('sets dirty to true when files change between polls', async () => {
    let callCount = 0;
    const execFn: ExecFn = mock(async () => {
      callCount++;
      return callCount === 1 ? 'a.ts\n' : 'a.ts\nb.ts\n';
    });
    let result!: ReturnType<typeof useDirtyPoller>;
    const dispose = createRoot((d) => {
      result = useDirtyPoller(
        () => 'abc123',
        () => true,
        execFn,
        20
      );
      return d;
    });
    await tick(120); // wait for 2+ interval fires
    expect(result.dirty()).toBe(true);
    dispose();
  });

  it('keeps dirty false when file list is unchanged between polls', async () => {
    const execFn: ExecFn = mock(async () => 'a.ts\nb.ts\n');
    let result!: ReturnType<typeof useDirtyPoller>;
    const dispose = createRoot((d) => {
      result = useDirtyPoller(
        () => 'abc123',
        () => true,
        execFn,
        20
      );
      return d;
    });
    await tick(120);
    expect(result.dirty()).toBe(false);
    dispose();
  });

  it('clearDirty resets dirty to false', async () => {
    let callCount = 0;
    const execFn: ExecFn = mock(async () => {
      callCount++;
      return callCount === 1 ? 'a.ts\n' : 'a.ts\nb.ts\n';
    });
    let result!: ReturnType<typeof useDirtyPoller>;
    const dispose = createRoot((d) => {
      result = useDirtyPoller(
        () => 'abc123',
        () => true,
        execFn,
        20
      );
      return d;
    });
    await tick(120);
    expect(result.dirty()).toBe(true);
    result.clearDirty();
    expect(result.dirty()).toBe(false);
    dispose();
  });

  it('clears the interval on cleanup', () => {
    const origClearInterval = globalThis.clearInterval;
    let cleared = false;
    globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
      cleared = true;
      origClearInterval(id);
    }) as typeof clearInterval;

    const execFn: ExecFn = mock(async () => '');
    const dispose = createRoot((d) => {
      useDirtyPoller(
        () => 'abc123',
        () => true,
        execFn,
        10000
      );
      return d;
    });

    dispose(); // triggers onCleanup → clearInterval
    expect(cleared).toBe(true);
    globalThis.clearInterval = origClearInterval;
  });

  it('does not set dirty true again when same-order file list recurs after change', async () => {
    let callCount = 0;
    const execFn: ExecFn = mock(async () => {
      callCount++;
      // poll 1: baseline; poll 2: changed; poll 3: same as poll 2 → should stay dirty, not reset
      if (callCount === 1) return 'a.ts\n';
      return 'a.ts\nb.ts\n';
    });
    let result!: ReturnType<typeof useDirtyPoller>;
    const dispose = createRoot((d) => {
      result = useDirtyPoller(
        () => 'abc123',
        () => true,
        execFn,
        20
      );
      return d;
    });
    await tick(120);
    // After clear, the baseline is updated so same list won't re-dirty
    result.clearDirty();
    await tick(80);
    expect(result.dirty()).toBe(false); // same files — no new change
    dispose();
  });
});
