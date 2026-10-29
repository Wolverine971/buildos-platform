// apps/web/src/lib/components/inbox/inbox-presentation.test.ts
import { describe, expect, it } from 'vitest';
import {
	formatInboxAttentionSummary,
	formatInboxGroupWorkload,
	formatInboxSourceLabel,
	orderInboxGroups
} from './inbox-presentation';

describe('formatInboxAttentionSummary', () => {
	it('states the visible and held workload separately', () => {
		expect(formatInboxAttentionSummary({ loaded: 19, total: 19, held: 41 })).toBe(
			'19 items need attention · 41 held for later'
		);
	});

	it('keeps bounded-page context without hiding held items', () => {
		expect(formatInboxAttentionSummary({ loaded: 25, total: 60, held: 12 })).toBe(
			'Showing 25 of 60 needing attention · 12 held for later'
		);
	});

	it('uses singular grammar and omits an empty held queue', () => {
		expect(formatInboxAttentionSummary({ loaded: 1, total: 1, held: 0 })).toBe(
			'1 item needs attention'
		);
	});

	it('still discloses held work when no item is currently admitted', () => {
		expect(formatInboxAttentionSummary({ loaded: 0, total: 0, held: 3 })).toBe(
			'No items need attention · 3 held for later'
		);
	});
});

describe('formatInboxSourceLabel', () => {
	it('names the project cleanup card and keeps existing labels', () => {
		expect(formatInboxSourceLabel('project_cleanup')).toBe('Project cleanup');
		expect(formatInboxSourceLabel('project_audit')).toBe('Project audit');
		expect(formatInboxSourceLabel('integration_attention')).toBe('Gmail access');
		expect(formatInboxSourceLabel('project_suggestion')).toBe('Project review');
		expect(formatInboxSourceLabel('something_new')).toBe('Project review');
	});
});

describe('orderInboxGroups', () => {
	it('puts account items first, active projects by last touch, dormant projects last', () => {
		const ordered = orderInboxGroups([
			{
				key: 'lily',
				projectId: 'p1',
				projectState: 'paused',
				projectUpdatedAt: '2026-07-13T00:00:00Z'
			},
			{
				key: 'old',
				projectId: 'p2',
				projectState: 'active',
				projectUpdatedAt: '2026-09-01T00:00:00Z'
			},
			{ key: 'account', projectId: null },
			{
				key: 'wayne',
				projectId: 'p3',
				projectState: 'active',
				projectUpdatedAt: '2026-10-20T00:00:00Z'
			},
			{
				key: 'done',
				projectId: 'p4',
				projectState: 'completed',
				projectUpdatedAt: '2026-10-28T00:00:00Z'
			}
		]);
		expect(ordered.map((group) => group.key)).toEqual([
			'account',
			'wayne',
			'old',
			'done',
			'lily'
		]);
	});

	it('puts quiet projects between working projects and paused or finished ones', () => {
		const ordered = orderInboxGroups([
			{
				key: 'ceo',
				projectId: 'p1',
				projectState: 'active',
				projectUpdatedAt: '2026-08-11T00:00:00Z',
				quiet: true
			},
			{
				key: 'done',
				projectId: 'p2',
				projectState: 'completed',
				projectUpdatedAt: '2026-10-28T00:00:00Z'
			},
			{
				key: 'wayne',
				projectId: 'p3',
				projectState: 'active',
				projectUpdatedAt: '2026-10-20T00:00:00Z'
			},
			{
				key: 'spooky',
				projectId: 'p4',
				projectState: 'active',
				projectUpdatedAt: '2026-08-04T00:00:00Z',
				quiet: true
			},
			{ key: 'account', projectId: null }
		]);
		expect(ordered.map((group) => group.key)).toEqual([
			'account',
			'wayne',
			'ceo',
			'spooky',
			'done'
		]);
	});

	it('keeps the server order when nothing tells groups apart', () => {
		const ordered = orderInboxGroups([
			{ key: 'a', projectId: 'p1' },
			{ key: 'b', projectId: 'p2' }
		]);
		expect(ordered.map((group) => group.key)).toEqual(['a', 'b']);
	});
});

describe('formatInboxGroupWorkload', () => {
	it('says what a cleanup card holds instead of counting the card', () => {
		expect(
			formatInboxGroupWorkload({
				itemCount: 1,
				cleanupCounts: { safe_cleanup: 10, needs_call: 4, note: 6 }
			})
		).toBe('4 need you · 10 ready');
		expect(
			formatInboxGroupWorkload({
				itemCount: 1,
				cleanupCounts: { safe_cleanup: 0, needs_call: 1, note: 0 }
			})
		).toBe('1 needs you');
		expect(
			formatInboxGroupWorkload({
				itemCount: 1,
				cleanupCounts: { safe_cleanup: 0, needs_call: 0, note: 3 }
			})
		).toBe('3 to know');
	});

	it('leads with check-ins to confirm, then what the rest of the project holds', () => {
		expect(
			formatInboxGroupWorkload({
				itemCount: 1,
				cleanupCounts: { safe_cleanup: 10, needs_call: 4, note: 6 },
				checkIns: { toConfirm: 10 }
			})
		).toBe('10 to confirm · 4 need you · 10 ready');
		expect(formatInboxGroupWorkload({ itemCount: 0, checkIns: { toConfirm: 3 } })).toBe(
			'3 to confirm'
		);
		expect(formatInboxGroupWorkload({ itemCount: 2, checkIns: { toConfirm: 1 } })).toBe(
			'1 to confirm · 2 need attention'
		);
	});

	it('asks "Still on?" for a quiet project instead of counting its tasks', () => {
		expect(
			formatInboxGroupWorkload({ itemCount: 0, checkIns: { toConfirm: 12, quiet: true } })
		).toBe('Still on?');
		expect(
			formatInboxGroupWorkload({
				itemCount: 1,
				cleanupCounts: { safe_cleanup: 0, needs_call: 1, note: 0 },
				checkIns: { toConfirm: 12, quiet: true }
			})
		).toBe('Still on? · 1 needs you');
	});

	it('falls back to the item count for other sources', () => {
		expect(formatInboxGroupWorkload({ itemCount: 2 })).toBe('2 need attention');
		expect(formatInboxGroupWorkload({ itemCount: 1 })).toBe('1 needs attention');
	});
});
