import { $ } from "bun";
import { writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import pc from "picocolors";
import ora from "ora";
import {
	die,
	warn,
	confirm,
	ensureRunning,
	run,
	getWorkDir,
	resolveSession,
} from "./utils";

export async function cmdApply(args: string[]) {
	const id = await resolveSession(args[1], { all: true });

	// Warn if applying from a different directory than where the session was created
	const srcLabel =
		await $`docker inspect --format ${'{{index .Config.Labels "yolomode.src"}}'} ${id}`
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
	const workDir = await getWorkDir(id);

	// Stage everything in the container
	await $`docker exec ${id} git -C ${workDir} add -A`.quiet();

	// Commits since yolomode-base (oldest first)
	const commits =
		await $`docker exec ${id} git -C ${workDir} log --reverse --format=%H yolomode-base..HEAD`
			.quiet()
			.text()
			.then((s) => s.trim().split("\n").filter(Boolean));

	// Uncommitted WIP above HEAD (staged by git add -A above)
	const wipPatch =
		await $`docker exec ${id} git -C ${workDir} diff --cached --full-index --binary HEAD`
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
			await $`docker exec ${id} sh -c ${`rm -rf /home/yolo/ym-patches && mkdir /home/yolo/ym-patches && git -C ${workDir} format-patch --binary yolomode-base..HEAD -o /home/yolo/ym-patches/`}`.quiet();
			await $`mkdir -p ${patchDir}`;
			await $`docker cp ${id}:/home/yolo/ym-patches ${patchDir}`;
			const patchesDir = join(patchDir, "ym-patches");
			const patches = [...new Bun.Glob("*.patch").scanSync(patchesDir)]
				.sort()
				.map((f) => join(patchesDir, f));
			await $`git am --3way ${patches}`;
			committedCount = commits.length;
		}

		// Apply any uncommitted WIP on top
		if (hasWip) {
			await writeFile(wipFile, wipPatch);
			await $`git apply ${wipFile}`;
			await $`git add -A`;
			const wipMsg = commits.length > 0 ? "yolomode: wip" : `yolomode: ${id}`;
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
}
