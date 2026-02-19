#!/usr/bin/env bun
import { $ } from "bun";

const IMAGE = "yolomode";

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
	return `yolomode-${adj}-${animal}`;
}

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
	case "build": {
		const noCache = args.includes("--no-cache");
		console.log(`Building ${IMAGE}...`);
		if (noCache) {
			await $`docker build --no-cache -t ${IMAGE} .`;
		} else {
			await $`docker build -t ${IMAGE} .`;
		}
		break;
	}

	case "run": {
		const name = generateName();

		// Extract Claude Code OAuth credentials from macOS keychain
		const claudeCreds =
			await $`security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null || true`
				.quiet()
				.text()
				.then((s) => s.trim());

		// Extract Codex auth
		const codexAuthPath = `${process.env.HOME}/.codex/auth.json`;
		const codexAuth = (await Bun.file(codexAuthPath).exists())
			? await Bun.file(codexAuthPath).text()
			: "";

		// Build optional mount flags
		const optionalMounts: string[] = [];

		const starshipCfg = `${process.env.XDG_CONFIG_HOME || `${process.env.HOME}/.config`}/starship.toml`;
		if (await Bun.file(starshipCfg).exists()) {
			optionalMounts.push(
				"-v",
				`${starshipCfg}:/home/yolo/.config/starship.toml:ro`,
			);
		}

		const claudeSkills = `${process.env.HOME}/.claude/skills`;
		if (
			await $`test -d ${claudeSkills}`
				.nothrow()
				.quiet()
				.then((r) => r.exitCode === 0)
		) {
			optionalMounts.push("-v", `${claudeSkills}:/home/yolo/.claude/skills:ro`);
		}

		const claudePlugins = `${process.env.HOME}/.claude/plugins`;
		if (
			await $`test -d ${claudePlugins}`
				.nothrow()
				.quiet()
				.then((r) => r.exitCode === 0)
		) {
			optionalMounts.push(
				"-v",
				`${claudePlugins}:/home/yolo/.claude/plugins:ro`,
			);
		}

		console.log(`Starting session: ${name}`);
		const cwd = process.cwd();

		await $`docker run -it \
      --name ${name} \
      -v ${cwd}:/src:ro \
      ${optionalMounts} \
      --cap-drop ALL \
      --security-opt no-new-privileges:true \
      --tmpfs /tmp:nosuid,size=500m \
      -e ANTHROPIC_API_KEY \
      -e OPENAI_API_KEY \
      -e CLAUDE_CREDENTIALS=${claudeCreds} \
      -e CODEX_AUTH=${codexAuth} \
      ${IMAGE}`.nothrow();

		console.log("");
		console.log(`Session exited: ${name}`);
		console.log(`  Reattach:  yolomode attach ${name}`);
		console.log(`  Extract:   yolomode sync ${name}`);
		console.log(`  Remove:    yolomode rm ${name}`);
		break;
	}

	case "attach": {
		const id = args[1];
		if (!id) {
			console.error("Usage: yolomode attach <name>");
			process.exit(1);
		}
		await $`docker start -ai ${id}`;
		break;
	}

	case "ls": {
		await $`docker ps -a --filter ancestor=${IMAGE} --format ${"table {{.Names}}\t{{.Status}}\t{{.CreatedAt}}"}`;
		break;
	}

	case "sync": {
		const id = args[1];
		if (!id) {
			console.error("Usage: yolomode sync <name>");
			process.exit(1);
		}
		await $`mkdir -p .yolomode/${id}`;
		await $`docker cp ${id}:/work/. .yolomode/${id}/`;
		console.log(`Extracted to .yolomode/${id}/`);
		break;
	}

	case "rm": {
		if (args.includes("--all")) {
			const ids =
				await $`docker ps -a --filter ancestor=${IMAGE} --filter status=exited -q`
					.quiet()
					.text()
					.then((s) => s.trim());
			if (ids) {
				for (const id of ids.split("\n")) {
					await $`docker rm ${id}`;
				}
				console.log("Cleaned up stopped sessions");
			} else {
				console.log("No stopped sessions to clean");
			}
		} else {
			const id = args[1];
			if (!id) {
				console.error("Usage: yolomode rm <name> [--all]");
				process.exit(1);
			}
			await $`docker rm ${id}`;
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
		console.log("  attach <name>  Reattach to an existing session");
		console.log("  ls             List all sessions");
		console.log("  sync <name>    Extract changes from a session");
		console.log("  rm <name>      Remove a session (--all for all stopped)");
		if (command) {
			console.error(`\nUnknown command: ${command}`);
			process.exit(1);
		}
		break;
}
