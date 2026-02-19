#!/usr/bin/env bun
import { $ } from "bun";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve, basename } from "path";
import { createInterface } from "readline";
import DOCKERFILE from "../Dockerfile" with { type: "text" };
import ENTRYPOINT from "../entrypoint.sh" with { type: "text" };
import pc from "picocolors";
import boxen from "boxen";
import { Table } from "console-table-printer";
import ora from "ora";

const IMAGE = "yolomode";

const BANNER = `             _                           _      
            | |                         | |     
 _   _  ___ | | ___  _ __ ___   ___   __| | ___ 
| | | |/ _ \\| |/ _ \\| '_ \` _ \\ / _ \\ / _\` |/ _ \\
| |_| | (_) | | (_) | | | | | | (_) | (_| |  __/
 \\__, |\\___/|_|\\___/|_| |_| |_|\\___/ \\__,_|\\___|
  __/ |                                         
 |___/                                          
`;
const HOME = process.env.HOME!;

const ADJECTIVES = [
	"bold",
	"brave",
	"calm",
	"cool",
	"deft",
	"fast",
	"keen",
	"fond",
	"mild",
	"sharp",
	"slim",
	"snug",
	"warm",
	"wild",
	"wise",
	"swift",
	"quiet",
	"grand",
	"stark",
	"vivid",
];

const ANIMALS = [
	"fox",
	"owl",
	"elk",
	"yak",
	"emu",
	"ape",
	"ram",
	"cod",
	"jay",
	"bee",
	"ant",
	"bat",
	"cat",
	"dog",
	"hen",
	"rat",
	"pig",
	"cow",
	"bug",
	"wren",
];

function generateName(): string {
	const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
	return `${adj}-${animal}`;
}

async function generateUniqueName(): Promise<string> {
	while (true) {
		const name = generateName();
		const existing = await $`docker ps -a --filter name=^${name}$ -q`
			.quiet()
			.text()
			.then((s) => s.trim());
		if (!existing) return name;
	}
}

async function dirExists(path: string): Promise<boolean> {
	return $`test -d ${path}`
		.nothrow()
		.quiet()
		.then((r) => r.exitCode === 0);
}

function hasFlag(...flags: string[]): boolean {
	return args.some((a) => flags.includes(a));
}

function getFlags(flag: string): string[] {
	const values: string[] = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === flag && i + 1 < args.length) {
			values.push(args[i + 1]);
			i++;
		}
	}
	return values;
}

function parseLabel(
	labels: string | Record<string, string> | null | undefined,
	key: string,
): string {
	if (!labels) return "";
	if (typeof labels === "object") return labels[key] ?? "";
	for (const pair of labels.split(",")) {
		const eq = pair.indexOf("=");
		if (eq > 0 && pair.slice(0, eq) === key) return pair.slice(eq + 1);
	}
	return "";
}

async function copyImports(
	id: string,
	imports: Array<{ abs: string; base: string }>,
) {
	if (imports.length === 0) return;
	await run($`docker exec ${id} mkdir -p /tmp/imports`);
	for (const { abs } of imports) {
		await run($`docker cp ${abs} ${id}:/tmp/imports/`);
	}
	const list = imports.map((i) => i.base).join(", ");
	console.log(`${pc.green("✔")} Imported to /tmp/imports/:  ${pc.dim(list)}`);
}

async function resolveImports(
	rawPaths: string[],
): Promise<Array<{ abs: string; base: string }>> {
	if (rawPaths.length === 0) return [];
	const resolved = rawPaths.map((p) => resolve(p));
	for (const p of resolved) {
		const exists = await $`test -e ${p}`
			.nothrow()
			.quiet()
			.then((r) => r.exitCode === 0);
		if (!exists) die(`--import path does not exist: ${p}`);
	}
	const entries = resolved.map((p) => ({ abs: p, base: basename(p) }));
	const seen = new Set<string>();
	for (const { abs, base } of entries) {
		if (!base) die(`--import path has no basename: ${abs}`);
		if (seen.has(base)) die(`--import basename collision: "${base}"`);
		seen.add(base);
	}
	return entries;
}

function die(msg: string): never {
	console.error(`${pc.red(pc.bold("error:"))} ${msg}`);
	process.exit(1);
}

function warn(msg: string) {
	console.error(`${pc.yellow(pc.bold("warning:"))} ${msg}`);
}

async function confirm(question: string): Promise<boolean> {
	if (!process.stdin.isTTY) return false;
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.question(
			`${pc.yellow(pc.bold("confirm:"))} ${question} [y/N] `,
			(answer) => {
				rl.close();
				resolve(answer.trim().toLowerCase() === "y");
			},
		);
	});
}

async function run(cmd: ReturnType<typeof $>) {
	const result = await cmd.nothrow().quiet();
	if (result.exitCode !== 0) {
		const stderr = result.stderr.toString().trim();
		die(stderr || `command failed (exit ${result.exitCode})`);
	}
	return result;
}

async function ensureRunning(id: string) {
	const status = await $`docker inspect -f ${"{{.State.Running}}"} ${id}`
		.quiet()
		.nothrow()
		.text()
		.then((s) => s.trim());
	if (status !== "true") {
		await run($`docker start ${id}`);
	}
}

// Extract Claude Code OAuth credentials from macOS keychain
async function getClaudeCredentials(): Promise<string> {
	return $`security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null || true`
		.quiet()
		.text()
		.then((s) => s.trim());
}

// Read ~/.claude.json, strip installMethod (host-specific), write to temp file
async function preprocessClaudeConfig(srcPath: string): Promise<string> {
	try {
		const data = await readFile(srcPath, "utf-8");
		const config = JSON.parse(data);
		delete config.installMethod;
		const tmpDir = join(HOME, ".yolomode", "tmp");
		await $`mkdir -p ${tmpDir}`.quiet();
		const tmpPath = join(tmpDir, "claude-config.json");
		await writeFile(tmpPath, JSON.stringify(config, null, 2), { mode: 0o644 });
		return tmpPath;
	} catch {
		return "";
	}
}

// Warn if Docker VM has insufficient RAM for parallel agents
async function checkDockerMemory() {
	try {
		const mem = await $`docker info --format ${"{{.MemTotal}}"}`
			.quiet()
			.text()
			.then((s) => s.trim());
		const memBytes = parseInt(mem, 10);
		if (!isNaN(memBytes)) {
			const memGB = memBytes / (1024 * 1024 * 1024);
			if (memGB < 6) {
				warn(
					`Docker has only ${memGB.toFixed(1)}GB RAM. Parallel agents will likely OOM.`,
				);
				warn("Increase Docker/Colima memory to 8GB+ for best results.");
			}
		}
	} catch {
		/* ignore */
	}
}

const args = process.argv.slice(2);
const command = args[0];

try {
	switch (command) {
		case "build": {
			const ctx = await mkdtemp(join(tmpdir(), "yolomode-build-"));
			try {
				await writeFile(join(ctx, "Dockerfile"), DOCKERFILE);
				await writeFile(join(ctx, "entrypoint.sh"), ENTRYPOINT, {
					mode: 0o755,
				});
				const spinner = ora("Building image...").start();
				const buildArgs = hasFlag("--no-cache")
					? ["build", "--no-cache", "-t", IMAGE, ctx]
					: ["build", "-t", IMAGE, ctx];
				const result = await $`docker ${buildArgs}`.quiet().nothrow();
				if (result.exitCode !== 0) {
					spinner.fail("Build failed");
					const stderr = result.stderr.toString().trim();
					if (stderr) console.error(pc.dim(stderr));
					process.exit(1);
				}
				spinner.succeed("Image built");
			} finally {
				await rm(ctx, { recursive: true, force: true });
			}
			break;
		}

		case "run": {
			const name = await generateUniqueName();
			const mounts: string[] = [];

			const importPaths = getFlags("--import");
			const imports = await resolveImports(importPaths);

			const memoryFlags = getFlags("--memory");
			const memLimit = memoryFlags[memoryFlags.length - 1] ?? "16g";

			await checkDockerMemory();
			const spinner = ora("Preparing session...").start();

			// --- Claude auth: keychain creds + preprocessed config ---
			const creds = await getClaudeCredentials();
			if (creds) {
				const tmp = await mkdtemp(join(tmpdir(), "yolomode-"));
				const credsPath = join(tmp, "credentials.json");
				await writeFile(credsPath, creds, { mode: 0o600 });
				mounts.push("-v", `${credsPath}:/host-claude/.credentials.json:ro`);
			}

			const claudeJson = join(HOME, ".claude.json");
			if (await Bun.file(claudeJson).exists()) {
				const processed = await preprocessClaudeConfig(claudeJson);
				if (processed) {
					mounts.push("-v", `${processed}:/host-claude/.claude.json:ro`);
				}
			}

			// --- Claude config: skills, plugins (direct mount) ---
			const claudeSkills = join(HOME, ".claude", "skills");
			if (await dirExists(claudeSkills)) {
				mounts.push("-v", `${claudeSkills}:/home/yolo/.claude/skills:ro`);
			}

			const claudePlugins = join(HOME, ".claude", "plugins");
			if (await dirExists(claudePlugins)) {
				mounts.push("-v", `${claudePlugins}:/home/yolo/.claude/plugins:ro`);
			}

			// --- Codex auth ---
			const codexAuth = join(HOME, ".codex", "auth.json");
			if (await Bun.file(codexAuth).exists()) {
				mounts.push("-v", `${codexAuth}:/host-codex/auth.json:ro`);
			}

			// --- Optional host config ---
			const starshipCfg = join(
				process.env.XDG_CONFIG_HOME || join(HOME, ".config"),
				"starship.toml",
			);
			if (await Bun.file(starshipCfg).exists()) {
				mounts.push("-v", `${starshipCfg}:/home/yolo/.config/starship.toml:ro`);
			}

			// Named volume for /work — survives container kills and removes
			await $`docker volume create ${name}`.quiet();
			await $`docker run --rm -v ${name}:/work alpine chown 1000:1000 /work`.quiet();

			spinner.succeed(`Session ${pc.cyan(pc.bold(name))} ready`);
			console.log();

			const cols = process.stdout.columns || 80;
			const rows = process.stdout.rows || 24;

			// Start detached so we can copy imports before handing over the shell
			const dockerArgs = [
				"run",
				"-dit",
				"--name",
				name,
				"--label",
				`yolomode.src=${process.cwd()}`,
				"-v",
				`${name}:/work`,
				"-v",
				`${process.cwd()}:/src:ro`,
				...mounts,
				"-e",
				"ANTHROPIC_API_KEY",
				"-e",
				"OPENAI_API_KEY",
				"-e",
				"TERM",
				"-e",
				`COLUMNS=${cols}`,
				"-e",
				`LINES=${rows}`,
				"--cap-drop",
				"ALL",
				"--security-opt",
				"no-new-privileges:true",
				"--shm-size",
				"1g",
				"--tmpfs",
				"/tmp:nosuid,size=2g",
				"--memory",
				memLimit,
				IMAGE,
			];

			await run($`docker ${dockerArgs}`);
			await copyImports(name, imports);
			await $`docker exec -it -e TERM -e COLUMNS=${cols} -e LINES=${rows} -w /work ${name} zsh`.nothrow();

			console.log();
			const nextStepLines = [
				`${pc.cyan(pc.bold("attach"))}   yolomode attach ${name}`,
				`${pc.cyan(pc.bold("diff"))}     yolomode diff ${name}`,
				`${pc.cyan(pc.bold("apply"))}    yolomode apply ${name}`,
				`${pc.cyan(pc.bold("rm"))}       yolomode rm ${name}`,
			];
			if (imports.length > 0) {
				const list = imports.map((i) => i.base).join(", ");
				nextStepLines.push(
					`${pc.cyan(pc.bold("imports"))}  /tmp/imports/  ${pc.dim(`(${list})`)}`,
				);
			}
			console.log(
				boxen(nextStepLines.join("\n"), {
					title: `${name}`,
					titleAlignment: "left",
					borderColor: "cyan",
					borderStyle: "round",
					padding: { top: 1, bottom: 1, left: 2, right: 2 },
				}),
			);
			break;
		}

		case "a":
		case "attach": {
			const id = args[1];
			if (!id || id.startsWith("--"))
				die("usage: yolomode attach <name> [--import <path>]...");
			const importPaths = getFlags("--import");
			const imports = await resolveImports(importPaths);
			await ensureRunning(id);
			await copyImports(id, imports);
			const cols = process.stdout.columns || 80;
			const rows = process.stdout.rows || 24;
			await $`docker exec -it -e TERM -e COLUMNS=${cols} -e LINES=${rows} -w /work ${id} zsh`.nothrow();
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
					headerBottom: { left: "├", mid: "┼", other: "─", right: "┤" },
					tableBottom: { left: "└", mid: "┴", other: "─", right: "┘" },
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
			const id = args[1];
			if (!id) die("usage: yolomode apply <name>");

			// Warn if applying from a different directory than where the session was created
			const srcLabel =
				await $`docker inspect --format ${"{{index .Config.Labels \"yolomode.src\"}}"} ${id}`
					.quiet()
					.nothrow()
					.text()
					.then((s) => s.trim());
			if (srcLabel && srcLabel !== process.cwd()) {
				warn(`Session was started in: ${pc.cyan(srcLabel)}`);
				warn(`You are currently in:   ${pc.cyan(process.cwd())}`);
				const ok = await confirm("Apply anyway?");
				if (!ok) process.exit(1);
			}

			// Only block on tracked changes; untracked files (?? lines) are fine
			const statusOutput = await $`git status --porcelain`
				.quiet()
				.text()
				.then((s) => s.trim());
			const conflicting = statusOutput
				.split("\n")
				.filter((l) => l.length > 0 && !l.startsWith("??"));
			if (conflicting.length > 0)
				die("working tree has uncommitted tracked changes — commit or stash first");

			await ensureRunning(id);

			// Stage everything in the container
			await $`docker exec ${id} git -C /work add -A`.quiet();

			// Commits since yolomode-base (oldest first)
			const commits =
				await $`docker exec ${id} git -C /work log --reverse --format=%H yolomode-base..HEAD`
					.quiet()
					.text()
					.then((s) => s.trim().split("\n").filter(Boolean));

			// Uncommitted WIP above HEAD (staged by git add -A above)
			const wipPatch =
				await $`docker exec ${id} git -C /work diff --cached --full-index --binary HEAD`
					.quiet()
					.text();
			const hasWip = wipPatch.trim().length > 0;

			if (commits.length === 0 && !hasWip) die("no changes to apply");

			const branch = `yolomode/${id}`;
			const base = await $`git rev-parse --abbrev-ref HEAD`
				.quiet()
				.text()
				.then((s) => s.trim());
			const spinner = ora("Applying changes...").start();
			const patchDir = join(tmpdir(), `yolomode-${id}-patches`);
			const wipFile = join(tmpdir(), `yolomode-${id}-wip.patch`);
			let branchCreated = false;
			let committedCount = 0;

			try {
				await $`git checkout -b ${branch}`;
				branchCreated = true;

				if (commits.length > 0) {
					// format-patch preserves individual commit messages and authorship
					await $`docker exec ${id} sh -c ${"rm -rf /tmp/ym-patches && mkdir /tmp/ym-patches && git -C /work format-patch --binary yolomode-base..HEAD -o /tmp/ym-patches/"}`
						.quiet();
					await $`mkdir -p ${patchDir}`;
					await $`docker cp ${id}:/tmp/ym-patches ${patchDir}`;
					await $`git am --3way ${join(patchDir, "ym-patches")}`;
					committedCount = commits.length;
				}

				// Apply any uncommitted WIP on top
				if (hasWip) {
					await writeFile(wipFile, wipPatch);
					await $`git apply ${wipFile}`;
					await $`git add -A`;
					const wipMsg =
						commits.length > 0 ? "yolomode: wip" : `yolomode: ${id}`;
					await $`git commit -m ${wipMsg}`;
					committedCount++;
				}

				const plural = committedCount !== 1 ? "s" : "";
				spinner.succeed(
					`Branch created: ${pc.cyan(pc.bold(branch))} (${committedCount} commit${plural})`,
				);
				await $`git checkout ${base}`;
			} catch (e) {
				await $`git am --abort`.nothrow().quiet();
				spinner.fail("Failed to apply changes");
				if (branchCreated) {
					await $`git checkout ${base}`.nothrow().quiet();
					await $`git branch -D ${branch}`.nothrow().quiet();
				}
				throw e;
			} finally {
				await rm(patchDir, { recursive: true, force: true });
				await rm(wipFile, { force: true });
			}
			break;
		}

		case "sync": {
			const id = args[1];
			if (!id) die("usage: yolomode sync <name>");
			const dest = join(HOME, ".yolomode", id);
			await $`mkdir -p ${dest}`;
			await $`docker cp ${id}:/work/. ${dest}/`;
			console.log(
				`${pc.green("✔")} Extracted to ${pc.cyan(`~/.yolomode/${id}/`)}`,
			);
			break;
		}

		case "rm": {
			if (hasFlag("--all", "-a")) {
				const ids =
					await $`docker ps -a --filter ancestor=${IMAGE} --filter status=exited --filter status=created -q`
						.quiet()
						.text()
						.then((s) => s.trim());
				const names =
					await $`docker ps -a --filter ancestor=${IMAGE} --filter status=exited --filter status=created --format ${"{{.Names}}"}`
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
					console.log(`${pc.green("✔")} Cleaned up stopped sessions`);
				} else {
					console.log(pc.dim("No stopped sessions to clean."));
				}
			} else {
				const id = args[1];
				if (!id) die("usage: yolomode rm <name> [-a | --all]");
				await run($`docker rm -f ${id}`);
				await $`docker volume rm ${id}`.nothrow().quiet();
				console.log(`${pc.green("✔")} Removed ${pc.cyan(id)}`);
			}
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
				["build", "Build the Docker image (--no-cache for force rebuild)"],
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
			];
			for (const [cmd, desc] of cmds) {
				console.log(`  ${pc.cyan(pc.bold(cmd.padEnd(16)))}${pc.dim(desc)}`);
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
