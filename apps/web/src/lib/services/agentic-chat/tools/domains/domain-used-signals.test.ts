// apps/web/src/lib/services/agentic-chat/tools/domains/domain-used-signals.test.ts
import { describe, expect, it } from 'vitest';
import {
	deriveUsedDomainSignals,
	deriveUsedDomainSignalsFromEvents,
	deriveUsedDomainSignalsFromToolExecutions,
	getDomainIdsForSkillReference,
	type UsedDomainSignalToolExecution
} from './domain-used-signals';
import { mergeUsedDomainSignalsIntoSessionState } from './domain-session-state';

function execution(
	toolName: string,
	payload: unknown,
	options: { success?: boolean; turnRunId?: string; createdAt?: string } = {}
): UsedDomainSignalToolExecution {
	return {
		toolCall: {
			id: `${toolName}:1`,
			function: {
				name: toolName,
				arguments: '{}'
			}
		},
		result: {
			success: options.success ?? true,
			result: payload
		},
		turn_run_id: options.turnRunId,
		created_at: options.createdAt
	};
}

describe('domain used signal derivation', () => {
	it('derives used-domain signals from domain, outcome-card, and resource load payloads', () => {
		const signals = deriveUsedDomainSignalsFromToolExecutions(
			[
				execution('domain_load', {
					type: 'domain',
					domain_id: 'marketing.youtube_growth'
				}),
				execution('outcome_card_load', {
					type: 'outcome_card',
					id: 'youtube_growth_strategy_plan',
					domain_ids: ['marketing.youtube_growth', 'marketing.content_strategy']
				}),
				execution('work_capability_load', {
					type: 'work_capability',
					work_capability_id: 'youtube_growth_strategy_plan',
					domain_ids: ['marketing.youtube_growth']
				}),
				execution('resource_load', {
					type: 'resource',
					resource_id: 'youtube_library.marketing_and_content_combo_index',
					domain_ids: ['marketing.content_strategy']
				})
			],
			{ now: '2026-05-17T12:00:00.000Z', turnRunId: 'turn-1' }
		);

		expect(signals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					domain_id: 'marketing.youtube_growth',
					source: 'domain_load',
					tool_name: 'domain_load',
					turn_run_id: 'turn-1',
					first_seen_at: '2026-05-17T12:00:00.000Z',
					last_seen_at: '2026-05-17T12:00:00.000Z'
				}),
				expect.objectContaining({
					domain_id: 'marketing.content_strategy',
					source: 'outcome_card_load',
					tool_name: 'outcome_card_load',
					outcome_card_id: 'youtube_growth_strategy_plan'
				}),
				expect.objectContaining({
					domain_id: 'marketing.youtube_growth',
					source: 'outcome_card_load',
					tool_name: 'work_capability_load',
					outcome_card_id: 'youtube_growth_strategy_plan'
				}),
				expect.objectContaining({
					domain_id: 'marketing.content_strategy',
					source: 'resource_load',
					tool_name: 'resource_load',
					resource_id: 'youtube_library.marketing_and_content_combo_index'
				})
			])
		);
	});

	it('maps loaded skill payloads back to catalog domains and increments merged demand', () => {
		const mappedDomainIds = getDomainIdsForSkillReference('content_strategy_beyond_blogging');
		expect(mappedDomainIds).toEqual(
			expect.arrayContaining(['marketing.content_strategy', 'marketing.youtube_growth'])
		);

		const firstSignals = deriveUsedDomainSignalsFromToolExecutions(
			[
				execution('skill_load', {
					type: 'skill',
					id: 'content_strategy_beyond_blogging'
				})
			],
			{ turnRunId: 'turn-1' }
		);
		expect(firstSignals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					domain_id: 'marketing.youtube_growth',
					source: 'skill_load',
					tool_name: 'skill_load',
					skill_id: 'content_strategy_beyond_blogging',
					turn_run_id: 'turn-1'
				})
			])
		);

		const first = mergeUsedDomainSignalsIntoSessionState(null, firstSignals, {
			now: '2026-05-17T12:00:00.000Z'
		});
		const second = mergeUsedDomainSignalsIntoSessionState(
			first,
			deriveUsedDomainSignalsFromToolExecutions(
				[
					execution('skill_load', {
						type: 'skill',
						id: 'content_strategy_beyond_blogging'
					})
				],
				{ turnRunId: 'turn-2' }
			),
			{ now: '2026-05-17T12:05:00.000Z' }
		);

		const youtubeUsage = second.used_domains.find(
			(entry) =>
				entry.domain_id === 'marketing.youtube_growth' &&
				entry.source === 'skill_load' &&
				entry.skill_id === 'content_strategy_beyond_blogging'
		);
		expect(youtubeUsage).toMatchObject({
			first_seen_at: '2026-05-17T12:00:00.000Z',
			last_seen_at: '2026-05-17T12:05:00.000Z',
			occurrences: 2,
			turn_run_id: 'turn-2'
		});
	});

	it('falls back to outcome-card catalog domains for compact loaded-card payloads', () => {
		const signals = deriveUsedDomainSignalsFromToolExecutions([
			execution('outcome_card_load', {
				type: 'outcome_card',
				id: 'youtube_growth_strategy_plan'
			})
		]);

		expect(signals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					domain_id: 'marketing.youtube_growth',
					source: 'outcome_card_load',
					tool_name: 'outcome_card_load',
					outcome_card_id: 'youtube_growth_strategy_plan'
				}),
				expect.objectContaining({
					domain_id: 'marketing.content_strategy',
					source: 'outcome_card_load',
					outcome_card_id: 'youtube_growth_strategy_plan'
				}),
				expect.objectContaining({
					domain_id: 'creator_growth',
					source: 'outcome_card_load',
					outcome_card_id: 'youtube_growth_strategy_plan'
				})
			])
		);
	});

	it('uses skill-reference resource payloads and loaded skill events as fallback telemetry', () => {
		const resourceSignals = deriveUsedDomainSignalsFromToolExecutions([
			execution('resource_load', {
				type: 'skill_reference',
				skill_id: 'ui_ux_quality_review',
				reference_id: 'foundation_checks'
			})
		]);
		expect(resourceSignals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					domain_id: 'product_and_design.ui_ux_quality',
					source: 'resource_load',
					tool_name: 'resource_load',
					skill_id: 'ui_ux_quality_review',
					resource_id: 'foundation_checks'
				})
			])
		);

		const eventSignals = deriveUsedDomainSignalsFromEvents([
			{
				event_type: 'skill_activity',
				turn_run_id: 'turn-3',
				created_at: '2026-05-17T12:10:00.000Z',
				payload: {
					type: 'skill_activity',
					action: 'loaded',
					path: 'ui_ux_quality_review'
				}
			},
			{
				event_type: 'skill_loaded',
				payload: {
					path: 'content_strategy_beyond_blogging'
				}
			}
		]);

		expect(eventSignals).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					domain_id: 'product_and_design.ui_ux_quality',
					source: 'skill_loaded_event',
					skill_id: 'ui_ux_quality_review',
					turn_run_id: 'turn-3',
					first_seen_at: '2026-05-17T12:10:00.000Z'
				}),
				expect.objectContaining({
					domain_id: 'marketing.youtube_growth',
					source: 'skill_loaded_event',
					skill_id: 'content_strategy_beyond_blogging'
				})
			])
		);
	});

	it('dedupes repeated domains and ignores failed, malformed, not-found, and forbidden payloads', () => {
		const signals = deriveUsedDomainSignals({
			toolExecutions: [
				execution('outcome_card_load', {
					type: 'outcome_card',
					id: 'youtube_growth_strategy_plan',
					domain_ids: [
						'marketing.youtube_growth',
						'marketing.youtube_growth',
						'',
						'marketing.youtube_growth'
					]
				}),
				execution(
					'domain_load',
					{
						type: 'domain',
						domain_id: 'marketing.content_strategy'
					},
					{ success: false }
				),
				execution('skill_load', {
					type: 'not_found',
					skill: 'content_strategy_beyond_blogging'
				}),
				execution('resource_load', {
					type: 'forbidden',
					skill_id: 'ui_ux_quality_review',
					reference_id: 'foundation_checks'
				})
			],
			events: [
				{
					event_type: 'skill_activity',
					payload: {
						type: 'skill_activity',
						action: 'requested',
						path: 'ui_ux_quality_review'
					}
				}
			]
		});

		expect(signals).toEqual([
			expect.objectContaining({
				domain_id: 'marketing.youtube_growth',
				source: 'outcome_card_load',
				outcome_card_id: 'youtube_growth_strategy_plan'
			})
		]);
	});
});
