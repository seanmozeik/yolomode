import pc from 'picocolors';
import RALPH_SH from '../ralph.sh' with { type: 'text' };
import { die, ensureRunning, getFlags, getWorkDir, resolveSession, warn } from './utils';
export { RALPH_SH };

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
    die('usage: yolomode ralph <claude|codex> [name] [--max-iterations N] [-- <agent args...>]');
  }

  let sessionArg: string | undefined;
  for (let i = 2; i < baseArgs.length; i++) {
    const token = baseArgs[i];
    if (token === '--max-iterations') {
      if (i + 1 >= baseArgs.length) die('--max-iterations requires a value');
      i++;
      continue;
    }
    if (token.startsWith('--')) die(`unknown flag: ${token}`);
    if (sessionArg) {
      die('usage: yolomode ralph <claude|codex> [name] [--max-iterations N] [-- <agent args...>]');
    }
    sessionArg = token;
  }

  const id = await resolveSession(sessionArg);

  const maxIterFlags = getFlags(baseArgs, '--max-iterations');
  const maxIter = parseInt(maxIterFlags.at(-1) ?? '10', 10);
  if (Number.isNaN(maxIter) || maxIter < 1) die('--max-iterations must be a positive number');

  await ensureRunning(id);
  const workDir = await getWorkDir(id);

  const prompt =
    'Read prd.json in the current directory. Find the highest-priority story with status "pending". Set its status to "in_progress" and save prd.json. Then implement the story fully: write the code, run any available tests, typecheck, and linting. Commit your changes with a message referencing the story ID. Finally, update prd.json to set the story status to "complete" and commit that change too. If ALL stories already have status "complete", output exactly <promise>COMPLETE</promise> and do nothing else.';

  console.log(
    `${pc.cyan(pc.bold('ralph:'))} targeting ${pc.cyan(id)} with ${pc.cyan(agent)}, max ${maxIter} iterations`
  );

  for (let i = 1; i <= maxIter; i++) {
    console.log(`\n${pc.cyan(pc.bold(`ralph: iteration ${i}/${maxIter}`))}`);

    const agentCmd =
      agent === 'claude'
        ? ['claude', '--dangerously-skip-permissions', '--print', ...agentArgs, prompt]
        : ['codex', 'exec', '--dangerously-bypass-approvals-and-sandbox', ...agentArgs, prompt];

    const proc = Bun.spawn(['docker', 'exec', '-w', workDir, id, ...agentCmd], {
      stderr: 'inherit',
      stdout: 'pipe'
    });

    let output = '';
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      output += chunk;
      process.stdout.write(chunk);
    }
    await proc.exited;

    if (output.includes('<promise>COMPLETE</promise>')) {
      console.log(pc.green(pc.bold('\nralph: all stories complete!')));
      process.exit(0);
    }

    if (i < maxIter) {
      await Bun.sleep(2000);
    }
  }

  warn(`max iterations (${maxIter}) reached`);
  process.exit(1);
}
