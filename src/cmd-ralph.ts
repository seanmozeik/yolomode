import { $ } from "bun";
import pc from "picocolors";
import { IMAGE } from "./constants";
import { die, warn, getFlags, ensureRunning, getWorkDir } from "./utils";

import RALPH_SH from "../ralph.sh" with { type: "text" };
export { RALPH_SH };

export async function cmdRalph(args: string[]) {
	let id = args[1];
	if (!id || id.startsWith("--")) {
		// If exactly one container is running, use it (same pattern as attach)
		const running =
			await $`docker ps --filter ancestor=${IMAGE} --format ${"{{.Names}}"}`
				.quiet()
				.nothrow()
				.text()
				.then((s) => s.trim().split("\n").filter(Boolean));
		if (running.length === 1) {
			id = running[0];
		} else if (running.length === 0) {
			die("no running sessions — start one with: yolomode run");
		} else {
			die(
				`${running.length} sessions running — specify a name:\n${running.map((n) => `  ${n}`).join("\n")}`,
			);
		}
	}

	const maxIterFlags = getFlags(args, "--max-iterations");
	const maxIter = parseInt(maxIterFlags[maxIterFlags.length - 1] ?? "10", 10);
	if (isNaN(maxIter) || maxIter < 1)
		die("--max-iterations must be a positive number");

	await ensureRunning(id);
	const workDir = await getWorkDir(id);

	const prompt =
		'Read prd.json in the current directory. Find the highest-priority story with status "pending". Set its status to "in_progress" and save prd.json. Then implement the story fully: write the code, run any available tests, typecheck, and linting. Commit your changes with a message referencing the story ID. Finally, update prd.json to set the story status to "complete" and commit that change too. If ALL stories already have status "complete", output exactly <promise>COMPLETE</promise> and do nothing else.';

	console.log(
		`${pc.cyan(pc.bold("ralph:"))} targeting ${pc.cyan(id)}, max ${maxIter} iterations`,
	);

	for (let i = 1; i <= maxIter; i++) {
		console.log(`\n${pc.cyan(pc.bold(`ralph: iteration ${i}/${maxIter}`))}`);

		const proc = Bun.spawn(
			[
				"docker",
				"exec",
				"-w",
				workDir,
				id,
				"claude",
				"--dangerously-skip-permissions",
				"--print",
				prompt,
			],
			{ stdout: "pipe", stderr: "inherit" },
		);

		let output = "";
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

		if (output.includes("<promise>COMPLETE</promise>")) {
			console.log(pc.green(pc.bold("\nralph: all stories complete!")));
			process.exit(0);
		}

		if (i < maxIter) {
			// Brief pause between iterations
			await new Promise((r) => setTimeout(r, 2000));
		}
	}

	warn(`max iterations (${maxIter}) reached`);
	process.exit(1);
}
