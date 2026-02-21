import { type Accessor, createRenderEffect, createSignal, onCleanup } from 'solid-js';
import { manageBuffer } from '../utils/logBuffer';

/** Injectable spawn interface — keeps tests free from a real Docker daemon. */
export type SpawnFn = (sessionId: string) => {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  kill(): void;
};

const defaultSpawn: SpawnFn = (sessionId: string) => {
  const proc = Bun.spawn(['docker', 'logs', '--follow', '--tail', '200', sessionId], {
    stderr: 'pipe',
    stdout: 'pipe'
  });
  return {
    kill: () => proc.kill(),
    stderr: proc.stderr,
    stdout: proc.stdout
  };
};

/**
 * Solid.js hook that streams `docker logs -f` for the active session.
 *
 * - Restarts when sessionId() changes (kills previous process, clears lines)
 * - Merges stdout and stderr into the same lines array
 * - Caps buffer at 5,000 lines (trimmed at 5,500 via manageBuffer hysteresis)
 * - onCleanup kills the Bun process when the session changes or TUI exits
 */
export function useLogStream(
  sessionId: Accessor<string | null>,
  spawnFn: SpawnFn = defaultSpawn
): { lines: Accessor<string[]>; clearLines: () => void } {
  const [lines, setLines] = createSignal<string[]>([]);

  // createRenderEffect runs synchronously (both in browser and in Bun's server build),
  // which makes it testable and correct for a TUI that doesn't have a browser render cycle.
  createRenderEffect(() => {
    const id = sessionId();
    if (!id) return;

    // Clear previous session's lines before starting the new stream
    setLines([]);

    const proc = spawnFn(id);

    const readStream = async (stream: ReadableStream<Uint8Array>) => {
      const decoder = new TextDecoder();
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          setLines((prev) => manageBuffer(prev, chunk, 5000));
        }
      } catch {
        // Stream cancelled (process killed) or closed — normal exit path
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // Already released
        }
      }
    };

    readStream(proc.stdout);
    readStream(proc.stderr);

    onCleanup(() => {
      proc.kill();
    });
  });

  return { clearLines: () => setLines([]), lines };
}
