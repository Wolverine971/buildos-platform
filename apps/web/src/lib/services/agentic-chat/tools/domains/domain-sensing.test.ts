// apps/web/src/lib/services/agentic-chat/tools/domains/domain-sensing.test.ts
import { describe, expect, it } from 'vitest';
import { renderDomainSensingPromptBlock, senseDomains } from './domain-sensing';

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
			default_skill_id: 'content_strategy_beyond_blogging'
		});
		expect(result?.coverage_gap_skill_ids).toContain('youtube_channel_diagnostics');
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
