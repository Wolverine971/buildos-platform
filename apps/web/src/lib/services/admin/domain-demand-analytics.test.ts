// apps/web/src/lib/services/admin/domain-demand-analytics.test.ts
import { describe, expect, it } from 'vitest';
import { senseDomains } from '$lib/services/agentic-chat/tools/domains/domain-sensing';
import { mergeDomainSessionState } from '$lib/services/agentic-chat/tools/domains/domain-session-state';
import { buildDomainDemandAnalytics, type DomainDemandSessionRow } from './domain-demand-analytics';

function row(
	overrides: Partial<DomainDemandSessionRow> & { id: string; user_id?: string | null }
): DomainDemandSessionRow {
	return {
		id: overrides.id,
		user_id: overrides.user_id ?? 'user-1',
		created_at: '2026-05-17T12:00:00.000Z',
		updated_at: '2026-05-17T12:00:00.000Z',
		agent_metadata: {},
		...overrides
	};
}

function domainMetadata(message: string, now: string): Record<string, unknown> {
	const sensed = senseDomains({ currentUserMessage: message });
	if (!sensed) throw new Error(`Expected domain sensing for ${message}`);
	return {
		fastchat_domain_state: mergeDomainSessionState(null, sensed, { now })
	};
}

describe('buildDomainDemandAnalytics', () => {
	it('aggregates active domains, gaps, and research backlog from session metadata', () => {
		const payload = buildDomainDemandAnalytics(
			[
				row({
					id: 'session-1',
					user_id: 'user-1',
					agent_metadata: domainMetadata(
						'I want to grow my YouTube audience.',
						'2026-05-17T12:00:00.000Z'
					)
				}),
				row({
					id: 'session-2',
					user_id: 'user-2',
					agent_metadata: domainMetadata(
						'Can you review our LinkedIn Company Page growth plan?',
						'2026-05-17T13:00:00.000Z'
					)
				}),
				row({ id: 'session-empty', user_id: 'user-3' })
			],
			{
				now: '2026-05-17T14:00:00.000Z',
				startDate: '2026-05-10T00:00:00.000Z',
				endDate: '2026-05-17T14:00:00.000Z'
			}
		);

		expect(payload.data_source).toMatchObject({
			row_count: 3,
			sessions_with_domain_state: 2,
			generated_at: '2026-05-17T14:00:00.000Z'
		});
		expect(payload.overview.total_domains).toBeGreaterThanOrEqual(2);
		expect(payload.overview.total_research_backlog_items).toBeGreaterThanOrEqual(1);
		expect(payload.overview.partial_or_no_coverage_sessions).toBe(2);

		const youtube = payload.domains.find(
			(domain) => domain.domain_id === 'marketing.youtube_growth'
		);
		expect(youtube).toMatchObject({
			coverage_status: 'partial'
		});
		expect(youtube?.unique_sessions).toBeGreaterThanOrEqual(1);
		expect(youtube?.unique_users).toBeGreaterThanOrEqual(1);
		expect(youtube?.gap_skill_ids).toContain('youtube_channel_diagnostics');
		expect(youtube?.research_backlog_ids).toContain('skill:youtube_channel_diagnostics');

		const backlog = payload.research_backlog.find(
			(entry) => entry.id === 'skill:youtube_channel_diagnostics'
		);
		expect(backlog).toMatchObject({
			kind: 'skill',
			status: 'queued',
			priority: 'medium',
			missing_skill_id: 'youtube_channel_diagnostics'
		});
		expect(backlog?.unique_sessions).toBeGreaterThanOrEqual(1);
		expect(backlog?.unique_users).toBeGreaterThanOrEqual(1);
		expect(backlog?.domain_ids).toContain('marketing.youtube_growth');
		expect(backlog?.user_need).toContain('diagnose channel growth blockers');

		const queueCandidate = payload.research_queue_candidates.find(
			(candidate) => candidate.queue_key === 'skill:youtube_channel_diagnostics'
		);
		expect(queueCandidate).toMatchObject({
			kind: 'skill',
			status: 'queued',
			missing_skill_id: 'youtube_channel_diagnostics',
			budget: expect.objectContaining({
				idempotencyKey: 'skill:youtube_channel_diagnostics'
			})
		});

		expect(payload.coverage_gaps).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'skill:youtube_channel_diagnostics',
					missing_skill_id: 'youtube_channel_diagnostics'
				})
			])
		);
	});

	it('combines repeated backlog entries across sessions and users', () => {
		const metadataA = domainMetadata(
			'I want to grow my YouTube audience.',
			'2026-05-17T12:00:00.000Z'
		);
		const metadataB = domainMetadata(
			'Help me grow my YouTube channel.',
			'2026-05-17T13:00:00.000Z'
		);

		const payload = buildDomainDemandAnalytics([
			row({ id: 'session-1', user_id: 'user-1', agent_metadata: metadataA }),
			row({ id: 'session-2', user_id: 'user-2', agent_metadata: metadataB })
		]);

		const backlog = payload.research_backlog.find(
			(entry) => entry.id === 'skill:youtube_channel_diagnostics'
		);
		expect(backlog).toMatchObject({
			total_occurrences: 2,
			unique_sessions: 2,
			unique_users: 2
		});
		expect(payload.research_backlog[0]?.priority).toBe('medium');
	});
});
