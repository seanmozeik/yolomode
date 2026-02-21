/**
 * Tests for useLogStream hook.
 *
 * NOTE: Bun loads solid-js via the "node" export condition, which resolves to
 * solid-js/dist/server.cjs.  In that build:
 *   - createEffect is a no-op (never runs)
 *   - createRenderEffect runs ONCE synchronously (no reactive re-runs)
 *   - onCleanup registers correctly and fires on dispose()
 *
 * These tests therefore cover:
 *   1. Initial spawn behaviour (synchronous after createRenderEffect)
 *   2. Async stream accumulation (stdout + stderr → lines)
 *   3. clearLines()
 *   4. Process killed via onCleanup when the root is disposed
 */
import { describe, expect, it, mock } from 'bun:test';
import { createRoot } from 'solid-js';
import { type SpawnFn, useLogStream } from '../hooks/useLogStream';

const encoder = new TextEncoder();

/** Create a ReadableStream that yields the given chunks then closes */
function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    }
  });
}

/** Build a fake proc with optional stdout/stderr content */
function fakeProc(stdoutChunks: string[] = [], stderrChunks: string[] = []) {
  return {
    kill: mock(() => {}),
    stderr: makeStream(stderrChunks),
    stdout: makeStream(stdoutChunks)
  };
}

/** Wait for async stream reads to settle */
const tick = () => new Promise<void>((r) => setTimeout(r, 30));

describe('useLogStream', () => {
  it('returns empty lines and does not spawn when sessionId is null', () => {
    const spawnFn = mock((_id: string) => fakeProc());

    let result!: ReturnType<typeof useLogStream>;
    const dispose = createRoot((d) => {
      result = useLogStream(() => null, spawnFn);
      return d;
    });

    // createRenderEffect runs synchronously — if id is null it returns early
    expect(spawnFn).not.toHaveBeenCalled();
    expect(result.lines()).toEqual([]);
    dispose();
  });

  it('spawns a process with the given sessionId', () => {
    const spawnFn = mock((_id: string) => fakeProc());

    const dispose = createRoot((d) => {
      useLogStream(() => 'abc123', spawnFn);
      return d;
    });

    // createRenderEffect is synchronous — spawn happens inside createRoot
    expect(spawnFn).toHaveBeenCalledWith('abc123');
    dispose();
  });

  it('accumulates stdout chunks into lines', async () => {
    const spawnFn = mock((_id: string) => fakeProc(['hello\nworld\n']));

    let result!: ReturnType<typeof useLogStream>;
    const dispose = createRoot((d) => {
      result = useLogStream(() => 'abc123', spawnFn);
      return d;
    });

    await tick(); // stream reads are async
    expect(result.lines()).toContain('hello');
    expect(result.lines()).toContain('world');
    dispose();
  });

  it('accumulates stderr chunks into the same lines array', async () => {
    const spawnFn = mock((_id: string) => fakeProc([], ['error-line\n']));

    let result!: ReturnType<typeof useLogStream>;
    const dispose = createRoot((d) => {
      result = useLogStream(() => 'abc123', spawnFn);
      return d;
    });

    await tick();
    expect(result.lines()).toContain('error-line');
    dispose();
  });

  it('merges stdout and stderr into one ordered array', async () => {
    const spawnFn = mock((_id: string) => fakeProc(['out\n'], ['err\n']));

    let result!: ReturnType<typeof useLogStream>;
    const dispose = createRoot((d) => {
      result = useLogStream(() => 'abc123', spawnFn);
      return d;
    });

    await tick();
    const lines = result.lines();
    expect(lines).toContain('out');
    expect(lines).toContain('err');
    dispose();
  });

  it('clearLines resets lines to an empty array', async () => {
    const spawnFn = mock((_id: string) => fakeProc(['line1\nline2\n']));

    let result!: ReturnType<typeof useLogStream>;
    const dispose = createRoot((d) => {
      result = useLogStream(() => 'abc123', spawnFn);
      return d;
    });

    await tick();
    expect(result.lines().length).toBeGreaterThan(0);
    result.clearLines();
    expect(result.lines()).toEqual([]);
    dispose();
  });

  it('kills the process when the root is disposed (onCleanup)', () => {
    const killFn = mock(() => {});
    const spawnFn: SpawnFn = (_id: string) => ({
      kill: killFn,
      stderr: makeStream([]),
      stdout: makeStream([])
    });

    const dispose = createRoot((d) => {
      useLogStream(() => 'abc123', spawnFn);
      return d;
    });

    expect(killFn).not.toHaveBeenCalled();
    dispose(); // triggers onCleanup → proc.kill()
    expect(killFn).toHaveBeenCalled();
  });

  it('starts lines empty for a new session', () => {
    // Verify that lines() starts as [] (before any async reads)
    const spawnFn = mock((_id: string) => fakeProc());

    let result!: ReturnType<typeof useLogStream>;
    const dispose = createRoot((d) => {
      result = useLogStream(() => 'session-x', spawnFn);
      return d;
    });

    expect(result.lines()).toEqual([]);
    dispose();
  });
});
