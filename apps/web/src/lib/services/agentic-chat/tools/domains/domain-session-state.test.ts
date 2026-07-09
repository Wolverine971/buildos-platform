// apps/web/src/lib/services/agentic-chat/tools/domains/domain-session-state.test.ts
import { describe, expect, it } from 'vitest';
import { senseDomains, type DomainSensingResult } from './domain-sensing';
import {
	deriveLoadedOutcomeCardGapSignalsFromToolExecutions,
	getActiveDomainIds,
	getActiveOutcomeCardIds,
	getActiveWorkCapabilityIds,
	getNewDomainResearchBacklogEntries,
	mergeDomainSessionState,
	mergeLoadedOutcomeCardGapsIntoSessionState,
	mergeUnknownDomainInterestsIntoSessionState,
	mergeUsedDomainSignalsIntoSessionState,
	mergeWorkflowGapCandidatesIntoSessionState,
	readDomainSessionState
} from './domain-session-state';

describe('domain session state', () => {
	it('merges sensed domains into compact session metadata', () => {
		const sensed = senseDomains({
			currentUserMessage: 'I want to grow my YouTube audience.'
		});
		if (!sensed) throw new Error('Expected sensed domains');

		const state = mergeDomainSessionState(null, sensed, {
			now: '2026-05-17T12:00:00.000Z',
			turnRunId: 'turn-1',
			streamRunId: 'stream-1'
		});

		expect(state.active_domains[0]).toMatchObject({
			id: 'marketing.youtube_growth',
			occurrences: 1
		});
		expect(state.active_outcome_cards[0]).toMatchObject({
			id: 'youtube_growth_strategy_plan',
			occurrences: 1,
			default_skill_id: 'content_strategy_beyond_blogging'
		});
		expect(state.coverage_gaps.map((gap) => gap.missing_skill_id)).toContain(
			'youtube_channel_diagnostics'
		);
		expect(state.research_backlog).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'skill:youtube_channel_diagnostics',
					kind: 'skill',
					status: 'queued',
					priority: 'medium',
					missing_skill_id: 'youtube_channel_diagnostics',
					domain_ids: expect.arrayContaining(['marketing.youtube_growth'])
				})
			])
		);
		const youtubeBacklog = state.research_backlog.find(
			(entry) => entry.id === 'skill:youtube_channel_diagnostics'
		);
		expect(youtubeBacklog?.occurrences).toBe(1);
		expect(youtubeBacklog?.user_need).toContain('diagnose channel growth blockers');
		expect(state.recent_observations[0]).toMatchObject({
			turn_run_id: 'turn-1',
			stream_run_id: 'stream-1',
			source: 'current_user_message'
		});
		expect(state.recent_observations[0]?.candidate_outcome_card_ids).toContain(
			'youtube_growth_strategy_plan'
		);
		expect(getActiveDomainIds(state)[0]).toBe('marketing.youtube_growth');
		expect(getActiveOutcomeCardIds(state)[0]).toBe('youtube_growth_strategy_plan');
		expect(getActiveWorkCapabilityIds(state)[0]).toBe('youtube_growth_strategy_plan');
	});

	it('preserves first-seen time and increments continuing domains', () => {
		const first = senseDomains({ currentUserMessage: 'Grow my YouTube audience.' });
		if (!first) throw new Error('Expected first sensing');
		const initial = mergeDomainSessionState(null, first, {
			now: '2026-05-17T12:00:00.000Z'
		});

		const second = senseDomains({
			currentUserMessage: 'Ok, make the plan.',
			priorDomainIds: getActiveDomainIds(initial),
			priorOutcomeCardIds: getActiveOutcomeCardIds(initial)
		});
		if (!second) throw new Error('Expected second sensing');
		const next = mergeDomainSessionState(initial, second, {
			now: '2026-05-17T12:05:00.000Z'
		});

		expect(next.active_domains[0]).toMatchObject({
			id: 'marketing.youtube_growth',
			first_seen_at: '2026-05-17T12:00:00.000Z',
			last_seen_at: '2026-05-17T12:05:00.000Z',
			occurrences: 2
		});
		expect(next.research_backlog[0]).toMatchObject({
			id: 'skill:youtube_channel_diagnostics',
			first_seen_at: '2026-05-17T12:00:00.000Z',
			last_seen_at: '2026-05-17T12:05:00.000Z',
			occurrences: 2
		});
		expect(next.active_outcome_cards[0]).toMatchObject({
			id: 'youtube_growth_strategy_plan',
			first_seen_at: '2026-05-17T12:00:00.000Z',
			last_seen_at: '2026-05-17T12:05:00.000Z',
			occurrences: 2
		});
		expect(getNewDomainResearchBacklogEntries(next, initial)).toEqual([]);
		expect(next.recent_observations).toHaveLength(2);
		expect(next.recent_observations[0]?.source).toBe('session_state');
	});

	it('reports newly queued domain research backlog entries', () => {
		const sensed = senseDomains({ currentUserMessage: 'Grow my YouTube audience.' });
		if (!sensed) throw new Error('Expected sensing');
		const next = mergeDomainSessionState(null, sensed, {
			now: '2026-05-17T12:00:00.000Z'
		});

		expect(getNewDomainResearchBacklogEntries(next, null)).toEqual([
			expect.objectContaining({
				id: 'skill:youtube_channel_diagnostics'
			})
		]);
	});

	it('promotes outcome-card-only gaps into session backlog without domain duplication', () => {
		const sensed: DomainSensingResult = {
			type: 'domain_sensing',
			source: 'current_user_message',
			query: 'Create a newsletter retention diagnostic.',
			active_domains: [
				{
					id: 'marketing.content_strategy',
					name: 'Content Strategy',
					confidence: 0.8,
					coverage_status: 'strong',
					parent_ids: ['marketing'],
					aliases_hit: ['content strategy'],
					skill_ids: ['content_strategy_beyond_blogging'],
					outcome_card_ids: ['newsletter_retention_review'],
					recommended_skill_stack_ids: [],
					gaps: [],
					gap_skill_ids: [],
					gap_resource_ids: []
				}
			],
			candidate_outcome_cards: [
				{
					id: 'newsletter_retention_review',
					name: 'Newsletter Retention Review',
					confidence: 0.82,
					summary: 'Diagnose newsletter retention.',
					domain_ids: ['marketing.content_strategy'],
					buildos_capability_ids: ['planning', 'documents'],
					default_skill_id: 'content_strategy_beyond_blogging',
					skill_ids: ['content_strategy_beyond_blogging'],
					skill_load_formats: {
						content_strategy_beyond_blogging: 'full'
					},
					coverage_status: 'partial',
					gaps: [
						{
							missing_skill_id: 'newsletter_retention_diagnostics',
							user_need: 'diagnose retention and churn in a newsletter funnel',
							summary:
								'No dedicated newsletter retention diagnostics skill exists yet.'
						}
					],
					gap_skill_ids: ['newsletter_retention_diagnostics'],
					gap_resource_ids: [],
					load_hint: 'Load when retention diagnostics are needed.'
				}
			],
			candidate_outcome_card_ids: ['newsletter_retention_review'],
			recommended_skill_ids: ['content_strategy_beyond_blogging'],
			coverage_gap_skill_ids: ['newsletter_retention_diagnostics'],
			coverage_gap_resource_ids: [],
			skill_load_required: true,
			next_step: 'Use the outcome card gap.'
		};

		const state = mergeDomainSessionState(null, sensed, {
			now: '2026-05-17T12:00:00.000Z'
		});

		expect(state.coverage_gaps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					missing_skill_id: 'newsletter_retention_diagnostics',
					domain_ids: ['marketing.content_strategy'],
					occurrences: 1
				})
			])
		);
		expect(state.research_backlog).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'skill:newsletter_retention_diagnostics',
					kind: 'skill',
					priority: 'medium',
					domain_ids: ['marketing.content_strategy'],
					missing_skill_id: 'newsletter_retention_diagnostics',
					user_need: 'diagnose retention and churn in a newsletter funnel'
				})
			])
		);
	});

	it('merges gaps from loaded outcome-card tool results after tool execution', () => {
		const signals = deriveLoadedOutcomeCardGapSignalsFromToolExecutions([
			{
				toolCall: {
					function: {
						name: 'outcome_card_load'
					}
				},
				result: {
					success: true,
					result: {
						type: 'outcome_card',
						id: 'newsletter_retention_review',
						domain_ids: ['marketing.content_strategy'],
						coverage_status: 'partial',
						gaps: [
							{
								missing_skill_id: 'newsletter_retention_diagnostics',
								user_need: 'diagnose retention and churn in a newsletter funnel',
								summary:
									'No dedicated newsletter retention diagnostics skill exists yet.'
							}
						]
					}
				}
			},
			{
				toolCall: {
					function: {
						name: 'work_capability_load'
					}
				},
				result: {
					success: true,
					result: {
						type: 'outcome_card',
						work_capability_id: 'newsletter_retention_review',
						domain_ids: ['marketing.content_strategy'],
						coverage_status: 'partial',
						gaps: [
							{
								missing_skill_id: 'newsletter_retention_diagnostics',
								user_need: 'diagnose retention and churn in a newsletter funnel',
								summary:
									'No dedicated newsletter retention diagnostics skill exists yet.'
							}
						]
					}
				}
			},
			{
				toolCall: {
					function: {
						name: 'outcome_card_load'
					}
				},
				result: {
					success: false,
					result: {
						type: 'outcome_card',
						id: 'ignored',
						domain_ids: ['marketing.content_strategy'],
						gaps: [
							{
								missing_skill_id: 'ignored_gap',
								user_need: 'ignored',
								summary: 'ignored'
							}
						]
					}
				}
			}
		]);

		expect(signals).toHaveLength(2);
		const state = mergeLoadedOutcomeCardGapsIntoSessionState(null, signals, {
			now: '2026-05-17T12:00:00.000Z'
		});

		expect(state.coverage_gaps).toEqual([
			expect.objectContaining({
				missing_skill_id: 'newsletter_retention_diagnostics',
				domain_ids: ['marketing.content_strategy'],
				occurrences: 1
			})
		]);
		expect(state.research_backlog).toEqual([
			expect.objectContaining({
				id: 'skill:newsletter_retention_diagnostics',
				priority: 'medium',
				occurrences: 1
			})
		]);
	});

	it('falls back to outcome-card catalog metadata for compact loaded-card payloads', () => {
		const signals = deriveLoadedOutcomeCardGapSignalsFromToolExecutions([
			{
				toolCall: {
					function: {
						name: 'outcome_card_load'
					}
				},
				result: {
					success: true,
					result: {
						type: 'outcome_card',
						id: 'youtube_growth_strategy_plan'
					}
				}
			}
		]);

		expect(signals).toEqual([
			expect.objectContaining({
				outcome_card_id: 'youtube_growth_strategy_plan',
				domain_ids: [
					'marketing.youtube_growth',
					'marketing.content_strategy',
					'creator_growth'
				],
				coverage_status: 'partial',
				missing_skill_id: 'youtube_channel_diagnostics'
			})
		]);

		const state = mergeLoadedOutcomeCardGapsIntoSessionState(null, signals, {
			now: '2026-05-17T12:00:00.000Z'
		});

		expect(state.research_backlog).toEqual([
			expect.objectContaining({
				id: 'skill:youtube_channel_diagnostics',
				priority: 'medium',
				domain_ids: [
					'marketing.youtube_growth',
					'marketing.content_strategy',
					'creator_growth'
				]
			})
		]);
	});

	it('preserves domain signal extension arrays during sensed-domain merges', () => {
		const base = mergeUsedDomainSignalsIntoSessionState(
			null,
			[
				{
					domain_id: 'marketing.youtube_growth',
					source: 'skill_load',
					tool_name: 'skill_load',
					skill_id: 'content_strategy_beyond_blogging'
				}
			],
			{ now: '2026-05-17T12:00:00.000Z' }
		);
		const sensed = senseDomains({ currentUserMessage: 'Grow my YouTube audience.' });
		if (!sensed) throw new Error('Expected sensing');

		const next = mergeDomainSessionState(base, sensed, {
			now: '2026-05-17T12:05:00.000Z'
		});

		expect(next.used_domains).toEqual(base.used_domains);
	});

	it('reads only valid prior state records from metadata', () => {
		const parsed = readDomainSessionState({
			updated_at: '2026-05-17T12:00:00.000Z',
			active_domains: [
				{
					id: 'marketing.youtube_growth',
					name: 'YouTube Growth',
					coverage_status: 'partial',
					confidence: 0.8,
					first_seen_at: '2026-05-17T12:00:00.000Z',
					last_seen_at: '2026-05-17T12:00:00.000Z',
					occurrences: 1,
					skill_ids: ['content_strategy_beyond_blogging'],
					gap_skill_ids: ['youtube_channel_diagnostics']
				},
				{ id: 'broken' }
			],
			active_work_capabilities: [
				{
					id: 'youtube_growth_strategy_plan',
					name: 'YouTube Growth Strategy Plan',
					coverage_status: 'partial',
					confidence: 0.8,
					first_seen_at: '2026-05-17T12:00:00.000Z',
					last_seen_at: '2026-05-17T12:00:00.000Z',
					occurrences: 1,
					domain_ids: ['marketing.youtube_growth'],
					default_skill_id: 'content_strategy_beyond_blogging',
					skill_ids: ['content_strategy_beyond_blogging']
				},
				{ id: 'broken' }
			],
			coverage_gaps: [],
			research_backlog: [
				{
					id: 'skill:youtube_channel_diagnostics',
					kind: 'skill',
					status: 'queued',
					priority: 'medium',
					domain_ids: ['marketing.youtube_growth'],
					missing_skill_id: 'youtube_channel_diagnostics',
					user_need: 'diagnose channel blockers',
					summary: 'No channel diagnostics skill exists.',
					first_seen_at: '2026-05-17T12:00:00.000Z',
					last_seen_at: '2026-05-17T12:00:00.000Z',
					occurrences: 1
				},
				{ id: 'broken', status: 'queued' }
			],
			used_domains: [
				{
					domain_id: 'marketing.youtube_growth',
					source: 'skill_load',
					tool_name: 'skill_load',
					skill_id: 'content_strategy_beyond_blogging',
					first_seen_at: '2026-05-17T12:00:00.000Z',
					last_seen_at: '2026-05-17T12:05:00.000Z',
					occurrences: 2
				},
				{ domain_id: 'broken' }
			],
			unknown_domain_interests: [
				{
					interest_key: 'customer-success-playbooks',
					label: 'Customer success playbooks',
					query_preview: 'Build a customer success renewal playbook',
					reason: 'no_catalog_match',
					confidence: 0.7,
					first_seen_at: '2026-05-17T12:00:00.000Z',
					last_seen_at: '2026-05-17T12:05:00.000Z',
					occurrences: 1,
					example_queries: ['Build a customer success renewal playbook']
				},
				{ interest_key: 'broken' }
			],
			workflow_gap_candidates: [
				{
					queue_key: 'domain:unknown:customer-success-playbooks',
					kind: 'domain',
					domain_ids: [],
					label: 'Customer success playbooks',
					user_need: 'Create a renewal playbook.',
					summary: 'Repeated customer success workflow demand without a domain.',
					source: 'unknown_domain_interest',
					priority: 'medium',
					first_seen_at: '2026-05-17T12:00:00.000Z',
					last_seen_at: '2026-05-17T12:05:00.000Z',
					occurrences: 1
				},
				{ queue_key: 'broken' }
			],
			recent_observations: []
		});

		expect(parsed?.active_domains).toHaveLength(1);
		expect(parsed?.active_outcome_cards).toHaveLength(1);
		expect(parsed?.research_backlog).toHaveLength(1);
		expect(parsed?.used_domains).toHaveLength(1);
		expect(parsed?.unknown_domain_interests).toHaveLength(1);
		expect(parsed?.workflow_gap_candidates).toHaveLength(1);
		expect(getActiveDomainIds(parsed)).toEqual(['marketing.youtube_growth']);
		expect(getActiveWorkCapabilityIds(parsed)).toEqual(['youtube_growth_strategy_plan']);
	});

	it('merges used-domain signals by stable source key and bounds retained entries', () => {
		const first = mergeUsedDomainSignalsIntoSessionState(
			null,
			[
				{
					domain_id: 'marketing.youtube_growth',
					source: 'skill_load',
					tool_name: 'skill_load',
					skill_id: 'content_strategy_beyond_blogging',
					turn_run_id: 'turn-1',
					occurrences: 2
				}
			],
			{ now: '2026-05-17T12:00:00.000Z' }
		);

		const second = mergeUsedDomainSignalsIntoSessionState(
			first,
			[
				{
					domain_id: 'marketing.youtube_growth',
					source: 'skill_load',
					tool_name: 'skill_load',
					skill_id: 'content_strategy_beyond_blogging',
					turn_run_id: 'turn-2'
				},
				...Array.from({ length: 30 }, (_, index) => ({
					domain_id: `domain.${index}`,
					source: 'domain_load' as const,
					tool_name: 'domain_load'
				}))
			],
			{ now: '2026-05-17T12:05:00.000Z' }
		);

		const youtubeUsage = second.used_domains.find(
			(entry) => entry.skill_id === 'content_strategy_beyond_blogging'
		);
		expect(youtubeUsage).toMatchObject({
			domain_id: 'marketing.youtube_growth',
			first_seen_at: '2026-05-17T12:00:00.000Z',
			last_seen_at: '2026-05-17T12:05:00.000Z',
			turn_run_id: 'turn-2',
			occurrences: 3
		});
		expect(second.used_domains.length).toBeLessThanOrEqual(24);
	});

	it('merges unknown domain interests with capped examples', () => {
		const first = mergeUnknownDomainInterestsIntoSessionState(
			null,
			[
				{
					interest_key: 'customer-success-playbooks',
					label: 'Customer success playbooks',
					query_preview: 'Build a customer success renewal playbook',
					reason: 'no_catalog_match',
					confidence: 0.8,
					example_queries: [
						'Build a customer success renewal playbook',
						'Create a churn save workflow'
					]
				}
			],
			{ now: '2026-05-17T12:00:00.000Z' }
		);

		const second = mergeUnknownDomainInterestsIntoSessionState(
			first,
			[
				{
					interest_key: 'customer-success-playbooks',
					label: 'Customer success playbooks',
					query_preview: 'Score our renewal risk workflow',
					reason: 'no_catalog_match',
					confidence: 0.65,
					example_queries: [
						'Score our renewal risk workflow',
						'Draft an expansion account plan',
						'Compare CSM handoff playbooks',
						'Build a QBR workflow',
						'Plan a customer health audit'
					]
				}
			],
			{ now: '2026-05-17T12:05:00.000Z' }
		);

		expect(second.unknown_domain_interests[0]).toMatchObject({
			interest_key: 'customer-success-playbooks',
			query_preview: 'Score our renewal risk workflow',
			confidence: 0.8,
			first_seen_at: '2026-05-17T12:00:00.000Z',
			last_seen_at: '2026-05-17T12:05:00.000Z',
			occurrences: 2
		});
		expect(second.unknown_domain_interests[0]?.example_queries).toHaveLength(5);
		expect(second.unknown_domain_interests[0]?.example_queries[0]).toBe(
			'Score our renewal risk workflow'
		);
	});

	it('merges workflow gap candidates by queue key with highest priority', () => {
		const first = mergeWorkflowGapCandidatesIntoSessionState(
			null,
			[
				{
					queue_key: 'domain:agent-engineering:coverage-gap',
					kind: 'domain',
					domain_ids: ['agent.engineering'],
					label: 'Agent engineering workflows',
					user_need: 'Audit agent workflow reliability.',
					summary: 'Partial domain demand without a concrete workflow lane.',
					source: 'partial_domain_without_gap',
					priority: 'low'
				}
			],
			{ now: '2026-05-17T12:00:00.000Z' }
		);

		const second = mergeWorkflowGapCandidatesIntoSessionState(
			first,
			[
				{
					queue_key: 'domain:agent-engineering:coverage-gap',
					kind: 'domain',
					domain_ids: ['agent.engineering', 'product.operations'],
					label: 'Agent engineering workflows',
					user_need: 'Create an agent evaluation workflow.',
					summary: 'Repeated demand with no named process.',
					source: 'missing_process',
					priority: 'high'
				}
			],
			{ now: '2026-05-17T12:05:00.000Z' }
		);

		expect(second.workflow_gap_candidates[0]).toMatchObject({
			queue_key: 'domain:agent-engineering:coverage-gap',
			priority: 'high',
			first_seen_at: '2026-05-17T12:00:00.000Z',
			last_seen_at: '2026-05-17T12:05:00.000Z',
			occurrences: 2,
			domain_ids: ['agent.engineering', 'product.operations']
		});
	});
});
