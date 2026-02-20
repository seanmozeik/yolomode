import pc from 'picocolors';
import RALPH_SH from '../ralph.sh' with { type: 'text' };
import { die, ensureRunning, getFlags, getWorkDir, resolveSession, warn } from './utils';
export { RALPH_SH };

export async function cmdRalph(args: string[]): Promise<void> {
  const id = await resolveSession(args[1]);

  const maxIterFlags = getFlags(args, '--max-iterations');
  const maxIter = parseInt(maxIterFlags.at(-1) ?? '10', 10);
  if (Number.isNaN(maxIter) || maxIter < 1) die('--max-iterations must be a positive number');

  await ensureRunning(id);
  const workDir = await getWorkDir(id);

  const prompt =
    'Read prd.json in the current directory. Find the highest-priority story with status "pending". Set its status to "in_progress" and save prd.json. Then implement the story fully: write the code, run any available tests, typecheck, and linting. Commit your changes with a message referencing the story ID. Finally, update prd.json to set the story status to "complete" and commit that change too. If ALL stories already have status "complete", output exactly <promise>COMPLETE</promise> and do nothing else.';

  console.log(`${pc.cyan(pc.bold('ralph:'))} targeting ${pc.cyan(id)}, max ${maxIter} iterations`);

  for (let i = 1; i <= maxIter; i++) {
    console.log(`\n${pc.cyan(pc.bold(`ralph: iteration ${i}/${maxIter}`))}`);

    const proc = Bun.spawn(
      [
        'docker',
        'exec',
        '-w',
        workDir,
        id,
        'claude',
        '--dangerously-skip-permissions',
        '--print',
        prompt
      ],
      { stderr: 'inherit', stdout: 'pipe' }
    );

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
