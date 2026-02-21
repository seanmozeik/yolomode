import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import boxen from 'boxen';
import { $ } from 'bun';
import ora from 'ora';
import pc from 'picocolors';
import { writeBundledSkills } from './bundled-skills';
import { HOME, IMAGE } from './constants';
import {
  copyImports,
  die,
  dirExists,
  execShell,
  generateUniqueName,
  getFlags,
  resolveImports,
  run,
  toWorkDir,
  warn
} from './utils';

// ── Private helpers ─────────────────────────────────────────────

async function getClaudeCredentials(): Promise<string> {
  return $`security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null || true`
    .quiet()
    .text()
    .then((s) => s.trim());
}

async function preprocessClaudeConfig(srcPath: string): Promise<string> {
  try {
    const data = await readFile(srcPath, 'utf-8');
    const config = JSON.parse(data);
    delete config.installMethod;
    // Replace any host home dir paths (e.g. plugin marketplace cache) with the container home
    const serialized = JSON.stringify(config, null, 2).replaceAll(HOME, '/home/yolo');
    const tmpDir = join(HOME, '.yolomode', 'tmp');
    await $`mkdir -p ${tmpDir}`.quiet();
    const tmpPath = join(tmpDir, 'claude-config.json');
    await writeFile(tmpPath, serialized, { mode: 0o644 });
    return tmpPath;
  } catch {
    return '';
  }
}

async function checkDockerMemory(): Promise<void> {
  try {
    const mem = await $`docker info --format ${'{{.MemTotal}}'}`
      .quiet()
      .text()
      .then((s) => s.trim());
    const memBytes = parseInt(mem, 10);
    if (!Number.isNaN(memBytes)) {
      const memGB = memBytes / (1024 * 1024 * 1024);
      if (memGB < 6) {
        warn(`Docker has only ${memGB.toFixed(1)}GB RAM. Parallel agents will likely OOM.`);
        warn('Increase Docker/Colima memory to 8GB+ for best results.');
      }
    }
  } catch {
    /* ignore */
  }
}

function parsePortPublishArg(value: string): { host: number; container: number } {
  const v = value.trim();
  const parts = v.split(':');
  if (parts.length === 1) {
    const port = Number(parts[0]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      die(`invalid --port value "${value}" (expected 1-65535 or HOST:CONTAINER)`);
    }
    return { container: port, host: port };
  }
  if (parts.length === 2) {
    const host = Number(parts[0]);
    const container = Number(parts[1]);
    if (
      !Number.isInteger(host) ||
      host < 1 ||
      host > 65535 ||
      !Number.isInteger(container) ||
      container < 1 ||
      container > 65535
    ) {
      die(`invalid --port value "${value}" (expected 1-65535 or HOST:CONTAINER)`);
    }
    return { container, host };
  }
  die(`invalid --port value "${value}" (expected 1-65535 or HOST:CONTAINER)`);
}

// ── Command handler ─────────────────────────────────────────────

export async function cmdRun(args: string[]): Promise<void> {
  const name = await generateUniqueName();
  const workDir = toWorkDir(process.cwd());
  const mounts: string[] = [];
  const tmpdirs: string[] = [];

  const importPaths = getFlags(args, '--import');
  const imports = await resolveImports(importPaths);

  const memoryFlags = getFlags(args, '--memory');
  const memLimit = memoryFlags.at(-1) ?? '16g';
  const portMappings = getFlags(args, '--port').map(parsePortPublishArg);

  await checkDockerMemory();
  const spinner = ora('Preparing session...').start();

  // --- Claude auth: keychain creds + preprocessed config ---
  const creds = await getClaudeCredentials();
  if (creds) {
    const tmp = await mkdtemp(join(tmpdir(), 'yolomode-'));
    tmpdirs.push(tmp);
    const credsPath = join(tmp, 'credentials.json');
    await writeFile(credsPath, creds, { mode: 0o600 });
    mounts.push('-v', `${credsPath}:/host-claude/.credentials.json:ro`);
  }

  const claudeJson = join(HOME, '.claude.json');
  if (await Bun.file(claudeJson).exists()) {
    const processed = await preprocessClaudeConfig(claudeJson);
    if (processed) {
      mounts.push('-v', `${processed}:/host-claude/.claude.json:ro`);
    }
  }

  // --- Skills: merged bundled + host, mounted for both Claude and Codex ---
  // Build a merged skills temp dir so we don't nest a file mount inside a
  // read-only directory mount (which causes "read-only file system" from runc).
  const skillsTmpDir = await mkdtemp(join(tmpdir(), 'yolomode-skills-'));
  tmpdirs.push(skillsTmpDir);
  await writeBundledSkills(skillsTmpDir);
  // Check all host skill locations in priority order (later wins over earlier)
  const hostSkillPaths = [
    join(HOME, '.claude', 'skills'), // ~/.claude/skills/
    join(HOME, '.agents', 'skills') // ~/.agents/skills/
  ];
  for (const p of hostSkillPaths) {
    if (await dirExists(p)) {
      await $`cp -r ${p}/. ${skillsTmpDir}/`.quiet();
    }
  }
  // Mount for Claude (~/.claude/skills/) and Codex (~/.agents/skills/)
  mounts.push('-v', `${skillsTmpDir}:/home/yolo/.claude/skills:ro`);
  mounts.push('-v', `${skillsTmpDir}:/home/yolo/.agents/skills:ro`);

  const claudePlugins = join(HOME, '.claude', 'plugins');
  if (await dirExists(claudePlugins)) {
    // Copy into a writable tmpdir — the plugin system writes back to
    // marketplaces/ to cache its GitHub index, so a :ro mount breaks it.
    const pluginsTmpDir = await mkdtemp(join(tmpdir(), 'yolomode-plugins-'));
    tmpdirs.push(pluginsTmpDir);
    await $`cp -r ${claudePlugins}/. ${pluginsTmpDir}/`.quiet();
    // Rewrite host home paths in plugin JSON files (installLocation /
    // installPath fields are hardcoded to the host's HOME).
    for (const fname of ['known_marketplaces.json', 'installed_plugins.json']) {
      const fpath = join(pluginsTmpDir, fname);
      try {
        const data = await readFile(fpath, 'utf-8');
        // Replace both the correct form (HOME + "/.claude") and the buggy form
        // (HOME + ".claude", missing the separator) that Claude Code sometimes writes.
        // Using join(HOME, ".claude") normalises any trailing slash in HOME so we
        // never accidentally eat the "/" that separates the home dir from ".claude".
        const correctClaudeDir = join(HOME, '.claude'); // e.g. /Users/sean/.claude
        const buggyClaudeDir = `${HOME.replace(/\/$/, '')}.claude`; // e.g. /Users/sean.claude
        const fixed = data
          .replaceAll(correctClaudeDir, '/home/yolo/.claude')
          .replaceAll(buggyClaudeDir, '/home/yolo/.claude');
        await writeFile(fpath, fixed);
      } catch {
        /* file may not exist */
      }
    }
    mounts.push('-v', `${pluginsTmpDir}:/home/yolo/.claude/plugins`);
  }

  const claudeRootMd = join(HOME, '.claude', 'CLAUDE.md');
  if (await Bun.file(claudeRootMd).exists()) {
    mounts.push('-v', `${claudeRootMd}:/home/yolo/.claude/CLAUDE.md:ro`);
  }

  // --- Yolomode user settings (~/.config/yolomode/settings.json) ---
  const yolomodeSettings = join(
    process.env.XDG_CONFIG_HOME || join(HOME, '.config'),
    'yolomode',
    'settings.json'
  );
  if (await Bun.file(yolomodeSettings).exists()) {
    mounts.push('-v', `${yolomodeSettings}:/host-claude/settings.json:ro`);
  }

  // --- Codex auth ---
  const codexAuth = join(HOME, '.codex', 'auth.json');
  if (await Bun.file(codexAuth).exists()) {
    mounts.push('-v', `${codexAuth}:/host-codex/auth.json:ro`);
  }
  const yolomodeCodexConfig = join(
    process.env.XDG_CONFIG_HOME || join(HOME, '.config'),
    'yolomode',
    'config.toml'
  );
  if (await Bun.file(yolomodeCodexConfig).exists()) {
    mounts.push('-v', `${yolomodeCodexConfig}:/host-codex/config.toml:ro`);
  }

  // --- Host git identity ---
  const gitName = await $`git config --global user.name`
    .quiet()
    .nothrow()
    .text()
    .then((s) => s.trim());
  const gitEmail = await $`git config --global user.email`
    .quiet()
    .nothrow()
    .text()
    .then((s) => s.trim());

  // Named volume for the work dir — survives container kills and removes
  await $`docker volume create ${name}`.quiet();
  await $`docker run --rm -v ${name}:${workDir} alpine sh -c ${`mkdir -p ${workDir} && chown 1000:1000 ${workDir}`}`.quiet();

  spinner.succeed(`Session ${pc.cyan(pc.bold(name))} ready`);
  console.log();

  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;

  // Start detached so we can copy imports before handing over the shell
  const dockerArgs = [
    'run',
    '-dit',
    '--name',
    name,
    '--label',
    `yolomode.src=${process.cwd()}`,
    '--label',
    `yolomode.workdir=${workDir}`,
    '--label',
    `yolomode.tmpdirs=${tmpdirs.join('|')}`,
    '--hostname',
    name,
    '-v',
    `${name}:${workDir}`,
    '-v',
    `${process.cwd()}:/src:ro`,
    ...mounts,
    '-e',
    'ANTHROPIC_API_KEY',
    '-e',
    'OPENAI_API_KEY',
    '-e',
    `PROJECT_DIR=${workDir}`,
    '-e',
    'TERM',
    '-e',
    'COLORTERM',
    '-e',
    `COLUMNS=${cols}`,
    '-e',
    `LINES=${rows}`,
    ...(gitName ? ['-e', `GIT_AUTHOR_NAME=${gitName}`, '-e', `GIT_COMMITTER_NAME=${gitName}`] : []),
    ...(gitEmail
      ? ['-e', `GIT_AUTHOR_EMAIL=${gitEmail}`, '-e', `GIT_COMMITTER_EMAIL=${gitEmail}`]
      : []),
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--shm-size',
    '1g',
    '--tmpfs',
    '/tmp:nosuid,exec,size=2g',
    ...portMappings.flatMap(({ host, container }) => ['-p', `127.0.0.1:${host}:${container}`]),
    '--memory',
    memLimit,
    IMAGE
  ];

  await run($`docker ${dockerArgs}`);
  await copyImports(name, imports);
  await execShell(name, workDir);

  console.log();
  const nextStepLines = [
    `${pc.cyan(pc.bold('attach'))}   yolomode attach ${name}`,
    `${pc.cyan(pc.bold('diff'))}     yolomode diff ${name}`,
    `${pc.cyan(pc.bold('apply'))}    yolomode apply ${name}`,
    `${pc.cyan(pc.bold('rm'))}       yolomode rm ${name}`
  ];
  if (imports.length > 0) {
    const list = imports.map((i) => i.base).join(', ');
    nextStepLines.push(`${pc.cyan(pc.bold('imports'))}  /tmp/imports/  ${pc.dim(`(${list})`)}`);
  }
  if (portMappings.length > 0) {
    const list = portMappings.map(({ host, container }) => `${host}:${container}`).join(', ');
    nextStepLines.push(`${pc.cyan(pc.bold('ports'))}    localhost  ${pc.dim(`(${list})`)}`);
  }
  console.log(
    boxen(nextStepLines.join('\n'), {
      borderColor: 'cyan',
      borderStyle: 'round',
      padding: { bottom: 1, left: 2, right: 2, top: 1 },
      title: name,
      titleAlignment: 'left'
    })
  );
}
