#!/usr/bin/env bun
import { $ } from "bun";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import DOCKERFILE from "../Dockerfile" with { type: "text" };
import ENTRYPOINT from "../entrypoint.sh" with { type: "text" };

const IMAGE = "yolomode";
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
	console.error(`yolomode: ${msg}`);
	process.exit(1);
}

function warn(msg: string) {
	console.error(`yolomode: warning: ${msg}`);
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
				console.log(`Building ${IMAGE}...`);
				if (hasFlag("--no-cache")) {
					await $`docker build --no-cache -t ${IMAGE} ${ctx}`;
				} else {
					await $`docker build -t ${IMAGE} ${ctx}`;
				}
			} finally {
				await rm(ctx, { recursive: true, force: true });
			}
			break;
		}

		case "run": {
			const name = generateName();
			const mounts: string[] = [];

			await checkDockerMemory();

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

			console.log(`Starting session: ${name}`);

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

			console.log("");
			console.log(`Session exited: ${name}`);
			console.log(`  Reattach:  yolomode attach ${name}`);
			console.log(`  Review:    yolomode diff ${name}`);
			console.log(`  Apply:     yolomode apply ${name}`);
			console.log(`  Remove:    yolomode rm ${name}`);
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
			await $`docker ps -a --filter ancestor=${IMAGE} --format ${"table {{.Names}}\t{{.Status}}\t{{.CreatedAt}}"}`;
			break;
		}

		case "diff": {
			const id = args[1];
			if (!id) die("usage: yolomode diff <name>");
			await ensureRunning(id);
			await $`docker exec ${id} git -C /work add -A`.quiet();
			const patch =
				await $`docker exec ${id} git -C /work diff --cached yolomode-base`
					.quiet()
					.text();
			if (!patch.trim()) {
				console.error("No changes.");
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
				await $`docker exec ${id} git -C /work diff --cached yolomode-base`
					.quiet()
					.text();
			if (!patch.trim()) die("no changes to apply");

			const branch = `yolomode/${id}`;
			const base = await $`git rev-parse --abbrev-ref HEAD`
				.quiet()
				.text()
				.then((s) => s.trim());
			const patchFile = join(tmpdir(), `yolomode-${id}.patch`);
			try {
				await writeFile(patchFile, patch);
				await $`git checkout -b ${branch}`;
				await $`git apply --stat ${patchFile}`.nothrow();
				await $`git apply ${patchFile}`;
				await $`git add -A`;
				await $`git commit -m ${"yolomode: " + id}`;
				console.log(`Branch created: ${branch}`);
				await $`git checkout ${base}`;
			} finally {
				await rm(patchFile, { force: true });
			}
			break;
		}

		case "sync": {
			const id = args[1];
			if (!id) die("usage: yolomode sync <name>");
			await $`mkdir -p .yolomode/${id}`;
			await $`docker cp ${id}:/work/. .yolomode/${id}/`;
			console.log(`Extracted to .yolomode/${id}/`);
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
					console.log("Cleaned up stopped sessions");
				} else {
					console.log("No stopped sessions to clean");
				}
			} else {
				const id = args[1];
				if (!id) die("usage: yolomode rm <name> [-a | --all]");
				await run($`docker rm ${id}`);
				await $`docker volume rm ${id}`.nothrow().quiet();
			}
			break;
		}

		default:
			console.log("Usage: yolomode <command> [args]");
			console.log("");
			console.log("Commands:");
			console.log(
				"  build          Build the Docker image (--no-cache for force rebuild)",
			);
			console.log("  run            Start a new isolated session");
			console.log("  attach <name>  Open a new shell in a session (alias: a)");
			console.log("  ls             List all sessions");
			console.log("  diff <name>    Show changes from a session as a patch");
			console.log("  apply <name>   Apply session changes to a new branch");
			console.log("  sync <name>    Extract full work dir from a session");
			console.log(
				"  rm <name>      Remove a session (-a/--all for all stopped)",
			);
			if (command) die(`unknown command: ${command}`);
			break;
	}
} catch (err: any) {
	if (err?.exitCode !== undefined) {
		const stderr = err.stderr?.toString().trim();
		die(stderr || `command failed (exit ${err.exitCode})`);
	}
	throw err;
}
