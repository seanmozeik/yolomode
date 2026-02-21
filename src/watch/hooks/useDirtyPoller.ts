import { type Accessor, createSignal, onCleanup } from 'solid-js';
import { haveFilesChanged } from '../utils/fileListDiff';

/**
 * Injectable exec function — runs `git diff --name-only yolomode-base` inside
 * a container and returns the raw stdout string. Kept injectable so tests can
 * mock it without a live Docker daemon.
 */
export type ExecFn = (sessionId: string) => Promise<string>;

const defaultExecFn: ExecFn = async (sessionId: string) => {
  const proc = Bun.spawn(
    [
      'docker',
      'exec',
      sessionId,
      'git',
      '-C',
      '/workspace',
      'diff',
      '--name-only',
      'yolomode-base'
    ],
    { stderr: 'pipe', stdout: 'pipe' }
  );
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text;
};

/**
 * Solid.js hook that polls for changed files every `intervalMs` milliseconds.
 *
 * - Skips polling when sessionId() is null or rightPanelOpen() is false
 * - First successful poll establishes the baseline; dirty stays false
 * - Subsequent polls that differ from the baseline set dirty = true
 * - clearDirty() resets the indicator without changing the baseline
 * - onCleanup cancels the interval
 */
export function useDirtyPoller(
  sessionId: Accessor<string | null>,
  rightPanelOpen: Accessor<boolean>,
  execFn: ExecFn = defaultExecFn,
  intervalMs = 3000
): { dirty: Accessor<boolean>; clearDirty: () => void } {
  const [dirty, setDirty] = createSignal(false);

  // null = not yet initialised; first successful poll sets the baseline
  let prevFiles: string[] | null = null;

  const intervalId = setInterval(async () => {
    const id = sessionId();
    if (!id || !rightPanelOpen()) return;

    try {
      const output = await execFn(id);
      const files = output.split('\n').filter(Boolean);

      if (prevFiles === null) {
        // First poll: establish baseline without marking dirty
        prevFiles = files;
      } else if (haveFilesChanged(prevFiles, files)) {
        prevFiles = files;
        setDirty(true);
      }
    } catch {
      // Docker not available, container not running, or yolomode-base missing
    }
  }, intervalMs);

  onCleanup(() => clearInterval(intervalId));

  return { clearDirty: () => setDirty(false), dirty };
}
