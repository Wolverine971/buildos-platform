// apps/web/src/lib/services/agentic-chat/tools/domains/domain-sensing.test.ts
import { describe, expect, it } from 'vitest';
import {
	getSkillGateCandidateSkillLoadFormats,
	getSkillGateCandidateSkillIds,
	renderDomainSensingPromptBlock,
	senseDomains
} from './domain-sensing';

describe('domain sensing', () => {
	it('detects active domains and routing handles from the current user message', () => {
		const result = senseDomains({
			currentUserMessage: 'I want to grow my YouTube audience and plan the next videos.'
		});

		expect(result).toMatchObject({
			type: 'domain_sensing',
			source: 'current_user_message'
		});
		expect(result?.active_domains[0]).toMatchObject({
			id: 'marketing.youtube_growth',
			coverage_status: 'partial'
		});
		expect(result?.recommended_skill_ids).toEqual(
			expect.arrayContaining([
				'content_strategy_beyond_blogging',
				'hook_craft_short_form',
				'viral_video_script_structure'
			])
		);
		expect(result?.active_domains[0]?.outcome_card_ids).toEqual(
			expect.arrayContaining(['youtube_growth_strategy_plan', 'youtube_video_improvement'])
		);
		expect(result?.candidate_outcome_card_ids).toContain('youtube_growth_strategy_plan');
		expect(result?.candidate_outcome_cards[0]).toMatchObject({
			id: 'youtube_growth_strategy_plan',
			default_skill_id: 'content_strategy_beyond_blogging',
			skill_load_formats: {
				content_strategy_beyond_blogging: 'full'
			}
		});
		expect(result?.coverage_gap_skill_ids).toContain('youtube_channel_diagnostics');
	});

	it('builds the skill-gate candidate set from outcome cards and active domains', () => {
		const result = senseDomains({
			currentUserMessage: 'Just give me 10 opening-hook options for the launch video.'
		});

		const candidateSkillIds = getSkillGateCandidateSkillIds(result);

		expect(candidateSkillIds[0]).toBe('hook_craft_short_form');
		expect(candidateSkillIds).toContain('content_strategy_beyond_blogging');
		expect(candidateSkillIds).toContain('viral_video_script_structure');
		expect(new Set(candidateSkillIds).size).toBe(candidateSkillIds.length);
	});

	it('builds skill-gate candidate load formats from outcome cards and skill defaults', () => {
		const result = senseDomains({
			currentUserMessage: 'Just give me 10 opening-hook options for the launch video.'
		});

		expect(getSkillGateCandidateSkillLoadFormats(result)).toEqual(
			expect.objectContaining({
				hook_craft_short_form: 'full',
				content_strategy_beyond_blogging: 'full',
				viral_video_script_structure: 'full'
			})
		);
	});

	it('renders a compact prompt block for model routing', () => {
		const block = renderDomainSensingPromptBlock(
			senseDomains({
				currentUserMessage: 'Can you review this cold email sequence before I send it?'
			})
		);

		expect(block).toContain('## Active Domain Signals');
		expect(block).toContain('sales_and_growth.cold_email');
		expect(block).toContain('Candidate outcome cards:');
		expect(block).toContain('cold_email_campaign_build');
		expect(block).toContain('cold_email_engagement_first_outreach');
		expect(block).toContain('skill formats: cold_email_engagement_first_outreach:full');
		expect(block).toContain('Next step:');
	});

	it('falls back to prior session domains when the current turn is ambiguous', () => {
		const result = senseDomains({
			currentUserMessage: 'Ok, make the plan.',
			priorDomainIds: ['marketing.youtube_growth']
		});

		expect(result).toMatchObject({
			source: 'session_state'
		});
		expect(result?.active_domains[0]).toMatchObject({
			id: 'marketing.youtube_growth'
		});
	});

	it('returns null when there is no meaningful domain signal', () => {
		expect(senseDomains({ currentUserMessage: 'Okay, do the next thing.' })).toBeNull();
	});
});

// 2026-07-02 routing regression: a live test session answered script/hook/UI
// prompts from base knowledge with zero skill_load calls because domain sensing
// was advisory-only. The gate binds the WHETHER (a skill must load before the
// final answer); skill CHOICE stays with the model because card confidences
// saturate at 0.95 and tie across candidates.
describe('skill-load gate', () => {
	const gatedCases: Array<{ label: string; message: string; expectedSkill: string }> = [
		{
			label: 'script draft',
			message:
				'Draft the script for the 90-second launch video. People do not have a productivity problem, they have a "where do my thoughts go" problem. Keep me hooked the whole way through.',
			expectedSkill: 'viral_video_script_structure'
		},
		{
			label: 'hook options',
			message: 'Just give me 10 opening-hook options for the launch video.',
			expectedSkill: 'hook_craft_short_form'
		},
		{
			label: 'channel diagnosis',
			message:
				'The BuildOS YouTube channel has 9 videos and almost no views. Why are my videos not getting views, and what 3 videos should I make next?',
			expectedSkill: 'youtube_channel_craft_for_founders'
		},
		{
			label: 'UI audit',
			message:
				'Here is the landing page the video links to. It feels amateur and I cannot tell why. Give me a UI/UX audit.',
			expectedSkill: 'ui_ux_quality_review'
		},
		{
			label: 'quick research plan',
			message:
				'Before the video sends traffic, I want to know if people actually understand the landing page. I do not want a big research program — what is the lightest way to find out, and when do I stop?',
			expectedSkill: 'usability_quick_research'
		}
	];

	for (const { label, message, expectedSkill } of gatedCases) {
		it(`requires a skill load for ${label} prompts and surfaces the expected skill`, () => {
			const result = senseDomains({ currentUserMessage: message });
			expect(result?.skill_load_required).toBe(true);
			expect(result?.next_step).toContain('Skill-load gate is ACTIVE');
			const surfacedSkillIds = [
				...(result?.recommended_skill_ids ?? []),
				...(result?.active_domains.flatMap((domain) => domain.skill_ids) ?? []),
				...(result?.candidate_outcome_cards.flatMap((card) => card.skill_ids) ?? [])
			];
			expect(surfacedSkillIds).toContain(expectedSkill);
		});
	}

	it('renders the gate directive at the top of the prompt block when active', () => {
		const block = renderDomainSensingPromptBlock(
			senseDomains({
				currentUserMessage: 'Just give me 10 opening-hook options for the launch video.'
			})
		);
		expect(block).toContain('Skill-load gate: ACTIVE.');
		expect(block).toContain('Answering skill-covered work from base knowledge');
	});

	it('does not gate session-state fallbacks from prior domains', () => {
		const result = senseDomains({
			currentUserMessage: 'Ok, make the plan.',
			priorDomainIds: ['marketing.youtube_growth']
		});
		expect(result?.source).toBe('session_state');
		expect(result?.skill_load_required).toBe(false);
		expect(result?.next_step).not.toContain('Skill-load gate is ACTIVE');
	});

	it('stays quiet for direct-tool asks with no domain signal', () => {
		expect(
			senseDomains({ currentUserMessage: 'Can you add a task to buy milk tomorrow?' })
		).toBeNull();
	});

	// 2026-07-02 rerun turn 5: this exact prompt misrouted to product/design and
	// the story family never surfaced. Two causes, both fixed: alias "ui"
	// substring-matched inside "build", and the video domain had no
	// narrative/story recall terms.
	it('routes narrative-arc video revisions to the short-form video family', () => {
		const result = senseDomains({
			currentUserMessage:
				"The video draft feels emotionally flat — the story doesn't build. Fix the narrative arc."
		});

		expect(result?.skill_load_required).toBe(true);
		expect(result?.active_domains[0]).toMatchObject({ id: 'marketing.short_form_video' });
		expect(result?.recommended_skill_ids).toContain('story_driven_content_craft');
		expect(result?.active_domains.map((domain) => domain.id)).not.toContain(
			'product_and_design'
		);
	});

	// Alias matching must be whole-token: alias "ui" previously substring-matched
	// every message containing "build" or "BuildOS", so the product name itself
	// falsely sensed product_and_design (and gated) on ordinary messages.
	it('does not sense product_and_design from the word BuildOS', () => {
		expect(
			senseDomains({
				currentUserMessage: 'BuildOS demo video campaign status update please.'
			})
		).toBeNull();
	});

	it('still senses product_and_design from real ui/ux tokens', () => {
		const result = senseDomains({
			currentUserMessage:
				'Here is the landing page the video links to. It feels amateur and I cannot tell why. Give me a UI/UX audit.'
		});
		expect(result?.active_domains.map((domain) => domain.id)).toContain('product_and_design');
	});
});
