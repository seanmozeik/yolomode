#!/usr/bin/env bun
import { $ } from "bun";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, basename } from "path";
import DOCKERFILE from "../Dockerfile" with { type: "text" };
import ENTRYPOINT from "../entrypoint.sh" with { type: "text" };
import pc from "picocolors";
import boxen from "boxen";
import { Table } from "console-table-printer";
import ora from "ora";

import { IMAGE, BANNER } from "./constants";
import {
	die,
	hasFlag,
	getFlags,
	parseLabel,
	ensureRunning,
	run,
	resolveImports,
	copyImports,
} from "./utils";
import { cmdRun } from "./cmd-run";
import { cmdApply } from "./cmd-apply";
import { cmdCompletions } from "./completions";
import { cmdRalph, RALPH_SH } from "./cmd-ralph";

const args = process.argv.slice(2);
const command = args[0];

// Hidden flag for shell completion callbacks
if (hasFlag(args, "--complete")) {
	const idx = args.indexOf("--complete");
	const what = args[idx + 1];
	if (what === "sessions") {
		const names =
			await $`docker ps -a --filter ancestor=${IMAGE} --format ${"{{.Names}}"}`
				.quiet()
				.nothrow()
				.text()
				.then((s) => s.trim());
		if (names) process.stdout.write(names + "\n");
	}
	process.exit(0);
}

try {
	switch (command) {
		case "build": {
			const verbose = hasFlag(args, "--verbose", "-v");
			const ctx = await mkdtemp(join(tmpdir(), "yolomode-build-"));
			try {
				await writeFile(join(ctx, "Dockerfile"), DOCKERFILE);
				await writeFile(join(ctx, "entrypoint.sh"), ENTRYPOINT, {
					mode: 0o755,
				});
				await writeFile(join(ctx, "ralph.sh"), RALPH_SH, {
					mode: 0o755,
				});
				const buildArgs = ["build", "-t", IMAGE];
				if (hasFlag(args, "--no-cache")) buildArgs.push("--no-cache");
				buildArgs.push(ctx);
				if (verbose) {
					// Inherit the parent TTY so docker emits ANSI colors and streams output live
					const proc = Bun.spawn(["docker", ...buildArgs], {
						stdin: "inherit",
						stdout: "inherit",
						stderr: "inherit",
					});
					const code = await proc.exited;
					if (code !== 0) process.exit(code);
					console.log(`\n${pc.green("✔")} Image built`);
				} else {
					const spinner = ora("Building image...").start();
					const result = await $`docker ${buildArgs}`.quiet().nothrow();
					if (result.exitCode !== 0) {
						spinner.fail("Build failed");
						const stderr = result.stderr.toString().trim();
						if (stderr) console.error(pc.dim(stderr));
						process.exit(1);
					}
					spinner.succeed("Image built");
				}
			} finally {
				await rm(ctx, { recursive: true, force: true });
			}
			break;
		}

		case "run": {
			await cmdRun(args);
			break;
		}

		case "a":
		case "attach": {
			let id = args[1];
			if (!id || id.startsWith("--")) {
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
			const importPaths = getFlags(args, "--import");
			const imports = await resolveImports(importPaths);
			await ensureRunning(id);
			await copyImports(id, imports);
			const cols = process.stdout.columns || 80;
			const rows = process.stdout.rows || 24;
			await Bun.spawn(
				[
					"docker",
					"exec",
					"-it",
					"-e",
					"TERM",
					"-e",
					`COLUMNS=${cols}`,
					"-e",
					`LINES=${rows}`,
					"-w",
					"/work",
					id,
					"sh",
					"-c",
					`stty cols ${cols} rows ${rows} 2>/dev/null; exec zsh`,
				],
				{ stdin: "inherit", stdout: "inherit", stderr: "inherit" },
			).exited;
			break;
		}

		case "ls": {
			const raw =
				await $`docker ps -a --filter ancestor=${IMAGE} --format ${"{{json .}}"}`
					.quiet()
					.nothrow()
					.text();
			const lines = raw.trim().split("\n").filter(Boolean);
			if (lines.length === 0) {
				console.log(pc.dim("No sessions found."));
				break;
			}
			const table = new Table({
				columns: [
					{ name: "Name", alignment: "left" },
					{ name: "Project", alignment: "left" },
					{ name: "Status", alignment: "left" },
					{ name: "Created", alignment: "left" },
				],
				style: {
					headerTop: { left: "┌", mid: "┬", other: "─", right: "┐" },
					headerBottom: {
						left: "├",
						mid: "┼",
						other: "─",
						right: "┤",
					},
					tableBottom: {
						left: "└",
						mid: "┴",
						other: "─",
						right: "┘",
					},
					vertical: "│",
				},
			});
			for (const line of lines) {
				const c = JSON.parse(line);
				const isRunning = c.State === "running";
				const src = parseLabel(c.Labels, "yolomode.src");
				table.addRow(
					{
						Name: c.Names,
						Project: src ? basename(src) : "",
						Status: c.Status,
						Created: c.CreatedAt,
					},
					{ color: isRunning ? "green" : "white" },
				);
			}
			table.printTable();
			break;
		}

		case "diff": {
			const id = args[1];
			if (!id) die("usage: yolomode diff <name>");
			await ensureRunning(id);
			await $`docker exec ${id} git -C /work add -A`.quiet();
			const patch =
				await $`docker exec ${id} git -C /work diff --cached --full-index yolomode-base`
					.quiet()
					.text();
			if (!patch.trim()) {
				console.log(pc.dim("No changes."));
			} else {
				process.stdout.write(patch);
			}
			break;
		}

		case "apply": {
			await cmdApply(args);
			break;
		}

		case "sync": {
			const id = args[1];
			if (!id) die("usage: yolomode sync <name>");
			const dest = join(process.env.HOME!, ".yolomode", id);
			await $`mkdir -p ${dest}`;
			await $`docker cp ${id}:/work/. ${dest}/`;
			console.log(
				`${pc.green("✔")} Extracted to ${pc.cyan(`~/.yolomode/${id}/`)}`,
			);
			break;
		}

		case "rm": {
			if (hasFlag(args, "--all", "-a")) {
				const runningIds = await $`docker ps --filter ancestor=${IMAGE} -q`
					.quiet()
					.text()
					.then((s) => s.trim());
				if (runningIds) {
					for (const id of runningIds.split("\n")) {
						await $`docker stop ${id}`.quiet().nothrow();
					}
				}
				const ids = await $`docker ps -a --filter ancestor=${IMAGE} -q`
					.quiet()
					.text()
					.then((s) => s.trim());
				const names =
					await $`docker ps -a --filter ancestor=${IMAGE} --format ${"{{.Names}}"}`
						.quiet()
						.text()
						.then((s) => s.trim());
				if (ids) {
					for (const id of ids.split("\n")) {
						await run($`docker rm -f ${id}`);
					}
					for (const n of names.split("\n")) {
						await $`docker volume rm ${n}`.nothrow().quiet();
					}
					console.log(`${pc.green("✔")} Cleaned up all sessions`);
				} else {
					console.log(pc.dim("No sessions to clean."));
				}
			} else {
				const id = args[1];
				if (!id) die("usage: yolomode rm <name> [-a | --all]");
				const inspectResult = await $`docker inspect ${id}`.quiet().nothrow();
				if (inspectResult.exitCode !== 0) die(`no such container: ${id}`);
				await $`docker stop ${id}`.quiet().nothrow();
				await run($`docker rm ${id}`);
				await $`docker volume rm ${id}`.nothrow().quiet();
				console.log(`${pc.green("✔")} Removed ${pc.cyan(id)}`);
			}
			break;
		}

		case "completions": {
			await cmdCompletions(args);
			break;
		}

		case "ralph": {
			await cmdRalph(args);
			break;
		}

		default: {
			console.log(
				boxen(pc.cyan(BANNER) + "\n\n" + pc.dim("isolated dev sessions"), {
					borderColor: "cyan",
					borderStyle: "round",
					padding: { top: 1, bottom: 1, left: 2, right: 2 },
					textAlignment: "center",
				}),
			);
			console.log();
			const cmds = [
				[
					"build",
					"Build the Docker image  (--no-cache, -v/--verbose for live output)",
				],
				[
					"run",
					"Start a new isolated session  (--import <path> to copy files in)",
				],
				[
					"attach <name>",
					"Open a new shell in a session (alias: a)  (--import <path>)",
				],
				["ls", "List all sessions"],
				["diff <name>", "Show changes from a session as a patch"],
				["apply <name>", "Apply session changes to a new branch"],
				["sync <name>", "Extract full work dir from a session"],
				["rm <name>", "Remove a session (-a/--all for all stopped)"],
				["completions <sh>", "Print shell completions (bash|zsh|fish|nu)"],
				["ralph <name>", "Run ralph autonomous loop (--max-iterations N)"],
			];
			for (const [cmd, desc] of cmds) {
				console.log(`  ${pc.cyan(pc.bold(cmd.padEnd(20)))}${pc.dim(desc)}`);
			}
			console.log();
			if (command) die(`unknown command: ${command}`);
			break;
		}
	}
} catch (err: any) {
	if (err?.exitCode !== undefined) {
		const stderr = err.stderr?.toString().trim();
		die(stderr || `command failed (exit ${err.exitCode})`);
	}
	throw err;
}
