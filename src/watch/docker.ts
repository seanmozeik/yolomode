import { IMAGE } from '../constants';
import { isNoisyFile } from './utils/noisyFilter';

export type Session = {
  id: string;
  name: string;
  status: 'running' | 'stopped';
  uptime: string;
};

export type DiffFile = {
  status: 'M' | 'A' | 'D' | 'R';
  path: string;
  oldPath?: string;
  mtime: number;
  noisy: boolean;
};

/** Runs a command and returns stdout as a string. */
export type CommandRunner = (args: string[]) => Promise<string>;

/** Default command runner using Bun.spawn with piped I/O (never inherits TTY). */
const defaultRunner: CommandRunner = async (args: string[]) => {
  const proc = Bun.spawn(args, { stderr: 'pipe', stdout: 'pipe' });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text;
};

/**
 * List yolomode Docker containers.
 *
 * Accepts an optional command runner for testing (inject a mock that returns
 * fixture JSON instead of calling the real Docker daemon).
 */
export async function listSessions(runner: CommandRunner = defaultRunner): Promise<Session[]> {
  const raw = await runner([
    'docker',
    'ps',
    '-a',
    '--filter',
    `ancestor=${IMAGE}`,
    '--format',
    'json'
  ]);

  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];

  const sessions: Session[] = [];
  for (const line of lines) {
    let obj: { ID: string; Names: string; State: string; Status: string };
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    sessions.push({
      id: obj.ID,
      name: obj.Names.replace(/^\//, ''),
      status: obj.State === 'running' ? 'running' : 'stopped',
      uptime: obj.Status
    });
  }

  // Sort: running first, then stopped; alphabetical by name within each group
  sessions.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'running' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return sessions;
}

/**
 * Fetch mtime for each path in parallel with a concurrency cap.
 * Uses manual batching (no external dependency).
 */
async function fetchMtimes(
  sessionId: string,
  paths: string[],
  runner: CommandRunner,
  concurrency = 20
): Promise<number[]> {
  const results: number[] = new Array(paths.length);

  for (let i = 0; i < paths.length; i += concurrency) {
    const batch = paths.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (p) => {
        try {
          const output = await runner([
            'docker',
            'exec',
            sessionId,
            'stat',
            '-c',
            '%Y',
            `/workspace/${p}`
          ]);
          return parseInt(output.trim(), 10) || 0;
        } catch {
          return 0;
        }
      })
    );
    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
    }
  }

  return results;
}

/**
 * List files changed vs `yolomode-base` inside a Docker container.
 *
 * Runs `git diff --name-status yolomode-base` via `docker exec`, parses M/A/D/R
 * status, fetches mtime for each file in parallel (max 20 concurrent), sorts by
 * mtime descending with alphabetical path tiebreaker, and filters noisy files.
 *
 * Returns empty array when `yolomode-base` branch does not exist.
 */
export async function listChangedFiles(
  sessionId: string,
  showAll: boolean,
  runner: CommandRunner = defaultRunner
): Promise<DiffFile[]> {
  const raw = await runner([
    'docker',
    'exec',
    sessionId,
    'git',
    '-C',
    '/workspace',
    'diff',
    '--name-status',
    'yolomode-base'
  ]);

  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];

  // Parse M/A/D/R lines
  const parsed: { status: 'M' | 'A' | 'D' | 'R'; path: string; oldPath?: string }[] = [];
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const statusField = parts[0].trim();
    if (statusField.startsWith('R')) {
      // Rename: R100\toldpath\tnewpath
      parsed.push({
        oldPath: parts[1].trim(),
        path: parts[2]?.trim() ?? parts[1].trim(),
        status: 'R'
      });
    } else if (['M', 'A', 'D'].includes(statusField)) {
      parsed.push({
        path: parts[1].trim(),
        status: statusField as 'M' | 'A' | 'D'
      });
    }
  }

  if (parsed.length === 0) return [];

  // Filter noisy files when showAll=false
  const candidates = showAll ? parsed : parsed.filter((f) => !isNoisyFile(f.path));
  if (candidates.length === 0) return [];

  // Fetch mtime for each file in parallel (max 20 concurrent)
  const mtimes = await fetchMtimes(
    sessionId,
    candidates.map((f) => f.path),
    runner
  );

  // Build DiffFile array
  const result: DiffFile[] = candidates.map((f, i) => ({
    ...f,
    mtime: mtimes[i],
    noisy: isNoisyFile(f.path)
  }));

  // Sort by mtime descending; alphabetical path as tiebreaker
  result.sort((a, b) => {
    if (a.mtime !== b.mtime) return b.mtime - a.mtime;
    return a.path.localeCompare(b.path);
  });

  return result;
}
