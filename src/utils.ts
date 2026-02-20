import { $ } from "bun";
import { resolve, basename, dirname } from "path";
import { createInterface } from "readline";
import pc from "picocolors";
import { IMAGE, ADJECTIVES, ANIMALS } from "./constants";

// ── Output helpers ──────────────────────────────────────────────

export function die(msg: string): never {
	console.error(`${pc.red(pc.bold("error:"))} ${msg}`);
	process.exit(1);
}

export function warn(msg: string) {
	console.error(`${pc.yellow(pc.bold("warning:"))} ${msg}`);
}

export async function confirm(question: string): Promise<boolean> {
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

// ── Docker execution ────────────────────────────────────────────

export async function run(cmd: ReturnType<typeof $>) {
	const result = await cmd.nothrow().quiet();
	if (result.exitCode !== 0) {
		const stderr = result.stderr.toString().trim();
		die(stderr || `command failed (exit ${result.exitCode})`);
	}
	return result;
}

export async function ensureRunning(id: string) {
	const status = await $`docker inspect -f ${"{{.State.Running}}"} ${id}`
		.quiet()
		.nothrow()
		.text()
		.then((s) => s.trim());
	if (status !== "true") {
		await run($`docker start ${id}`);
	}
}

// ── Filesystem ──────────────────────────────────────────────────

export async function dirExists(path: string): Promise<boolean> {
	return $`test -d ${path}`
		.nothrow()
		.quiet()
		.then((r) => r.exitCode === 0);
}

// ── Argument parsing ────────────────────────────────────────────

export function hasFlag(args: string[], ...flags: string[]): boolean {
	return args.some((a) => flags.includes(a));
}

export function getFlags(args: string[], flag: string): string[] {
	const values: string[] = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === flag && i + 1 < args.length) {
			values.push(args[i + 1]);
			i++;
		}
	}
	return values;
}

// ── Docker labels ───────────────────────────────────────────────

export function parseLabel(
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

// ── Work directory ──────────────────────────────────────────────

// Derive the in-container work dir from the host project path.
// Placed under ~/  so the prompt shows ~/projectname.
export function toWorkDir(src: string): string {
	const name =
		basename(src)
			.toLowerCase()
			.replace(/[^a-z0-9_-]/g, "-")
			.replace(/^-+|-+$/g, "") || "project";
	return `/home/yolo/${name}`;
}

// Read the work dir that was stamped on the container at creation time.
export async function getWorkDir(id: string): Promise<string> {
	return $`docker inspect --format ${'{{index .Config.Labels "yolomode.workdir"}}'} ${id}`
		.quiet()
		.nothrow()
		.text()
		.then((s) => s.trim() || "/home/yolo/project");
}

// ── Session resolution ──────────────────────────────────────────

// Resolve a session name from user input, auto-selecting if there is exactly
// one container. Pass { all: true } to include stopped containers (e.g. rm).
export async function resolveSession(
	id: string | undefined,
	opts: { all?: boolean } = {},
): Promise<string> {
	if (id && !id.startsWith("--")) return id;
	const psArgs = opts.all ? ["-a"] : [];
	const sessions =
		await $`docker ps ${psArgs} --filter ancestor=${IMAGE} --format ${"{{.Names}}"}`
			.quiet()
			.nothrow()
			.text()
			.then((s) => s.trim().split("\n").filter(Boolean));
	if (sessions.length === 1) return sessions[0];
	if (sessions.length === 0)
		die(
			opts.all
				? "no sessions — start one with: yolomode run"
				: "no running sessions — start one with: yolomode run",
		);
	die(
		`${sessions.length} sessions — specify a name:\n${sessions.map((n) => `  ${n}`).join("\n")}`,
	);
}

// ── Session naming ──────────────────────────────────────────────

export function generateName(): string {
	const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
	return `${adj}-${animal}`;
}

export async function generateUniqueName(): Promise<string> {
	while (true) {
		const name = generateName();
		const existing = await $`docker ps -a --filter name=^${name}$ -q`
			.quiet()
			.text()
			.then((s) => s.trim());
		if (!existing) return name;
	}
}

// ── File imports ────────────────────────────────────────────────

export async function resolveImports(
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

export async function copyImports(
	id: string,
	imports: Array<{ abs: string; base: string }>,
) {
	if (imports.length === 0) return;
	await run($`docker exec ${id} mkdir -p /tmp/imports`);
	for (const { abs, base } of imports) {
		const dir = dirname(abs);
		await run(
			$`tar -cf - -C ${dir} ${base} | docker exec -i ${id} tar -xf - -C /tmp/imports/`,
		);
	}
	const list = imports.map((i) => i.base).join(", ");
	console.log(`${pc.green("✔")} Imported to /tmp/imports/:  ${pc.dim(list)}`);
}
