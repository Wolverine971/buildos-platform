// apps/web/scripts/check-local-skill-frontmatter.mjs
//
// Guardrail: every SKILL.md under the repo-root .claude/skills and .codex/skills
// must carry only supported frontmatter (name, description, allowed-tools), with
// name matching its directory. Unknown fields (path:, version:, model:, tools:)
// are silently ignored by Claude Code, so without this check they accumulate —
// scripts/labelFilePaths.ts injected `path:` into three skills before it learned
// to skip dot-directories. Runs in the web lint chain (guardrails:local-skills).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SKILL_ROOTS = ['.claude/skills', '.codex/skills'];
const ALLOWED_KEYS = new Set(['name', 'description', 'allowed-tools']);
const REQUIRED_KEYS = ['name', 'description'];

const errors = [];
let checked = 0;

for (const rootRel of SKILL_ROOTS) {
	const root = path.join(repoRoot, rootRel);
	if (!fs.existsSync(root)) continue;

	for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const skillFile = path.join(root, entry.name, 'SKILL.md');
		const skillRel = `${rootRel}/${entry.name}/SKILL.md`;
		if (!fs.existsSync(skillFile)) {
			errors.push(`${rootRel}/${entry.name}: missing SKILL.md`);
			continue;
		}
		checked++;

		const content = fs.readFileSync(skillFile, 'utf8');
		const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
		if (!frontmatter) {
			errors.push(`${skillRel}: no YAML frontmatter block`);
			continue;
		}

		const keys = [...frontmatter[1].matchAll(/^([A-Za-z][\w-]*):/gm)].map((m) => m[1]);
		for (const key of keys) {
			if (!ALLOWED_KEYS.has(key)) {
				errors.push(
					`${skillRel}: unsupported frontmatter field "${key}:" (allowed: ${[...ALLOWED_KEYS].join(', ')})`
				);
			}
		}
		for (const key of REQUIRED_KEYS) {
			if (!keys.includes(key)) {
				errors.push(`${skillRel}: missing required frontmatter field "${key}:"`);
			}
		}

		const name = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
		if (name && name !== entry.name) {
			errors.push(`${skillRel}: name "${name}" does not match directory "${entry.name}"`);
		}
	}
}

console.log(
	`LOCAL SKILL FRONTMATTER CHECK\n\nSkills checked: ${checked}\nErrors: ${errors.length}`
);
if (errors.length > 0) {
	for (const error of errors) console.error(`  ✗ ${error}`);
	console.error('\nResult: failed.');
	process.exit(1);
}
console.log('\nResult: passed.');
