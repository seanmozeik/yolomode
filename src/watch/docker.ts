import { IMAGE } from '../constants';

export type Session = {
  id: string;
  name: string;
  status: 'running' | 'stopped';
  uptime: string;
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
