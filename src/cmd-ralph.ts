import RALPH from '../ralph.ts.txt' with { type: 'text' };
import { die, ensureRunning, getFlags, getWorkDir, resolveSession } from './utils';

export { RALPH };

type RalphAgent = 'claude' | 'codex';

function isRalphAgent(value: string): value is RalphAgent {
  return value === 'claude' || value === 'codex';
}

export async function cmdRalph(args: string[]): Promise<void> {
  const endOfOpts = args.indexOf('--');
  const baseArgs = endOfOpts === -1 ? args : args.slice(0, endOfOpts);
  const agentArgs = endOfOpts === -1 ? [] : args.slice(endOfOpts + 1);

  const agent = baseArgs[1];
  if (!agent || !isRalphAgent(agent)) {
    die('usage: yolomode ralph <claude|codex> [name] [--max N] [prd-file...] [-- <agent args...>]');
  }

  let sessionArg: string | undefined;
  const prdFiles: string[] = [];
  for (let i = 2; i < baseArgs.length; i++) {
    const token = baseArgs[i];
    if (token === '--max') {
      if (i + 1 >= baseArgs.length) die('--max requires a value');
      i++;
      continue;
    }
    if (token.startsWith('--')) die(`unknown flag: ${token}`);
    if (token.endsWith('.json')) {
      prdFiles.push(token);
      continue;
    }
    if (sessionArg) {
      die(
        'usage: yolomode ralph <claude|codex> [name] [--max N] [prd-file...] [-- <agent args...>]'
      );
    }
    sessionArg = token;
  }

  const id = await resolveSession(sessionArg);

  const maxFlags = getFlags(baseArgs, '--max');
  const maxIter = parseInt(maxFlags.at(-1) ?? '10', 10);
  if (Number.isNaN(maxIter) || maxIter < 1) die('--max must be a positive number');

  await ensureRunning(id);
  const workDir = await getWorkDir(id);

  const ralphArgs = ['ralph', agent, '--max', String(maxIter), ...prdFiles];
  if (agentArgs.length > 0) ralphArgs.push('--', ...agentArgs);

  const proc = Bun.spawn(['docker', 'exec', '-w', workDir, id, ...ralphArgs], {
    stderr: 'inherit',
    stdin: 'inherit',
    stdout: 'inherit'
  });
  await proc.exited;
  process.exit(proc.exitCode ?? 1);
}
