// apps/web/src/lib/services/agentic-chat/tools/domains/domain-session-state.test.ts
import { describe, expect, it } from 'vitest';
import { senseDomains } from './domain-sensing';
import {
	getActiveDomainIds,
	getNewDomainResearchBacklogEntries,
	mergeDomainSessionState,
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
		expect(state.research_backlog[0]?.user_need).toContain('diagnose channel growth blockers');
		expect(state.recent_observations[0]).toMatchObject({
			turn_run_id: 'turn-1',
			stream_run_id: 'stream-1',
			source: 'current_user_message'
		});
		expect(getActiveDomainIds(state)[0]).toBe('marketing.youtube_growth');
	});

	it('preserves first-seen time and increments continuing domains', () => {
		const first = senseDomains({ currentUserMessage: 'Grow my YouTube audience.' });
		if (!first) throw new Error('Expected first sensing');
		const initial = mergeDomainSessionState(null, first, {
			now: '2026-05-17T12:00:00.000Z'
		});

		const second = senseDomains({
			currentUserMessage: 'Ok, make the plan.',
			priorDomainIds: getActiveDomainIds(initial)
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
			}),
			expect.objectContaining({
				id: 'skill:youtube_channel_craft_for_founders'
			})
		]);
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
			recent_observations: []
		});

		expect(parsed?.active_domains).toHaveLength(1);
		expect(parsed?.research_backlog).toHaveLength(1);
		expect(getActiveDomainIds(parsed)).toEqual(['marketing.youtube_growth']);
	});
});
