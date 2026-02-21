import { describe, expect, it } from 'bun:test';
import { type CommandRunner, listChangedFiles, listSessions, type Session } from '../docker';

// ── Fixture helpers ──────────────────────────────────────────────

/** Build a docker ps JSON line (mimics `docker ps --format json` output). */
function dockerLine(overrides: {
  ID?: string;
  Names?: string;
  State?: string;
  Status?: string;
}): string {
  return JSON.stringify({
    Command: '"/bin/sh"',
    CreatedAt: '2025-01-01 00:00:00 +0000 UTC',
    ID: overrides.ID ?? 'abc123',
    Image: 'yolomode',
    Labels: '',
    LocalVolumes: '0',
    Mounts: '',
    Names: overrides.Names ?? '/bold-fox',
    Networks: 'bridge',
    Ports: '',
    RunningFor: overrides.Status ?? 'Up 2 hours',
    Size: '0B',
    State: overrides.State ?? 'running',
    Status: overrides.Status ?? 'Up 2 hours'
  });
}

/** Create a mock command runner that returns the given stdout lines. */
function mockRunner(lines: string[]): CommandRunner {
  return async (_args: string[]) => lines.join('\n');
}

// ── Tests ────────────────────────────────────────────────────────

describe('listSessions', () => {
  it('returns running and stopped containers', async () => {
    const runner = mockRunner([
      dockerLine({ ID: 'aaa', Names: '/bold-fox', State: 'running', Status: 'Up 2 hours' }),
      dockerLine({ ID: 'bbb', Names: '/calm-owl', State: 'exited', Status: 'Exited (0) 1 day ago' })
    ]);

    const sessions = await listSessions(runner);

    expect(sessions).toHaveLength(2);
    expect(sessions[0].status).toBe('running');
    expect(sessions[1].status).toBe('stopped');
  });

  it('sorts running-first then alphabetical within each group', async () => {
    const runner = mockRunner([
      dockerLine({ ID: '1', Names: '/wild-yak', State: 'running', Status: 'Up 5m' }),
      dockerLine({ ID: '2', Names: '/calm-bee', State: 'exited', Status: 'Exited (0) 2h ago' }),
      dockerLine({ ID: '3', Names: '/bold-fox', State: 'running', Status: 'Up 1h' }),
      dockerLine({ ID: '4', Names: '/zen-ant', State: 'exited', Status: 'Exited (0) 3h ago' })
    ]);

    const sessions = await listSessions(runner);

    // Running first, alphabetical
    expect(sessions[0]).toMatchObject({ name: 'bold-fox', status: 'running' });
    expect(sessions[1]).toMatchObject({ name: 'wild-yak', status: 'running' });
    // Stopped second, alphabetical
    expect(sessions[2]).toMatchObject({ name: 'calm-bee', status: 'stopped' });
    expect(sessions[3]).toMatchObject({ name: 'zen-ant', status: 'stopped' });
  });

  it('strips leading slash from container name', async () => {
    const runner = mockRunner([
      dockerLine({ ID: 'abc', Names: '/bold-fox', State: 'running', Status: 'Up 2h' })
    ]);

    const sessions = await listSessions(runner);

    expect(sessions[0].name).toBe('bold-fox');
  });

  it('returns empty array when no containers', async () => {
    const runner = mockRunner(['']);

    const sessions = await listSessions(runner);

    expect(sessions).toEqual([]);
  });

  it('returns empty array when runner returns empty string', async () => {
    const runner: CommandRunner = async () => '';

    const sessions = await listSessions(runner);

    expect(sessions).toEqual([]);
  });

  it('maps docker fields to Session correctly', async () => {
    const runner = mockRunner([
      dockerLine({ ID: 'def456', Names: '/quiet-owl', State: 'running', Status: 'Up 5 minutes' })
    ]);

    const sessions = await listSessions(runner);

    expect(sessions[0]).toEqual({
      id: 'def456',
      name: 'quiet-owl',
      status: 'running',
      uptime: 'Up 5 minutes'
    } satisfies Session);
  });

  it('maps exited state to stopped status', async () => {
    const runner = mockRunner([
      dockerLine({ ID: 'xyz', Names: '/lazy-cat', State: 'exited', Status: 'Exited (0) 1 day ago' })
    ]);

    const sessions = await listSessions(runner);

    expect(sessions[0].status).toBe('stopped');
  });
});

// ── listChangedFiles fixtures ─────────────────────────────────────

/**
 * Create a mock runner that returns different output depending on the command.
 * - git diff --name-status → diffOutput
 * - stat -c %Y → mtime from mtimeMap keyed by workspace-relative path
 */
function diffMock(diffOutput: string, mtimeMap: Record<string, number> = {}): CommandRunner {
  return async (args: string[]) => {
    if (args.includes('diff') && args.includes('--name-status')) {
      return diffOutput;
    }
    if (args.includes('stat')) {
      const pathArg = args[args.length - 1];
      const relPath = pathArg.replace('/workspace/', '');
      return `${mtimeMap[relPath] ?? 0}\n`;
    }
    return '';
  };
}

// ── listChangedFiles tests ────────────────────────────────────────

describe('listChangedFiles', () => {
  it('parses M/A/D status lines correctly', async () => {
    const runner = diffMock('M\tsrc/foo.ts\nA\tsrc/bar.ts\nD\tsrc/old.ts\n', {
      'src/bar.ts': 200,
      'src/foo.ts': 100,
      'src/old.ts': 50
    });

    const files = await listChangedFiles('container1', false, runner);

    expect(files).toHaveLength(3);
    expect(files.find((f) => f.path === 'src/foo.ts')?.status).toBe('M');
    expect(files.find((f) => f.path === 'src/bar.ts')?.status).toBe('A');
    expect(files.find((f) => f.path === 'src/old.ts')?.status).toBe('D');
  });

  it('parses rename (R100) lines with oldPath', async () => {
    const runner = diffMock('R100\tsrc/old-name.ts\tsrc/new-name.ts\n', { 'src/new-name.ts': 300 });

    const files = await listChangedFiles('container1', false, runner);

    expect(files).toHaveLength(1);
    expect(files[0].status).toBe('R');
    expect(files[0].path).toBe('src/new-name.ts');
    expect(files[0].oldPath).toBe('src/old-name.ts');
  });

  it('sorts by mtime descending (newest first)', async () => {
    const runner = diffMock('M\tsrc/oldest.ts\nM\tsrc/newest.ts\nM\tsrc/middle.ts\n', {
      'src/middle.ts': 200,
      'src/newest.ts': 300,
      'src/oldest.ts': 100
    });

    const files = await listChangedFiles('container1', false, runner);

    expect(files[0].path).toBe('src/newest.ts');
    expect(files[1].path).toBe('src/middle.ts');
    expect(files[2].path).toBe('src/oldest.ts');
  });

  it('uses alphabetical path as tiebreaker when mtime is equal', async () => {
    const runner = diffMock('M\tsrc/beta.ts\nM\tsrc/alpha.ts\n', {
      'src/alpha.ts': 100,
      'src/beta.ts': 100
    });

    const files = await listChangedFiles('container1', false, runner);

    expect(files[0].path).toBe('src/alpha.ts');
    expect(files[1].path).toBe('src/beta.ts');
  });

  it('excludes noisy files when showAll=false', async () => {
    const runner = diffMock('M\tsrc/app.ts\nM\tbun.lock\nM\tdist/bundle.js\n', {
      'src/app.ts': 200
    });

    const files = await listChangedFiles('container1', false, runner);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe('src/app.ts');
  });

  it('includes noisy files with noisy=true when showAll=true', async () => {
    const runner = diffMock('M\tsrc/app.ts\nM\tbun.lock\n', { 'bun.lock': 100, 'src/app.ts': 200 });

    const files = await listChangedFiles('container1', true, runner);

    expect(files).toHaveLength(2);
    const noisyFile = files.find((f) => f.path === 'bun.lock');
    expect(noisyFile).toBeDefined();
    expect(noisyFile?.noisy).toBe(true);
    const normalFile = files.find((f) => f.path === 'src/app.ts');
    expect(normalFile?.noisy).toBe(false);
  });

  it('returns empty array when output is empty (no yolomode-base branch)', async () => {
    const runner = diffMock('');

    const files = await listChangedFiles('container1', false, runner);

    expect(files).toEqual([]);
  });

  it('returns empty array when no files changed', async () => {
    const runner = diffMock('\n');

    const files = await listChangedFiles('container1', false, runner);

    expect(files).toEqual([]);
  });

  it('sets noisy=false for non-noisy files', async () => {
    const runner = diffMock('M\tsrc/app.ts\nA\tREADME.md\n', {
      'README.md': 100,
      'src/app.ts': 200
    });

    const files = await listChangedFiles('container1', false, runner);

    for (const f of files) {
      expect(f.noisy).toBe(false);
    }
  });

  it('passes sessionId to docker exec calls', async () => {
    const capturedArgs: string[][] = [];
    const runner: CommandRunner = async (args: string[]) => {
      capturedArgs.push(args);
      return '';
    };

    await listChangedFiles('my-session-id', false, runner);

    expect(capturedArgs[0]).toContain('my-session-id');
  });

  it('handles partial rename codes (R095)', async () => {
    const runner = diffMock('R095\tsrc/old.ts\tsrc/new.ts\n', { 'src/new.ts': 100 });

    const files = await listChangedFiles('container1', false, runner);

    expect(files).toHaveLength(1);
    expect(files[0].status).toBe('R');
    expect(files[0].path).toBe('src/new.ts');
    expect(files[0].oldPath).toBe('src/old.ts');
  });
});
