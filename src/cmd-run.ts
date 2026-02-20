import { $ } from "bun";
import { mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import pc from "picocolors";
import boxen from "boxen";
import ora from "ora";
import { IMAGE, HOME } from "./constants";
import {
	generateUniqueName,
	getFlags,
	hasFlag,
	dirExists,
	run,
	copyImports,
	resolveImports,
	warn,
} from "./utils";
import { RALPH_SKILL } from "./cmd-ralph";

// ── Private helpers ─────────────────────────────────────────────

async function getClaudeCredentials(): Promise<string> {
	return $`security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null || true`
		.quiet()
		.text()
		.then((s) => s.trim());
}

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

// ── Command handler ─────────────────────────────────────────────

export async function cmdRun(args: string[]) {
	const name = await generateUniqueName();
	const mounts: string[] = [];

	const importPaths = getFlags(args, "--import");
	const imports = await resolveImports(importPaths);

	const memoryFlags = getFlags(args, "--memory");
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

	// --- Claude config: skills (merged with bundled ralph skill), plugins, root CLAUDE.md ---
	// Build a merged skills temp dir so we don't nest a file mount inside a
	// read-only directory mount (which causes "read-only file system" from runc).
	const skillsTmpDir = await mkdtemp(join(tmpdir(), "yolomode-skills-"));
	const claudeSkills = join(HOME, ".claude", "skills");
	if (await dirExists(claudeSkills)) {
		await $`cp -r ${claudeSkills}/. ${skillsTmpDir}/`.quiet();
	}
	await writeFile(join(skillsTmpDir, "ralph.md"), RALPH_SKILL);
	mounts.push("-v", `${skillsTmpDir}:/home/yolo/.claude/skills:ro`);

	const claudePlugins = join(HOME, ".claude", "plugins");
	if (await dirExists(claudePlugins)) {
		mounts.push("-v", `${claudePlugins}:/home/yolo/.claude/plugins:ro`);
	}

	const claudeRootMd = join(HOME, ".claude", "CLAUDE.md");
	if (await Bun.file(claudeRootMd).exists()) {
		mounts.push("-v", `${claudeRootMd}:/home/yolo/.claude/CLAUDE.md:ro`);
	}

	// --- Yolomode user settings (~/.config/yolomode/settings.json) ---
	const yolomodeSettings = join(
		process.env.XDG_CONFIG_HOME || join(HOME, ".config"),
		"yolomode",
		"settings.json",
	);
	if (await Bun.file(yolomodeSettings).exists()) {
		mounts.push("-v", `${yolomodeSettings}:/host-claude/settings.json:ro`);
	}

	// --- Codex auth ---
	const codexAuth = join(HOME, ".codex", "auth.json");
	if (await Bun.file(codexAuth).exists()) {
		mounts.push("-v", `${codexAuth}:/host-codex/auth.json:ro`);
	}

	// --- Host git identity ---
	const gitName = await $`git config --global user.name`
		.quiet()
		.nothrow()
		.text()
		.then((s) => s.trim());
	const gitEmail = await $`git config --global user.email`
		.quiet()
		.nothrow()
		.text()
		.then((s) => s.trim());

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
		...(gitName
			? [
					"-e",
					`GIT_AUTHOR_NAME=${gitName}`,
					"-e",
					`GIT_COMMITTER_NAME=${gitName}`,
				]
			: []),
		...(gitEmail
			? [
					"-e",
					`GIT_AUTHOR_EMAIL=${gitEmail}`,
					"-e",
					`GIT_COMMITTER_EMAIL=${gitEmail}`,
				]
			: []),
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
			name,
			"sh",
			"-c",
			`stty cols ${cols} rows ${rows} 2>/dev/null; exec zsh`,
		],
		{ stdin: "inherit", stdout: "inherit", stderr: "inherit" },
	).exited;

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
}
