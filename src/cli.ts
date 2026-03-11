#!/usr/bin/env bun
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import boxen from 'boxen';
import { $ } from 'bun';
import { Table } from 'console-table-printer';
import gradient from 'gradient-string';
import ora from 'ora';
import pc from 'picocolors';
import STARSHIP from '../config/starship.toml' with { type: 'text' };
import GHOSTTY_TERMINFO from '../config/xterm-ghostty.terminfo' with { type: 'text' };
import DOCKERFILE from '../Dockerfile' with { type: 'text' };
import ENTRYPOINT from '../entrypoint.sh' with { type: 'text' };
import { cmdApply } from './cmd-apply';
import { cmdForward } from './cmd-forward';
import { cmdRalph, RALPH } from './cmd-ralph';
import { cmdRun } from './cmd-run';
import { cmdCompletions } from './completions';
import { BANNER, FORWARDS_DIR, HOME, IMAGE } from './constants';
import {
  copyImports,
  die,
  ensureRunning,
  execShell,
  getFlags,
  getWorkDir,
  hasFlag,
  parseLabel,
  resolveImports,
  resolveSession
} from './utils';

async function cleanupTmpdirs(id: string): Promise<void> {
  const label =
    await $`docker inspect --format ${'{{index .Config.Labels "yolomode.tmpdirs"}}'} ${id}`
      .quiet()
      .nothrow()
      .text()
      .then((s) => s.trim());
  for (const dir of label.split('|').filter(Boolean)) {
    await rm(dir, { force: true, recursive: true });
  }
}

function normalizeContainerRef(value: string): string {
  return value.replace(/^\//, '').trim();
}

function looksLikeContainerId(value: string): boolean {
  return /^[a-f0-9]{12,64}$/i.test(value);
}

function matchesContainerRef(containerRef: string, targets: Set<string>): boolean {
  if (targets.has(containerRef)) return true;
  if (!looksLikeContainerId(containerRef)) return false;
  for (const target of targets) {
    if (!looksLikeContainerId(target)) continue;
    if (containerRef.startsWith(target) || target.startsWith(containerRef)) return true;
  }
  return false;
}

async function isSocatPid(pid: number): Promise<boolean> {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  const proc = await $`ps -p ${pid} -o comm=`.quiet().nothrow().text();
  const cmd = proc.trim().split('/').pop() ?? '';
  return cmd === 'socat';
}

async function cleanupForwards(containerRefs: string[]): Promise<void> {
  const targets = new Set(containerRefs.map(normalizeContainerRef).filter(Boolean));
  if (targets.size === 0) return;

  let files: string[];
  try {
    files = await readdir(FORWARDS_DIR);
  } catch {
    return;
  }

  const killedPids = new Set<number>();
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const path = join(FORWARDS_DIR, file);
    try {
      const raw = await readFile(path, 'utf8');
      const data = JSON.parse(raw) as { containerId?: string; pid?: number };
      const containerId = normalizeContainerRef(String(data.containerId ?? ''));
      if (!containerId || !matchesContainerRef(containerId, targets)) continue;

      const pid = Number(data.pid);
      if (!killedPids.has(pid) && (await isSocatPid(pid))) {
        await $`kill ${pid}`.quiet().nothrow();
        killedPids.add(pid);
      }
      await rm(path, { force: true });
    } catch {
      // Ignore malformed or stale forward records.
    }
  }
}

const args = process.argv.slice(2);
const command = args[0];

// Hidden flag for shell completion callbacks
if (hasFlag(args, '--complete')) {
  const idx = args.indexOf('--complete');
  const what = args[idx + 1];
  if (what === 'sessions') {
    const names = await $`docker ps -a --filter ancestor=${IMAGE} --format ${'{{.Names}}'}`
      .quiet()
      .nothrow()
      .text()
      .then((s) => s.trim());
    if (names) process.stdout.write(`${names}\n`);
  }
  process.exit(0);
}

try {
  switch (command) {
    case 'build': {
      const verbose = hasFlag(args, '--verbose', '-v');
      const ctx = await mkdtemp(join(tmpdir(), 'yolomode-build-'));
      try {
        await writeFile(join(ctx, 'Dockerfile'), DOCKERFILE);
        await writeFile(join(ctx, 'entrypoint.sh'), ENTRYPOINT, {
          mode: 0o755
        });
        await writeFile(join(ctx, 'xterm-ghostty.terminfo'), GHOSTTY_TERMINFO);
        await writeFile(join(ctx, 'ralph.ts'), RALPH, {
          mode: 0o755
        });
        await writeFile(join(ctx, 'starship.toml'), STARSHIP);
        const buildArgs = ['build', '-t', IMAGE];
        if (hasFlag(args, '--no-cache')) buildArgs.push('--no-cache');
        // Pass host GH token to avoid API rate limiting during binstall/mise downloads
        let ghToken = process.env.GITHUB_TOKEN ?? '';
        if (!ghToken) {
          const r = await $`gh auth token`.quiet().nothrow().text();
          ghToken = r.trim();
        }
        if (ghToken) {
          const secretFile = join(ctx, '.gh-token');
          await writeFile(secretFile, ghToken, { mode: 0o600 });
          buildArgs.push('--secret', `id=gh_token,src=${secretFile}`);
        }
        buildArgs.push(ctx);
        if (verbose) {
          // Inherit the parent TTY so docker emits ANSI colors and streams output live
          const proc = Bun.spawn(['docker', ...buildArgs], {
            stderr: 'inherit',
            stdin: 'inherit',
            stdout: 'inherit'
          });
          const code = await proc.exited;
          if (code !== 0) process.exit(code);
          console.log(`\n${pc.green('✔')} Image built`);
        } else {
          const spinner = ora('Building image...').start();
          const result = await $`docker ${buildArgs}`.quiet().nothrow();
          if (result.exitCode !== 0) {
            spinner.fail('Build failed');
            const stderr = result.stderr.toString().trim();
            if (stderr) console.error(pc.dim(stderr));
            process.exit(1);
          }
          spinner.succeed('Image built');
        }
      } finally {
        await rm(ctx, { force: true, recursive: true });
      }
      break;
    }

    case 'run': {
      await cmdRun(args);
      break;
    }

    case 'forward': {
      await cmdForward(args);
      break;
    }

    case 'a':
    case 'attach': {
      const id = await resolveSession(args[1]);
      const importPaths = getFlags(args, '--import');
      const imports = await resolveImports(importPaths);
      await ensureRunning(id);
      await copyImports(id, imports);
      const workDir = await getWorkDir(id);
      await execShell(id, workDir);
      break;
    }

    case 'ls': {
      const raw = await $`docker ps -a --filter ancestor=${IMAGE} --format ${'{{json .}}'}`
        .quiet()
        .nothrow()
        .text();
      const lines = raw.trim().split('\n').filter(Boolean);
      if (lines.length === 0) {
        console.log(pc.dim('No sessions found.'));
        break;
      }
      const table = new Table({
        columns: [
          { alignment: 'left', name: 'Name' },
          { alignment: 'left', name: 'Project' },
          { alignment: 'left', name: 'Status' },
          { alignment: 'left', name: 'Created' }
        ],
        style: {
          headerBottom: {
            left: '├',
            mid: '┼',
            other: '─',
            right: '┤'
          },
          headerTop: { left: '┌', mid: '┬', other: '─', right: '┐' },
          tableBottom: {
            left: '└',
            mid: '┴',
            other: '─',
            right: '┘'
          },
          vertical: '│'
        }
      });
      for (const line of lines) {
        const c = JSON.parse(line);
        const isRunning = c.State === 'running';
        const src = parseLabel(c.Labels, 'yolomode.src');
        table.addRow(
          {
            Created: c.CreatedAt,
            Name: c.Names,
            Project: src ? basename(src) : '',
            Status: c.Status
          },
          { color: isRunning ? 'green' : 'white' }
        );
      }
      table.printTable();
      break;
    }

    case 'diff': {
      const id = await resolveSession(args[1], { all: true });
      await ensureRunning(id);
      const workDir = await getWorkDir(id);
      await $`docker exec ${id} git -C ${workDir} add -A`.quiet();
      const patch =
        await $`docker exec ${id} git -C ${workDir} diff --cached --full-index yolomode-base`
          .quiet()
          .text();
      if (!patch.trim()) {
        console.log(pc.dim('No changes.'));
      } else {
        process.stdout.write(patch);
      }
      break;
    }

    case 'apply': {
      await cmdApply(args);
      break;
    }

    case 'sync': {
      const id = args[1];
      if (!id) die('usage: yolomode sync <name>');
      const workDir = await getWorkDir(id);
      const dest = join(HOME, '.yolomode', id);
      await $`mkdir -p ${dest}`;
      await $`docker cp ${id}:${workDir}/. ${dest}/`;
      console.log(`${pc.green('✔')} Extracted to ${pc.cyan(`~/.yolomode/${id}/`)}`);
      break;
    }

    case 'rm': {
      if (hasFlag(args, '--all', '-a')) {
        const spinner = ora('Removing all sessions...').start();
        try {
          const runningIds = await $`docker ps --filter ancestor=${IMAGE} -q`
            .quiet()
            .text()
            .then((s) => s.trim());
          if (runningIds) {
            for (const id of runningIds.split('\n')) {
              await $`docker stop ${id}`.quiet().nothrow();
            }
          }
          const ids = await $`docker ps -a --filter ancestor=${IMAGE} -q`
            .quiet()
            .text()
            .then((s) => s.trim());
          const names = await $`docker ps -a --filter ancestor=${IMAGE} --format ${'{{.Names}}'}`
            .quiet()
            .text()
            .then((s) => s.trim());
          if (ids) {
            const idList = ids.split('\n').filter(Boolean);
            const nameList = names.split('\n').filter(Boolean);
            await cleanupForwards([...idList, ...nameList]);
            for (const id of idList) {
              await cleanupTmpdirs(id);
              await $`docker rm -f ${id}`.quiet().nothrow();
            }
            for (const n of nameList) {
              await $`docker volume rm ${n}`.nothrow().quiet();
            }
            spinner.succeed('Cleaned up all sessions');
          } else {
            spinner.stop();
            console.log(pc.dim('No sessions to clean.'));
          }
        } catch (e) {
          spinner.fail('Failed to clean up sessions');
          throw e;
        }
      } else {
        const id = await resolveSession(args[1], { all: true });
        const inspectResult = await $`docker inspect ${id}`.quiet().nothrow();
        if (inspectResult.exitCode !== 0) die(`no such container: ${id}`);
        const spinner = ora(`Removing ${id}...`).start();
        try {
          const inspectRefs = await $`docker inspect --format ${'{{.Id}}|{{.Name}}'} ${id}`
            .quiet()
            .nothrow()
            .text()
            .then((s) => s.trim());
          const refs = [id, ...inspectRefs.split('|').map(normalizeContainerRef)];
          await cleanupForwards(refs);
          await cleanupTmpdirs(id);
          await $`docker stop ${id}`.quiet().nothrow();
          await $`docker rm ${id}`.quiet().nothrow();
          await $`docker volume rm ${id}`.nothrow().quiet();
          spinner.succeed(`Removed ${pc.cyan(id)}`);
        } catch (e) {
          spinner.fail(`Failed to remove ${id}`);
          throw e;
        }
      }
      break;
    }

    case 'completions': {
      await cmdCompletions(args);
      break;
    }

    case 'ralph': {
      await cmdRalph(args);
      break;
    }

    default: {
      console.log(
        boxen(
          gradient(['#ca9ee6', '#f4b8e4', '#babbf1'])(BANNER) +
            '\n\n' +
            pc.dim('isolated dev sessions'),
          {
            borderColor: 'cyan',
            borderStyle: 'round',
            padding: { bottom: 1, left: 2, right: 2, top: 1 },
            textAlignment: 'center'
          }
        )
      );
      console.log();
      const cmds = [
        ['build', 'Build the Docker image  (--no-cache, -v/--verbose for live output)'],
        [
          'run',
          'Start a new isolated session  (--import <path>, --port <container|host:container>)'
        ],
        [
          'forward <port> [name]',
          'Forward from running session to localhost  (<container|host:container>)'
        ],
        ['attach <name>', 'Open a new shell in a session (alias: a)  (--import <path>)'],
        ['ls', 'List all sessions'],
        ['diff <name>', 'Show changes from a session as a patch'],
        ['apply <name>', 'Apply session changes to a new branch'],
        ['sync <name>', 'Extract full work dir from a session'],
        ['rm <name>', 'Remove a session (-a/--all for all stopped)'],
        ['completions <sh>', 'Print shell completions (bash|zsh|fish|nu)'],
        ['ralph <claude|codex> [name]', 'Run ralph autonomous loop (--max N)']
      ];
      for (const [cmd, desc] of cmds) {
        console.log(`  ${pc.cyan(pc.bold(cmd.padEnd(24)))}${pc.dim(desc)}`);
      }
      console.log();
      if (command && command !== '--help' && command !== '-h' && command !== 'help') {
        die(`unknown command: ${command}`);
      }
      break;
    }
  }
} catch (err: unknown) {
  const shellErr = err as { exitCode?: number; stderr?: { toString(): string } };
  if (shellErr?.exitCode !== undefined) {
    const stderr = shellErr.stderr?.toString().trim();
    die(stderr || `command failed (exit ${shellErr.exitCode})`);
  }
  throw err;
}
