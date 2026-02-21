import { describe, expect, it } from 'bun:test';
import { type CommandRunner, listSessions, type Session } from '../docker';

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
