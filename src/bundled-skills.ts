import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";

import RALPH from "../skills/ralph/SKILL.md" with { type: "text" };
import PRD from "../skills/prd/SKILL.md" with { type: "text" };
import AB_SKILL from "../skills/agent-browser/SKILL.md" with { type: "text" };
import AB_AUTH from "../skills/agent-browser/references/authentication.md" with {
	type: "text",
};
import AB_COMMANDS from "../skills/agent-browser/references/commands.md" with {
	type: "text",
};
import AB_PROFILING from "../skills/agent-browser/references/profiling.md" with {
	type: "text",
};
import AB_PROXY from "../skills/agent-browser/references/proxy-support.md" with {
	type: "text",
};
import AB_SESSION from "../skills/agent-browser/references/session-management.md" with {
	type: "text",
};
import AB_SNAPSHOT from "../skills/agent-browser/references/snapshot-refs.md" with {
	type: "text",
};
import AB_VIDEO from "../skills/agent-browser/references/video-recording.md" with {
	type: "text",
};
import AB_TMPL_AUTH from "../skills/agent-browser/templates/authenticated-session.sh" with {
	type: "text",
};
import AB_TMPL_CAPTURE from "../skills/agent-browser/templates/capture-workflow.sh" with {
	type: "text",
};
import AB_TMPL_FORM from "../skills/agent-browser/templates/form-automation.sh" with {
	type: "text",
};

const SKILLS: Array<[string, string]> = [
	["ralph/SKILL.md", RALPH],
	["prd/SKILL.md", PRD],
	["agent-browser/SKILL.md", AB_SKILL],
	["agent-browser/references/authentication.md", AB_AUTH],
	["agent-browser/references/commands.md", AB_COMMANDS],
	["agent-browser/references/profiling.md", AB_PROFILING],
	["agent-browser/references/proxy-support.md", AB_PROXY],
	["agent-browser/references/session-management.md", AB_SESSION],
	["agent-browser/references/snapshot-refs.md", AB_SNAPSHOT],
	["agent-browser/references/video-recording.md", AB_VIDEO],
	["agent-browser/templates/authenticated-session.sh", AB_TMPL_AUTH],
	["agent-browser/templates/capture-workflow.sh", AB_TMPL_CAPTURE],
	["agent-browser/templates/form-automation.sh", AB_TMPL_FORM],
];

// Write bundled skills into dest. Call this BEFORE copying host skills so
// host skills take priority and can override any bundled skill.
export async function writeBundledSkills(dest: string): Promise<void> {
	for (const [relPath, content] of SKILLS) {
		const fullPath = join(dest, relPath);
		await mkdir(dirname(fullPath), { recursive: true });
		await writeFile(fullPath, content);
	}
}
