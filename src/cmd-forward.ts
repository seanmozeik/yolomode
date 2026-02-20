import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { join } from 'node:path';
import { $ } from 'bun';
import pc from 'picocolors';
import { HOME } from './constants';
import { die, ensureRunning, getFlags, resolveSession } from './utils';

function parsePortSpec(value: string): { host?: number; container: number } {
  const v = value.trim();
  const parts = v.split(':');
  if (parts.length === 1) {
    const container = Number(parts[0]);
    if (!Number.isInteger(container) || container < 1 || container > 65535) {
      die(`invalid port "${value}" (expected 1-65535 or HOST:CONTAINER)`);
    }
    return { container };
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
      die(`invalid port "${value}" (expected 1-65535 or HOST:CONTAINER)`);
    }
    return { container, host };
  }
  die(`invalid port "${value}" (expected 1-65535 or HOST:CONTAINER)`);
}

async function isPortAvailable(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(preferred: number): Promise<number> {
  for (let p = preferred; p <= 65535; p++) {
    if (await isPortAvailable(p)) return p;
  }
  die(`no available localhost port found starting at ${preferred}`);
}

export async function cmdForward(args: string[]): Promise<void> {
  const positional = args.slice(1).filter((a) => !a.startsWith('--'));
  if (positional.length === 0) {
    die('usage: yolomode forward [name] <container-port|host:container> [--host-port <port>]');
  }
  if (positional.length > 2) {
    die('usage: yolomode forward [name] <container-port|host:container> [--host-port <port>]');
  }

  const nameArg = positional.length === 2 ? positional[0] : undefined;
  const portArg = positional.length === 2 ? positional[1] : positional[0];
  const parsed = parsePortSpec(portArg);

  const hostPortFlags = getFlags(args, '--host-port');
  const hostPortOverride = hostPortFlags.at(-1);
  let hostPortFromFlag: number | undefined;
  if (hostPortOverride) {
    const parsedHostPort = Number(hostPortOverride);
    if (!Number.isInteger(parsedHostPort) || parsedHostPort < 1 || parsedHostPort > 65535) {
      die(`invalid --host-port "${hostPortOverride}" (expected 1-65535)`);
    }
    hostPortFromFlag = parsedHostPort;
  }

  const requestedHostPort =
    hostPortFromFlag ?? (parsed.host !== undefined ? parsed.host : parsed.container);
  const hostPort = await findAvailablePort(requestedHostPort);
  const id = await resolveSession(nameArg);
  await ensureRunning(id);

  const socatExists = await $`command -v socat`.quiet().nothrow();
  if (socatExists.exitCode !== 0) {
    die('socat is required on host (install with: brew install socat)');
  }

  const containerIp = await $`docker inspect --format ${'{{.NetworkSettings.IPAddress}}'} ${id}`
    .quiet()
    .nothrow()
    .text()
    .then((s) => s.trim());
  if (!containerIp) die(`failed to resolve container IP for ${id}`);

  const cmd = `nohup socat TCP4-LISTEN:${hostPort},bind=127.0.0.1,reuseaddr,fork TCP4:${containerIp}:${parsed.container} >/dev/null 2>&1 & echo $!`;
  const pid = await $`sh -lc ${cmd}`
    .quiet()
    .text()
    .then((s) => s.trim());
  if (!pid || !/^\d+$/.test(pid)) {
    die('failed to start port forward');
  }

  const forwardsDir = join(HOME, '.yolomode', 'forwards');
  await mkdir(forwardsDir, { recursive: true });
  await writeFile(
    join(forwardsDir, `${id}-${hostPort}.json`),
    JSON.stringify(
      {
        containerId: id,
        containerIp,
        containerPort: parsed.container,
        hostPort,
        pid: Number(pid)
      },
      null,
      2
    )
  );

  const remapped = hostPort !== requestedHostPort;
  const suffix = remapped ? ` ${pc.dim(`(requested ${requestedHostPort} was in use)`)} ` : '';
  console.log(
    `${pc.green('✔')} Forwarding ${pc.cyan(`${id}:${parsed.container}`)} -> ${pc.cyan(`localhost:${hostPort}`)} via socat pid ${pc.dim(pid)}${suffix}`
  );
}
