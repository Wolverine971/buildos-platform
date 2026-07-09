// apps/web/src/lib/services/agentic-chat/tools/domains/skill-gate-preload.test.ts
import { describe, expect, it } from 'vitest';
import {
	getSkillGateCandidateSkillIds,
	renderDomainSensingPromptContent,
	senseDomains
} from './domain-sensing';
import { resolveSkillGatePreload } from './skill-gate-preload';

function senseColdEmailTurn() {
	return senseDomains({
		currentUserMessage: 'Write a cold email to a newsletter creator about BuildOS.',
		limit: 3
	});
}

describe('resolveSkillGatePreload', () => {
	it('preloads the top gate candidate in short format when the gate is active', () => {
		const sensing = senseColdEmailTurn();
		expect(sensing?.skill_load_required).toBe(true);

		const preload = resolveSkillGatePreload(sensing);

		expect(preload).not.toBeNull();
		expect(preload?.format).toBe('short');
		expect(preload?.skillId).toBe(getSkillGateCandidateSkillIds(sensing)[0]);
		expect(preload?.payload.markdown).toBeUndefined();
		expect(preload?.promptContent).toContain('Workflow:');
		expect(preload?.promptContent).toContain('do NOT call skill_load');
		expect(preload?.promptContent).toContain(preload!.skillId);
	});

	it('returns null when sensing did not require a skill load', () => {
		const sensing = senseDomains({
			currentUserMessage: 'Rename the grocery list task to weekend errands.',
			limit: 3
		});
		expect(sensing?.skill_load_required ?? false).toBe(false);

		expect(resolveSkillGatePreload(sensing)).toBeNull();
	});

	it('returns null for a null sensing result', () => {
		expect(resolveSkillGatePreload(null)).toBeNull();
	});

	it('skips the preload when the top candidate is already loaded', () => {
		const sensing = senseColdEmailTurn();
		const topCandidate = getSkillGateCandidateSkillIds(sensing)[0];

		const preload = resolveSkillGatePreload(sensing, {
			alreadyLoadedSkillIds: [topCandidate.toUpperCase()]
		});

		expect(preload).toBeNull();
	});
});

describe('renderDomainSensingPromptContent with a preload', () => {
	it('replaces the active gate directive with the preloaded skill block', () => {
		const sensing = senseColdEmailTurn();
		const preload = resolveSkillGatePreload(sensing);
		expect(preload).not.toBeNull();

		const content = renderDomainSensingPromptContent(sensing, {
			preloadedSkillPromptContent: preload!.promptContent
		});

		expect(content).toContain('Skill-load gate: SATISFIED BY PRELOAD.');
		expect(content).toContain(preload!.skillId);
		expect(content).not.toContain('Skill-load gate: ACTIVE.');
	});

	it('swaps the gated next step for the preload variant (WP-8)', () => {
		const sensing = senseColdEmailTurn();
		const preload = resolveSkillGatePreload(sensing);
		expect(preload).not.toBeNull();

		const content = renderDomainSensingPromptContent(sensing, {
			preloadedSkillPromptContent: preload!.promptContent
		});

		// The gated next step demands a skill_load call the preload already
		// made redundant — it must not survive anywhere in the block.
		expect(content).not.toContain('Skill-load gate is ACTIVE');
		expect(content).toContain('Next step: Skill-load gate already satisfied');
		// The outcome-card hop is a pure pass-through once the default skill
		// is in-context; the preload next step steers away from it.
		expect(content).toContain('do not call outcome_card_load');
	});

	it('keeps the active gate directive when no preload is supplied', () => {
		const sensing = senseColdEmailTurn();

		const content = renderDomainSensingPromptContent(sensing);

		expect(content).toContain('Skill-load gate: ACTIVE.');
		expect(content).toContain('Next step: Skill-load gate is ACTIVE');
		expect(content).not.toContain('SATISFIED BY PRELOAD');
	});
});
