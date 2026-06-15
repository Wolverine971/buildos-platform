// apps/web/src/lib/services/agentic-chat/tools/skills/skill-discoverability.test.ts
//
// Guards against accidental orphan skills — registered skills that no domain,
// capability, outcome card, or parent skill surfaces, so they are only ever
// found by a lucky `skill_search` keyword hit.
//
// Intentional exceptions (search-only by design) are allow-listed below. Adding a
// new skill without wiring it in (or allow-listing it) fails this test.
import { describe, expect, it } from 'vitest';
import { listAllSkills } from './registry';
import { listDomains } from '../domains/catalog';
import { listOutcomeCards } from '../outcome-cards/catalog';
import { listCapabilities } from '../registry/capability-catalog';

// Skills intentionally reachable only via skill_search, not domain routing:
// - google_calendar backs a published agent-skill blog (resolveRuntimeSkillForPost)
//   and is the portable/external calendar skill; calendar_management is the native
//   chat default, so google_calendar is deliberately kept out of domain routing to
//   avoid a two-calendar-skill ambiguity.
// - libri_knowledge is feature-flag gated and reached via skill_search when enabled.
const SEARCH_ONLY_SKILLS = new Set(['google_calendar', 'libri_knowledge']);

describe('skill discoverability', () => {
	it('every registered skill is reachable via routing, as a child, or is intentionally search-only', () => {
		const reachable = new Set<string>();

		for (const domain of listDomains()) {
			for (const skill of domain.skills) reachable.add(skill.id);
			for (const stack of domain.recommendedSkillStacks ?? []) {
				for (const id of stack.skillIds) reachable.add(id);
			}
		}
		for (const capability of listCapabilities()) {
			for (const id of capability.skillIds) reachable.add(id);
		}
		for (const outcomeCard of listOutcomeCards()) {
			for (const id of outcomeCard.skillIds) reachable.add(id);
			if (outcomeCard.defaultSkillId) reachable.add(outcomeCard.defaultSkillId);
		}
		for (const skill of listAllSkills()) {
			// A child skill is reachable through its parent's child list.
			if (skill.parentId) reachable.add(skill.id);
			for (const child of skill.childSkills ?? []) reachable.add(child.id);
		}

		const orphans = listAllSkills()
			.map((skill) => skill.id)
			.filter((id) => !reachable.has(id) && !SEARCH_ONLY_SKILLS.has(id));

		expect(
			orphans,
			`unwired skills (add to a domain/capability or allow-list): ${orphans.join(', ')}`
		).toEqual([]);
	});
});
