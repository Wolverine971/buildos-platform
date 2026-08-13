// apps/web/src/lib/services/agentic-chat/tools/skills/skill-registry-disk-parity.test.ts
//
// Registry ↔ disk reconciliation guard.
//
// Every other skill test iterates the registry, so a definition directory that
// exists on disk but is never registered is invisible to the whole suite — its
// SKILL.md can instruct agents to call tools that no longer exist and nothing
// fails. That happened with libri_knowledge: the 2026-08-07 libri removal
// (82a0d3705) deleted the tools and libri.skill.ts but left the definition
// directory orphaned for a week. This test makes that class of drift loud in
// both directions.
import { describe, expect, it } from 'vitest';
import { listAllSkills } from './registry';

// Keys only — the markdown itself is loaded elsewhere; we just need the dir names.
const skillMarkdownOnDisk = import.meta.glob('./definitions/*/SKILL.md');

const diskIds = Object.keys(skillMarkdownOnDisk)
	.map((key) => key.match(/^\.\/definitions\/([^/]+)\/SKILL\.md$/)?.[1])
	.filter((id): id is string => Boolean(id))
	.sort();

const registryIds = [...new Set(listAllSkills().map((skill) => skill.id))].sort();

describe('skill registry/disk parity', () => {
	it('every definitions/ directory on disk backs a registered skill (no orphans)', () => {
		const registered = new Set(registryIds);
		const orphans = diskIds.filter((id) => !registered.has(id));
		expect(
			orphans,
			`definition dirs with no registry entry — register them or delete the directory: ${orphans.join(', ')}`
		).toEqual([]);
	});

	it('every registered skill has a definitions/ directory on disk', () => {
		const onDisk = new Set(diskIds);
		const missing = registryIds.filter((id) => !onDisk.has(id));
		expect(
			missing,
			`registered skills with no definitions/<id>/SKILL.md on disk: ${missing.join(', ')}`
		).toEqual([]);
	});
});
