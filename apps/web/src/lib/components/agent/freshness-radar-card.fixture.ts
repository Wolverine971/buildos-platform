// apps/web/src/lib/components/agent/freshness-radar-card.fixture.ts
// Test fixture: a freshness card shaped exactly like plan §3 FreshnessCardPayloadV1.
import type { FreshnessCardPayloadV1 } from '@buildos/shared-types';

export function freshnessCardFixture(
	overrides: Partial<FreshnessCardPayloadV1> = {}
): FreshnessCardPayloadV1 {
	return {
		version: 'freshness_card_v1',
		scanId: 'scan-1',
		projectId: 'project-1',
		projectName: 'Launch',
		createdAt: '2026-09-18T15:01:00.000Z',
		headline: '3 things may be out of date',
		moreCount: 2,
		items: [
			{
				flagId: 'flag-task',
				entity: { kind: 'task', id: 'task-1', title: 'Send investor deck' },
				probability: 0.93,
				disposition: 'drafted',
				proposal: { summary: 'Mark done', field: 'state_key', from: 'todo', to: 'done' },
				evidenceExcerpt: 'sent the deck to Maya this morning',
				draftInChatPrompt: null
			},
			{
				flagId: 'flag-milestone',
				entity: { kind: 'milestone', id: 'ms-1', title: 'Pricing page live' },
				probability: 0.81,
				disposition: 'drafted',
				proposal: {
					summary: 'Due Oct 3 (was Sep 26)',
					field: 'due_at',
					from: '2026-09-26',
					to: '2026-10-03'
				},
				evidenceExcerpt: 'pricing moves to Oct 3',
				draftInChatPrompt: null
			},
			{
				flagId: 'flag-doc',
				entity: { kind: 'document', id: 'doc-1', title: 'Launch plan' },
				probability: 0.72,
				disposition: 'surfaced',
				proposal: null,
				evidenceExcerpt: 'we dropped the webinar',
				draftInChatPrompt: null
			}
		],
		bundle: { suggestionId: 'bundle-1', operationCount: 2 },
		autoApplied: [
			{
				flagId: 'flag-auto',
				entity: { kind: 'task', id: 'task-2', title: 'Book venue' },
				summary: 'Marked in progress',
				undoableUntil: '2026-09-21T15:01:00.000Z'
			}
		],
		inboxCleanup: {
			retired: [{ flagId: 'flag-retired', title: 'Reorganize launch docs' }],
			possiblyStaleCount: 2
		},
		gaugeChanges: [
			{
				entity: { kind: 'milestone', id: 'ms-1', title: 'Pricing page live' },
				from: 'on_track',
				to: 'at_risk'
			}
		],
		...overrides
	};
}

export function freshnessCardMetadata(card: FreshnessCardPayloadV1) {
	return {
		source: 'freshness_radar',
		kind: 'freshness_radar_card',
		freshness_scan_id: card.scanId,
		idempotency_key: `freshness-scan:${card.scanId}:card`,
		card
	};
}
