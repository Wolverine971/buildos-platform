// apps/web/src/lib/services/agentic-chat/tools/domains/domain-sensing.test.ts
import { describe, expect, it } from 'vitest';
import {
	getSkillGateCandidateSkillLoadFormats,
	getSkillGateCandidateSkillIds,
	renderDomainSensingPromptBlock,
	senseDomains,
	type DomainSensingResult
} from './domain-sensing';

function buildSkillGateFixture(): DomainSensingResult {
	return {
		type: 'domain_sensing',
		source: 'current_user_message',
		query: 'rank these skills',
		active_domains: [
			{
				id: 'marketing.short_form_video',
				name: 'Short-Form Video',
				confidence: 0.94,
				coverage_status: 'strong',
				parent_ids: [],
				aliases_hit: ['hooks'],
				skill_ids: ['content_strategy_beyond_blogging', 'algorithm_aware_publishing'],
				outcome_card_ids: ['short_form_video_asset_improvement'],
				recommended_skill_stack_ids: [],
				gaps: [],
				gap_skill_ids: [],
				gap_resource_ids: []
			}
		],
		candidate_outcome_cards: [
			{
				id: 'content_strategy_plan',
				name: 'Content Strategy Plan',
				confidence: 0.91,
				summary: 'Build a content strategy.',
				domain_ids: ['marketing.content_strategy'],
				buildos_capability_ids: ['planning'],
				default_skill_id: 'story_driven_content_craft',
				skill_ids: ['story_driven_content_craft'],
				skill_load_formats: {
					story_driven_content_craft: 'full'
				},
				coverage_status: 'strong',
				gaps: [],
				gap_skill_ids: [],
				gap_resource_ids: [],
				load_hint: 'Use for strategy.'
			},
			{
				id: 'short_form_video_asset_improvement',
				name: 'Short-Form Video Asset Improvement',
				confidence: 0.95,
				summary: 'Improve one short-form video asset.',
				domain_ids: ['marketing.short_form_video'],
				buildos_capability_ids: ['documents'],
				default_skill_id: 'hook_craft_short_form',
				skill_ids: ['hook_craft_short_form', 'viral_video_script_structure'],
				skill_load_formats: {
					hook_craft_short_form: 'short',
					viral_video_script_structure: 'full'
				},
				coverage_status: 'strong',
				gaps: [],
				gap_skill_ids: [],
				gap_resource_ids: [],
				load_hint: 'Use for hooks.'
			}
		],
		candidate_outcome_card_ids: ['short_form_video_asset_improvement', 'content_strategy_plan'],
		recommended_skill_ids: [
			'content_strategy_beyond_blogging',
			'algorithm_aware_publishing',
			'story_driven_content_craft',
			'viral_content_for_boring_brands'
		],
		coverage_gap_skill_ids: [],
		coverage_gap_resource_ids: [],
		skill_load_required: true,
		next_step: 'Skill-load gate is ACTIVE.'
	};
}

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
			},
			gap_skill_ids: expect.arrayContaining(['youtube_channel_diagnostics'])
		});
		expect(result?.coverage_gap_skill_ids).toContain('youtube_channel_diagnostics');
	});

	it('builds the skill-gate candidate set from outcome cards and active domains', () => {
		const result = senseDomains({
			currentUserMessage: 'Just give me 10 opening-hook options for the launch video.'
		});

		const candidateSkillIds = getSkillGateCandidateSkillIds(result);

		expect(candidateSkillIds[0]).toBe('hook_craft_short_form');
		expect(candidateSkillIds.length).toBeLessThanOrEqual(3);
		expect(new Set(candidateSkillIds).size).toBe(candidateSkillIds.length);
		expect(result?.recommended_skill_ids).toEqual(
			expect.arrayContaining([
				'content_strategy_beyond_blogging',
				'viral_video_script_structure'
			])
		);
	});

	it('caps skill-gate candidates and leads with the strongest outcome default', () => {
		const result = buildSkillGateFixture();

		expect(getSkillGateCandidateSkillIds(result)).toEqual([
			'hook_craft_short_form',
			'viral_video_script_structure',
			'content_strategy_beyond_blogging'
		]);
		expect(result.recommended_skill_ids).toHaveLength(4);
	});

	it('builds skill-gate candidate load formats from outcome cards and skill defaults', () => {
		const result = senseDomains({
			currentUserMessage: 'Just give me 10 opening-hook options for the launch video.'
		});

		const candidateSkillIds = getSkillGateCandidateSkillIds(result);
		const formats = getSkillGateCandidateSkillLoadFormats(result);

		expect(Object.keys(formats)).toEqual(candidateSkillIds);
		expect(formats.hook_craft_short_form).toBe('full');
	});

	it('renders compact ranked skill-load candidates while trimming the raw recommendations', () => {
		const block = renderDomainSensingPromptBlock(buildSkillGateFixture());

		expect(block).toContain('Skill-load candidates (ranked, max 3):');
		expect(block).toContain(
			'- hook_craft_short_form, viral_video_script_structure, content_strategy_beyond_blogging'
		);
		expect(block).toContain(
			'Recommended skill ids:\n- content_strategy_beyond_blogging, algorithm_aware_publishing, story_driven_content_craft (+1 more)'
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

	it('detects BuildOS-native project audit requests without a subject domain', () => {
		const result = senseDomains({
			currentUserMessage: 'Audit the health of 9takes'
		});

		expect(result).toMatchObject({
			source: 'current_user_message',
			active_domains: [],
			skill_load_required: true
		});
		expect(result?.candidate_outcome_card_ids).toContain('project_health_audit');
		expect(getSkillGateCandidateSkillIds(result)[0]).toBe('project_audit');
		expect(getSkillGateCandidateSkillLoadFormats(result)).toEqual({
			project_audit: 'full'
		});
	});

	it('detects BuildOS-native project forecast requests without a subject domain', () => {
		const result = senseDomains({
			currentUserMessage: 'Forecast what is likely to slip in 9takes'
		});

		expect(result).toMatchObject({
			source: 'current_user_message',
			active_domains: [],
			skill_load_required: true
		});
		expect(result?.candidate_outcome_card_ids).toContain('project_slip_forecast');
		expect(getSkillGateCandidateSkillIds(result)[0]).toBe('project_forecast');
		expect(getSkillGateCandidateSkillLoadFormats(result)).toEqual({
			project_forecast: 'full'
		});
	});

	it('does not let stale session domains override current native project requests', () => {
		const result = senseDomains({
			currentUserMessage: 'Forecast what is likely to slip in 9takes',
			priorDomainIds: ['marketing.youtube_growth']
		});

		expect(result?.source).toBe('current_user_message');
		expect(result?.active_domains).toEqual([]);
		expect(getSkillGateCandidateSkillIds(result)[0]).toBe('project_forecast');
	});

	it('keeps ambiguous blocker follow-ups on the prior subject domain', () => {
		const result = senseDomains({
			currentUserMessage: 'Now diagnose the blockers.',
			priorDomainIds: ['marketing.youtube_growth'],
			priorOutcomeCardIds: ['youtube_growth_strategy_plan']
		});

		expect(result?.source).toBe('session_state');
		expect(result?.active_domains.map((domain) => domain.id)).toEqual([
			'marketing.youtube_growth'
		]);
		expect(getSkillGateCandidateSkillIds(result)).not.toContain('project_audit');
	});

	it('keeps ambiguous follow-ups on the recent native project outcome card', () => {
		const result = senseDomains({
			currentUserMessage: 'Ok, make the plan.',
			priorDomainIds: ['marketing.youtube_growth'],
			priorOutcomeCardIds: ['project_slip_forecast', 'youtube_growth_strategy_plan']
		});

		expect(result).toMatchObject({
			source: 'session_state',
			active_domains: [],
			skill_load_required: false
		});
		expect(result?.candidate_outcome_card_ids).toEqual(['project_slip_forecast']);
		expect(getSkillGateCandidateSkillIds(result)[0]).toBe('project_forecast');
	});

	it('does not add forecast as a secondary card for project audit wording', () => {
		const result = senseDomains({
			currentUserMessage: 'Audit project risk and stale work.'
		});

		expect(getSkillGateCandidateSkillIds(result)).toContain('project_audit');
		expect(getSkillGateCandidateSkillIds(result)).not.toContain('project_forecast');
	});

	it('does not treat generic health reviews as project health audits', () => {
		expect(
			senseDomains({
				currentUserMessage: 'Review this health insurance plan.'
			})
		).toBeNull();
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
		expect(getSkillGateCandidateSkillIds(result)).not.toContain('project_audit');
	});
});
