import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import boxen from 'boxen';
import { $ } from 'bun';
import ora from 'ora';
import pc from 'picocolors';
import { writeBundledSkills } from './bundled-skills';
import { HOME, IMAGE, PERSISTENT_VOLUMES } from './constants';
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

function hasClaudeRtkHook(settings: Record<string, unknown>): boolean {
  const hooks = settings.hooks;
  if (!hooks || typeof hooks !== 'object') return false;
  const preToolUse = (hooks as Record<string, unknown>).PreToolUse;
  if (!Array.isArray(preToolUse)) return false;
  return preToolUse.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const record = entry as Record<string, unknown>;
    if (record.matcher !== 'Bash') return false;
    const entryHooks = record.hooks;
    if (!Array.isArray(entryHooks)) return false;
    return entryHooks.some((hook) => {
      if (!hook || typeof hook !== 'object') return false;
      const hookRecord = hook as Record<string, unknown>;
      return hookRecord.type === 'command' && hookRecord.command === 'rtk hook claude';
    });
  });
}

async function preprocessClaudeSettings(srcPath: string | null): Promise<string> {
  let settings: Record<string, unknown> = {};
  if (srcPath) {
    try {
      settings = JSON.parse(await readFile(srcPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      settings = {};
    }
  }

  if (!hasClaudeRtkHook(settings)) {
    const hooks =
      settings.hooks && typeof settings.hooks === 'object'
        ? (settings.hooks as Record<string, unknown>)
        : {};
    const preToolUse = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
    hooks.PreToolUse = [
      ...preToolUse,
      {
        hooks: [{ command: 'rtk hook claude', type: 'command' }],
        matcher: 'Bash'
      }
    ];
    settings.hooks = hooks;
  }

  const tmpDir = join(HOME, '.yolomode', 'tmp');
  await $`mkdir -p ${tmpDir}`.quiet();
  const tmpPath = join(tmpDir, 'claude-settings.json');
  await writeFile(tmpPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o644 });
  return tmpPath;
}

function rewriteLocalhostUrls(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replaceAll('://localhost', '://host.docker.internal')
      .replaceAll('://127.0.0.1', '://host.docker.internal')
      .replaceAll('://0.0.0.0', '://host.docker.internal');
  }
  if (Array.isArray(value)) {
    return value.map(rewriteLocalhostUrls);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, rewriteLocalhostUrls(entry)])
    );
  }
  return value;
}

async function preprocessPiAgentConfig(srcDir: string): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'yolomode-pi-'));
  await $`mkdir -p ${tmpDir}/agent`.quiet();

  // Copy auth/config files and local plugin dirs (npm packages are installed on-demand via piUpdate).
  for (const fname of [
    'settings.json',
    'models.json',
    'auth.json',
    'keybindings.json',
    'AGENTS.md',
    'CLAUDE.md',
    'RTK.md'
  ]) {
    const src = join(srcDir, fname);
    if (await Bun.file(src).exists()) {
      await $`cp ${src} ${join(tmpDir, 'agent', fname)}`.quiet().nothrow();
    }
  }

  for (const fname of ['settings.json', 'models.json', 'auth.json', 'keybindings.json']) {
    const fpath = join(tmpDir, 'agent', fname);
    try {
      const data = await readFile(fpath, 'utf-8');
      const parsed = JSON.parse(data);
      const fixed = rewriteLocalhostUrls(parsed);
      await writeFile(fpath, `${JSON.stringify(fixed, null, 2)}\n`, { mode: 0o600 });
    } catch {
      /* file may not exist or may not be JSON */
    }
  }

  // Copy local plugin dirs (small TS-only, no node_modules)
  for (const pluginDir of ['opencode']) {
    const src = join(srcDir, pluginDir);
    if (await dirExists(src)) {
      await $`cp -R ${src} ${join(tmpDir, 'agent', pluginDir)}`.quiet().nothrow();
    }
  }

  const hostRtkPath = join(HOME, '.codex', 'RTK.md');
  const rtkPath = join(tmpDir, 'agent', 'RTK.md');
  if (await Bun.file(hostRtkPath).exists()) {
    await $`cp ${hostRtkPath} ${rtkPath}`.quiet().nothrow();
  } else if (!(await Bun.file(rtkPath).exists())) {
    await writeFile(rtkPath, 'Always prefix shell commands with `rtk`.\n', { mode: 0o644 });
  }

  const agentsPath = join(tmpDir, 'agent', 'AGENTS.md');
  if (!(await Bun.file(agentsPath).exists())) {
    await writeFile(agentsPath, '@RTK.md\n', { mode: 0o644 });
  } else {
    const agents = await readFile(agentsPath, 'utf-8');
    if (!agents.includes('RTK.md')) {
      await writeFile(agentsPath, `${agents.trimEnd()}\n@RTK.md\n`, { mode: 0o644 });
    }
  }

  return tmpDir;
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
  const cargoTargetDir = `/home/yolo/.cache/cargo-target/${createHash('sha256').update(workDir).digest('hex').slice(0, 16)}`;
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
      await $`cp -r ${p}/. ${skillsTmpDir}/`.quiet().nothrow();
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
    await $`cp -r ${claudePlugins}/. ${pluginsTmpDir}/`.quiet().nothrow();
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
        const correctClaudeDir = join(HOME, '.claude'); // e.g. /home/alice/.claude
        const buggyClaudeDir = `${HOME.replace(/\/$/, '')}.claude`; // e.g. /home/alice.claude
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
  const claudeRtkMd = join(HOME, '.claude', 'RTK.md');
  if (await Bun.file(claudeRtkMd).exists()) {
    mounts.push('-v', `${claudeRtkMd}:/home/yolo/.claude/RTK.md:ro`);
  }

  // --- Yolomode user settings (~/.config/yolomode/settings.json) ---
  const yolomodeSettings = join(
    process.env.XDG_CONFIG_HOME || join(HOME, '.config'),
    'yolomode',
    'settings.json'
  );
  const processedClaudeSettings = await preprocessClaudeSettings(
    (await Bun.file(yolomodeSettings).exists()) ? yolomodeSettings : null
  );
  mounts.push('-v', `${processedClaudeSettings}:/host-claude/settings.json:ro`);

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
  const codexRtkMd = join(HOME, '.codex', 'RTK.md');
  if (await Bun.file(codexRtkMd).exists()) {
    mounts.push('-v', `${codexRtkMd}:/home/yolo/.codex/RTK.md:ro`);
  }
  const codexAgentsMd = join(HOME, '.codex', 'AGENTS.md');
  if (await Bun.file(codexAgentsMd).exists()) {
    const tmp = await mkdtemp(join(tmpdir(), 'yolomode-codex-agents-'));
    tmpdirs.push(tmp);
    const data = await readFile(codexAgentsMd, 'utf-8');
    const processed = data
      .replaceAll(join(HOME, '.codex'), '/home/yolo/.codex')
      .replaceAll(HOME, '/home/yolo');
    const tmpPath = join(tmp, 'AGENTS.md');
    await writeFile(tmpPath, processed, { mode: 0o644 });
    mounts.push('-v', `${tmpPath}:/home/yolo/.codex/AGENTS.md:ro`);
  }

  // --- Tripwire config ---
  const tripwireConfig = join(
    process.env.XDG_CONFIG_HOME || join(HOME, '.config'),
    'tripwire',
    'config.json'
  );
  if (await Bun.file(tripwireConfig).exists()) {
    mounts.push('-v', `${tripwireConfig}:/host-tripwire/config.json:ro`);
  }

  // --- Pi Agent config/auth --- (plugins are baked into the image)
  const piAgentDir = join(HOME, '.pi', 'agent');
  if (await dirExists(piAgentDir)) {
    const processedPiDir = await preprocessPiAgentConfig(piAgentDir);
    tmpdirs.push(processedPiDir);
    mounts.push('-v', `${processedPiDir}:/host-pi:ro`);
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
  await $`docker volume create ${PERSISTENT_VOLUMES.cargoRegistry}`.quiet();
  await $`docker volume create ${PERSISTENT_VOLUMES.cargoGit}`.quiet();
  await $`docker volume create ${PERSISTENT_VOLUMES.cargoTarget}`.quiet();
  await $`docker volume create ${PERSISTENT_VOLUMES.rustup}`.quiet();
  await $`docker volume create ${PERSISTENT_VOLUMES.sccache}`.quiet();
  await $`docker run --rm -v ${name}:${workDir} alpine sh -c ${`mkdir -p ${workDir} && chown 1000:1000 ${workDir}`}`.quiet();
  await $`docker run --rm -v ${PERSISTENT_VOLUMES.cargoRegistry}:/mnt alpine sh -c ${'mkdir -p /mnt && chown 1000:1000 /mnt'}`.quiet();
  await $`docker run --rm -v ${PERSISTENT_VOLUMES.cargoGit}:/mnt alpine sh -c ${'mkdir -p /mnt && chown 1000:1000 /mnt'}`.quiet();
  await $`docker run --rm -v ${PERSISTENT_VOLUMES.cargoTarget}:/mnt alpine sh -c ${`mkdir -p /mnt${cargoTargetDir} && chown -R 1000:1000 /mnt`}`.quiet();
  await $`docker run --rm -v ${PERSISTENT_VOLUMES.rustup}:/mnt alpine sh -c ${'mkdir -p /mnt && chown 1000:1000 /mnt'}`.quiet();
  await $`docker run --rm -v ${PERSISTENT_VOLUMES.sccache}:/mnt alpine sh -c ${'mkdir -p /mnt && chown 1000:1000 /mnt'}`.quiet();

  spinner.succeed(`Session ${pc.cyan(pc.bold(name))} ready`);
  console.log();

  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  const hostTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

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
    `${PERSISTENT_VOLUMES.cargoRegistry}:/home/yolo/.cargo/registry`,
    '-v',
    `${PERSISTENT_VOLUMES.cargoGit}:/home/yolo/.cargo/git`,
    '-v',
    `${PERSISTENT_VOLUMES.cargoTarget}:/home/yolo/.cache/cargo-target`,
    '-v',
    `${PERSISTENT_VOLUMES.rustup}:/home/yolo/.rustup`,
    '-v',
    `${PERSISTENT_VOLUMES.sccache}:/home/yolo/.cache/sccache`,
    '-v',
    `${process.cwd()}:/src:ro`,
    ...mounts,
    '--add-host',
    'host.docker.internal:host-gateway',
    '-e',
    'ANTHROPIC_API_KEY',
    '-e',
    'OPENAI_API_KEY',
    '-e',
    'OPENCODE_API_KEY',
    '-e',
    `PROJECT_DIR=${workDir}`,
    '-e',
    `CARGO_TARGET_DIR=${cargoTargetDir}`,
    '-e',
    'TERM',
    '-e',
    'COLORTERM',
    '-e',
    'TERM_PROGRAM',
    '-e',
    'TERM_PROGRAM_VERSION',
    '-e',
    `COLUMNS=${cols}`,
    '-e',
    `TZ=${hostTimeZone}`,
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
