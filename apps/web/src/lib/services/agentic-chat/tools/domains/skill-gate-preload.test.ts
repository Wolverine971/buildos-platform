// apps/web/src/lib/services/agentic-chat/tools/domains/skill-gate-preload.test.ts
import { describe, expect, it } from 'vitest';
import {
	getSkillGateCandidateSkillIds,
	renderDomainSensingPromptContent,
	senseDomains
} from './domain-sensing';
import { resolveSkillGatePreload, resolveSkillPreloadById } from './skill-gate-preload';

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
		expect(preload?.source).toBe('domain_sensing');
		expect(preload?.skillId).toBe(getSkillGateCandidateSkillIds(sensing)[0]);
		expect(preload?.payload.markdown).toBeUndefined();
		expect(preload?.promptContent).toContain('Workflow:');
		expect(preload?.promptContent).toContain('do NOT call skill_load');
		expect(preload?.promptContent).toContain(preload!.skillId);
	});

	it('renders a preload without follow-up skill calls for worker-only execution', () => {
		const preload = resolveSkillGatePreload(senseColdEmailTurn(), {
			allowFollowupSkillLoad: false
		});

		expect(preload).not.toBeNull();
		expect(preload?.promptContent).toContain('already loaded at short format');
		expect(preload?.promptContent).not.toContain('skill_load');
		expect(preload?.promptContent).not.toContain('Linked child skills');
		expect(preload?.promptContent).not.toContain('Need more depth?');
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

describe('resolveSkillPreloadById', () => {
	it('preloads a trusted project-affinity skill without lexical sensing', () => {
		const preload = resolveSkillPreloadById('fiction_story_craft');

		expect(preload).not.toBeNull();
		expect(preload?.skillId).toBe('fiction_story_craft');
		expect(preload?.source).toBe('project_domain_affinity');
		expect(preload?.format).toBe('short');
		expect(preload?.payload.markdown).toBeUndefined();
		expect(preload?.promptContent.length).toBeLessThan(9_000);
		expect(preload?.promptContent).toContain('Character–Arc–Scene Sweep');
		expect(preload?.promptContent).toContain('traits, backstory, wants, fears');
		expect(preload?.promptContent).toContain('Causal bridge');
		expect(preload?.promptContent).toContain('No project facts changed');
		expect(preload?.materializedToolNames).toEqual(
			expect.arrayContaining([
				'get_document_outline',
				'read_document_section',
				'search_project'
			])
		);
		expect(preload?.materializedToolNames).not.toEqual(
			expect.arrayContaining(['create_onto_document', 'update_onto_document'])
		);
		expect(preload?.payload.write_ops).toEqual(
			expect.arrayContaining(['onto.document.create', 'onto.document.update'])
		);
	});

	it('skips an affinity preload already present in the history ledger', () => {
		expect(
			resolveSkillPreloadById('fiction_story_craft', {
				alreadyLoadedSkillIds: ['FICTION_STORY_CRAFT']
			})
		).toBeNull();
	});
});

describe('renderDomainSensingPromptContent with a preload', () => {
	it('renders a persisted-affinity preload even when lexical sensing found no domain', () => {
		const preload = resolveSkillPreloadById('fiction_story_craft');
		expect(preload).not.toBeNull();

		const content = renderDomainSensingPromptContent(null, {
			preloadedSkillPromptContent: preload!.promptContent,
			preloadSource: preload!.source
		});

		expect(content).toContain('Source: persisted_project_domain_affinity.');
		expect(content).toContain('Skill-load gate: SATISFIED BY PRELOAD.');
		expect(content).toContain('Preloaded skill: fiction_story_craft');
	});

	it('lets persisted affinity override a weak, ungated lexical signal', () => {
		const weakSensing = senseDomains({
			currentUserMessage: 'Which option feels strongest?'
		});
		expect(weakSensing?.skill_load_required ?? false).toBe(false);
		const preload = resolveSkillPreloadById('fiction_story_craft');

		const content = renderDomainSensingPromptContent(weakSensing, {
			preloadedSkillPromptContent: preload!.promptContent,
			preloadSource: preload!.source
		});

		expect(content).toContain('Source: persisted_project_domain_affinity.');
		expect(content).toContain('Preloaded skill: fiction_story_craft');
		expect(content).not.toContain('Skill-load gate: ACTIVE.');
	});

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
