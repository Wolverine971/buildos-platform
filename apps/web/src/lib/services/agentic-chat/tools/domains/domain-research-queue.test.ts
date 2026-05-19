// apps/web/src/lib/services/agentic-chat/tools/domains/domain-research-queue.test.ts
import { describe, expect, it } from 'vitest';
import { senseDomains } from './domain-sensing';
import { mergeDomainSessionState, type DomainSessionState } from './domain-session-state';
import {
	buildDomainResearchQueuePromotionPlan,
	buildDomainResearchQueueCandidatesFromSessionRows,
	buildDomainResearchQueueCandidatesFromSessionState
} from './domain-research-queue';

function domainState(message: string, now: string): DomainSessionState {
	const sensed = senseDomains({ currentUserMessage: message });
	if (!sensed) throw new Error(`Expected domain sensing for ${message}`);
	return mergeDomainSessionState(null, sensed, { now });
}

describe('domain research queue candidates', () => {
	it('converts session research backlog into queueable rows', () => {
		const state = domainState(
			'I want to grow my YouTube audience.',
			'2026-05-17T12:00:00.000Z'
		);

		const candidates = buildDomainResearchQueueCandidatesFromSessionState(state, {
			sessionId: '11111111-1111-4111-8111-111111111111',
			userId: '22222222-2222-4222-8222-222222222222'
		});

		const diagnostics = candidates.find(
			(candidate) => candidate.queue_key === 'skill:youtube_channel_diagnostics'
		);
		expect(diagnostics).toMatchObject({
			queue_key: 'skill:youtube_channel_diagnostics',
			kind: 'skill',
			status: 'queued',
			priority: 'medium',
			missing_skill_id: 'youtube_channel_diagnostics',
			domain_ids: expect.arrayContaining(['marketing.youtube_growth']),
			source_session_ids: ['11111111-1111-4111-8111-111111111111'],
			source_user_count: 1,
			occurrences: 1,
			first_seen_at: '2026-05-17T12:00:00.000Z',
			last_seen_at: '2026-05-17T12:00:00.000Z'
		});
		expect(diagnostics?.budget).toMatchObject({
			maxDepth: 2,
			maxQueries: 8,
			idempotencyKey: 'skill:youtube_channel_diagnostics'
		});
		expect(diagnostics?.evidence[0]).toMatchObject({
			type: 'domain_session_backlog',
			session_id: '11111111-1111-4111-8111-111111111111',
			user_id: '22222222-2222-4222-8222-222222222222',
			occurrences: 1
		});
	});

	it('merges repeated backlog demand across sessions and users', () => {
		const first = domainState(
			'I want to grow my YouTube audience.',
			'2026-05-17T12:00:00.000Z'
		);
		const secondInitial = domainState(
			'Help me grow my YouTube channel.',
			'2026-05-17T13:00:00.000Z'
		);
		const secondSensed = senseDomains({
			currentUserMessage: 'Now diagnose the blockers.',
			priorDomainIds: ['marketing.youtube_growth'],
			priorWorkCapabilityIds: ['youtube_growth_strategy_plan']
		});
		if (!secondSensed) throw new Error('Expected continuing domain sensing');
		const second = mergeDomainSessionState(secondInitial, secondSensed, {
			now: '2026-05-17T13:05:00.000Z'
		});

		const candidates = buildDomainResearchQueueCandidatesFromSessionRows([
			{
				id: '11111111-1111-4111-8111-111111111111',
				user_id: '22222222-2222-4222-8222-222222222222',
				agent_metadata: { fastchat_domain_state: first }
			},
			{
				id: '33333333-3333-4333-8333-333333333333',
				user_id: '44444444-4444-4444-8444-444444444444',
				agent_metadata: { fastchat_domain_state: second }
			}
		]);

		const diagnostics = candidates.find(
			(candidate) => candidate.queue_key === 'skill:youtube_channel_diagnostics'
		);
		expect(diagnostics).toMatchObject({
			source_session_ids: [
				'11111111-1111-4111-8111-111111111111',
				'33333333-3333-4333-8333-333333333333'
			],
			source_user_count: 2,
			occurrences: 3,
			first_seen_at: '2026-05-17T12:00:00.000Z',
			last_seen_at: '2026-05-17T13:05:00.000Z'
		});
		expect(diagnostics?.evidence).toHaveLength(2);
	});

	it('keeps invalid session ids out of uuid queue fields', () => {
		const state = domainState(
			'I want to grow my YouTube audience.',
			'2026-05-17T12:00:00.000Z'
		);

		const candidates = buildDomainResearchQueueCandidatesFromSessionState(state, {
			sessionId: 'not-a-uuid',
			userId: 'user-1'
		});

		expect(candidates[0]?.source_session_ids).toEqual([]);
		expect(candidates[0]?.evidence[0]?.session_id).toBeUndefined();
	});

	it('plans idempotent promotion against existing queue rows', () => {
		const state = domainState(
			'I want to grow my YouTube audience.',
			'2026-05-17T12:00:00.000Z'
		);
		const [candidate] = buildDomainResearchQueueCandidatesFromSessionState(state, {
			sessionId: '11111111-1111-4111-8111-111111111111',
			userId: '22222222-2222-4222-8222-222222222222'
		});
		if (!candidate) throw new Error('Expected queue candidate');

		const initialPlan = buildDomainResearchQueuePromotionPlan([candidate]);
		expect(initialPlan.inserted_queue_keys).toContain(candidate.queue_key);

		const repeatPlan = buildDomainResearchQueuePromotionPlan([candidate], initialPlan.rows);
		expect(repeatPlan.updated_queue_keys).toContain(candidate.queue_key);
		expect(repeatPlan.rows[0]?.occurrences).toBe(candidate.occurrences);

		const terminalPlan = buildDomainResearchQueuePromotionPlan(
			[candidate],
			[{ ...initialPlan.rows[0]!, status: 'approved' }]
		);
		expect(terminalPlan.rows).toEqual([]);
		expect(terminalPlan.skipped_terminal_queue_keys).toEqual([candidate.queue_key]);
	});

	it('returns no candidates when there is no domain research backlog', () => {
		expect(buildDomainResearchQueueCandidatesFromSessionRows([])).toEqual([]);
		expect(
			buildDomainResearchQueueCandidatesFromSessionRows([
				{
					id: '11111111-1111-4111-8111-111111111111',
					user_id: '22222222-2222-4222-8222-222222222222',
					agent_metadata: {}
				}
			])
		).toEqual([]);
	});
});
