import boxen from 'boxen';
import ora from 'ora';
import pc from 'picocolors';
import RALPH_SH from '../ralph.sh' with { type: 'text' };
import { die, ensureRunning, getFlags, getWorkDir, resolveSession, warn } from './utils';
export { RALPH_SH };

type RalphAgent = 'claude' | 'codex';

function isRalphAgent(value: string): value is RalphAgent {
  return value === 'claude' || value === 'codex';
}

interface PrdStory {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'complete';
  priority?: number;
}

interface Prd {
  stories: PrdStory[];
}

async function readPrd(containerId: string, workDir: string): Promise<Prd> {
  const proc = Bun.spawn(['docker', 'exec', '-w', workDir, containerId, 'cat', 'prd.json'], {
    stderr: 'pipe',
    stdout: 'pipe'
  });
  await proc.exited;
  if (proc.exitCode !== 0) {
    die('no prd.json found in work dir');
  }
  const text = await new Response(proc.stdout).text();
  let prd: Prd;
  try {
    prd = JSON.parse(text) as Prd;
  } catch {
    die('prd.json is not valid JSON');
  }
  if (!Array.isArray(prd!.stories)) {
    die('prd.json is missing a "stories" array');
  }
  return prd!;
}

function activeStory(prd: Prd): PrdStory | undefined {
  return (
    prd.stories.find((s) => s.status === 'in_progress') ??
    prd.stories
      .filter((s) => s.status === 'pending')
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))[0]
  );
}

function summaryPanel(prd: Prd, success: boolean): string {
  const lines = prd.stories.map((s) => {
    const icon =
      s.status === 'complete'
        ? pc.green('✔')
        : s.status === 'in_progress'
          ? pc.yellow('…')
          : pc.red('✗');
    return `${icon}  ${pc.dim(s.id.padEnd(12))} ${s.title}`;
  });
  return boxen(lines.join('\n'), {
    borderColor: success ? 'green' : 'yellow',
    borderStyle: 'round',
    padding: { bottom: 0, left: 2, right: 2, top: 0 },
    title: success ? pc.green(pc.bold('complete')) : pc.yellow(pc.bold('incomplete')),
    titleAlignment: 'left'
  });
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
    const prd = await readPrd(id, workDir);
    const story = activeStory(prd);
    const storyLine = story
      ? `${pc.cyan(pc.bold(story.id))}: ${story.title}`
      : pc.dim('(picking next pending story)');
    console.log(
      boxen(`${storyLine}\n${pc.dim(`iteration ${i}/${maxIter} · ${agent}`)}`, {
        borderColor: 'cyan',
        borderStyle: 'round',
        padding: { bottom: 0, left: 2, right: 2, top: 0 },
        title: pc.cyan(pc.bold('ralph')),
        titleAlignment: 'left'
      })
    );

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
      const finalPrd = await readPrd(id, workDir);
      console.log('\n' + summaryPanel(finalPrd, true));
      process.exit(0);
    }

    if (i < maxIter) {
      const sleepSpinner = ora({ text: pc.dim('next story in 2s…'), color: 'cyan' }).start();
      await Bun.sleep(2000);
      sleepSpinner.stop();
    }
  }

  const finalPrd = await readPrd(id, workDir);
  console.log('\n' + summaryPanel(finalPrd, false));
  warn(`max iterations (${maxIter}) reached`);
  process.exit(1);
}
