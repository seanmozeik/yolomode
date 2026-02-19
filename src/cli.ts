#!/usr/bin/env bun
import { $ } from "bun";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import DOCKERFILE from "../Dockerfile" with { type: "text" };
import ENTRYPOINT from "../entrypoint.sh" with { type: "text" };
import pc from "picocolors";
import boxen from "boxen";
import { Table } from "console-table-printer";
import ora from "ora";

const IMAGE = "yolomode";

const BANNER = `                __                          __
   __  ______  / /___  ____ ___  ____  ____/ /__
  / / / / __ \\/ / __ \\/ __ \`__ \\/ __ \\/ __  / _ \\
 / /_/ / /_/ / / /_/ / / / / / / /_/ / /_/ /  __/
 \\__, /\\____/_/\\____/_/ /_/ /_/\\____/\\__,_/\\___/
/____/`;
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

async function dirExists(path: string): Promise<boolean> {
	return $`test -d ${path}`
		.nothrow()
		.quiet()
		.then((r) => r.exitCode === 0);
}

function hasFlag(...flags: string[]): boolean {
	return args.some((a) => flags.includes(a));
}

function die(msg: string): never {
	console.error(`${pc.red(pc.bold("error:"))} ${msg}`);
	process.exit(1);
}

function warn(msg: string) {
	console.error(`${pc.yellow(pc.bold("warning:"))} ${msg}`);
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
			const name = generateName();
			const mounts: string[] = [];

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

			const dockerArgs = [
				"run",
				"-it",
				"--name",
				name,
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
				"--cap-drop",
				"ALL",
				"--security-opt",
				"no-new-privileges:true",
				"--shm-size",
				"1g",
				"--tmpfs",
				"/tmp:nosuid,size=2g",
				IMAGE,
			];

			await $`docker ${dockerArgs}`.nothrow();

			console.log();
			console.log(
				boxen(
					[
						`${pc.cyan(pc.bold("attach"))}   yolomode attach ${name}`,
						`${pc.cyan(pc.bold("diff"))}     yolomode diff ${name}`,
						`${pc.cyan(pc.bold("apply"))}    yolomode apply ${name}`,
						`${pc.cyan(pc.bold("rm"))}       yolomode rm ${name}`,
					].join("\n"),
					{
						title: `${name}`,
						titleAlignment: "left",
						borderColor: "cyan",
						borderStyle: "round",
						padding: { top: 1, bottom: 1, left: 2, right: 2 },
					},
				),
			);
			break;
		}

		case "a":
		case "attach": {
			const id = args[1];
			if (!id) die("usage: yolomode attach <name>");
			await ensureRunning(id);
			await $`docker exec -it -e TERM -w /work ${id} zsh`.nothrow();
			break;
		}

		case "ls": {
			const raw = await $`docker ps -a --filter ancestor=${IMAGE} --format ${"{{json .}}"}`
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
				table.addRow(
					{
						Name: c.Names,
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

			const dirty = await $`git status --porcelain`
				.quiet()
				.text()
				.then((s) => s.trim());
			if (dirty) die("working tree is dirty — commit or stash first");

			await ensureRunning(id);
			await $`docker exec ${id} git -C /work add -A`.quiet();
			const patch =
				await $`docker exec ${id} git -C /work diff --cached --full-index yolomode-base`
					.quiet()
					.text();
			if (!patch.trim()) die("no changes to apply");

			const branch = `yolomode/${id}`;
			const base = await $`git rev-parse --abbrev-ref HEAD`
				.quiet()
				.text()
				.then((s) => s.trim());
			const patchFile = join(tmpdir(), `yolomode-${id}.patch`);
			const spinner = ora("Applying changes...").start();
			try {
				await writeFile(patchFile, patch);
				await $`git checkout -b ${branch}`;
				await $`git apply --stat ${patchFile}`.nothrow();
				await $`git apply ${patchFile}`;
				await $`git add -A`;
				await $`git commit -m ${"yolomode: " + id}`;
				spinner.succeed(`Branch created: ${pc.cyan(pc.bold(branch))}`);
				await $`git checkout ${base}`;
			} finally {
				await rm(patchFile, { force: true });
			}
			break;
		}

		case "sync": {
			const id = args[1];
			if (!id) die("usage: yolomode sync <name>");
			const dest = join(HOME, ".yolomode", id);
			await $`mkdir -p ${dest}`;
			await $`docker cp ${id}:/work/. ${dest}/`;
			console.log(`${pc.green("✔")} Extracted to ${pc.cyan(`~/.yolomode/${id}/`)}`);
			break;
		}

		case "rm": {
			if (hasFlag("--all", "-a")) {
				const ids =
					await $`docker ps -a --filter ancestor=${IMAGE} --filter status=exited -q`
						.quiet()
						.text()
						.then((s) => s.trim());
				const names =
					await $`docker ps -a --filter ancestor=${IMAGE} --filter status=exited --format ${"{{.Names}}"}`
						.quiet()
						.text()
						.then((s) => s.trim());
				if (ids) {
					for (const id of ids.split("\n")) {
						await run($`docker rm ${id}`);
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
				await run($`docker rm ${id}`);
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
				["run", "Start a new isolated session"],
				["attach <name>", "Open a new shell in a session (alias: a)"],
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
