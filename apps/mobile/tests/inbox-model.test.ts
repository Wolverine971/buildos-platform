// apps/mobile/tests/inbox-model.test.ts
import type { InboxItem } from '@buildos/api-client';
import type { ProjectCleanupItem, ProjectCleanupView } from '@buildos/shared-types';
import { describe, expect, it } from 'vitest';

import {
	attachCheckIns,
	buildInboxSections,
	cardActions,
	inboxCardCount,
	inboxSummaryLine,
	NOTHING_HIDDEN
} from '@/lib/inbox/model';

function line(id: string, patch: Partial<ProjectCleanupItem> = {}): ProjectCleanupItem {
	return {
		id,
		source: 'review',
		kind: 'archive_document' as never,
		section: 'safe_cleanup',
		title: `Line ${id}`,
		summary: null,
		why_now: null,
		executable: true,
		rows: [
			{
				suggestion_id: `s-${id}`,
				kind: 'archive_document' as never,
				title: `Line ${id}`,
				operation_count: 1,
				verified_headline: null,
				verified_fingerprint: `f-${id}`,
				updated_at: '2026-11-15T00:00:00Z'
			}
		],
		evidence_refs: [],
		seen_count: 1,
		first_seen_at: '2026-11-15T00:00:00Z',
		updated_at: '2026-11-15T00:00:00Z',
		ask_kind: 'tidy',
		...patch
	};
}

function cleanupItem(
	projectId: string,
	name: string,
	lines: ProjectCleanupItem[],
	updatedAt: string
): InboxItem {
	const view: ProjectCleanupView = {
		project_id: projectId,
		items: lines,
		groups: [],
		bottom_line: null,
		recommendation: null,
		synthesized_at: null,
		latest_run_id: null,
		latest_audit: null,
		counts: { total: lines.length, safe_cleanup: lines.length, needs_call: 0, note: 0 },
		recently_closed: []
	};
	return {
		id: `inbox-${projectId}`,
		source_type: 'project_cleanup',
		source_ref_id: projectId,
		project_id: projectId,
		audience: 'project_members',
		status: 'pending',
		title: 'Cleanup',
		action_kinds: ['review'],
		can_decide: true,
		project: { id: projectId, name, updated_at: updatedAt },
		source_payload: view as unknown as Record<string, unknown>
	};
}

const accountCard: InboxItem = {
	id: 'acct',
	source_type: 'integration_attention',
	source_ref_id: 'x',
	project_id: null,
	audience: 'user',
	status: 'pending',
	title: 'Reconnect Gmail',
	action_kinds: ['snooze'],
	can_decide: true
};

describe('inbox sections', () => {
	it('puts Account first, then the most recently touched projects', () => {
		const sections = buildInboxSections([
			cleanupItem('old', 'Old', [line('1')], '2026-10-01T00:00:00Z'),
			cleanupItem('new', 'New', [line('2')], '2026-11-15T00:00:00Z'),
			accountCard
		]);
		expect(sections.map((s) => s.label)).toEqual(['Account', 'New', 'Old']);
	});

	it('shrinks a cleanup list as lines are answered and drops it when nothing is left', () => {
		const items = [cleanupItem('p', 'P', [line('1'), line('2')], '2026-11-15T00:00:00Z')];
		const one = buildInboxSections(items, { ...NOTHING_HIDDEN, cleanupItems: new Set(['1']) });
		expect(one[0]!.cleanups[0]!.blocks.tidy.map((l) => l.id)).toEqual(['2']);
		expect(one[0]!.openCount).toBe(1);
		const none = buildInboxSections(items, {
			...NOTHING_HIDDEN,
			cleanupItems: new Set(['1', '2'])
		});
		expect(none).toEqual([]);
	});

	it('only offers Apply all for lines whose change was verified', () => {
		const unverified = line('2');
		unverified.rows[0]!.verified_fingerprint = null;
		const [section] = buildInboxSections([
			cleanupItem('p', 'P', [line('1'), unverified], '2026-11-15T00:00:00Z')
		]);
		expect(section!.cleanups[0]!.ready.map((l) => l.id)).toEqual(['1']);
	});

	it('hides a whole card while its answer waits', () => {
		expect(
			buildInboxSections([accountCard], { ...NOTHING_HIDDEN, items: new Set(['acct']) })
		).toEqual([]);
	});
});

describe('card actions', () => {
	it('never offers a decision the viewer cannot make', () => {
		expect(
			cardActions({ ...accountCard, source_type: 'calendar_suggestion', can_decide: false })
		).toEqual([]);
	});

	it('sends change sets and briefs to the chat instead of approving blind', () => {
		const run = { ...accountCard, source_type: 'agent_run' as const };
		expect(cardActions(run)).not.toContain('approve');
		expect(cardActions(run)).toContain('talk');
	});
});

describe('check-ins and counts', () => {
	const checkIn = (projectId: string, tasks: number) => ({
		project_id: projectId,
		project_name: projectId.toUpperCase(),
		project_state: 'active',
		project_updated_at: null,
		last_touched_at: null,
		last_touched_date: null,
		quiet: false,
		overdue_count: tasks,
		oldest_due_date: null,
		newest_due_date: null,
		truncated: false,
		groups: [
			{
				key: 'g',
				due_date: '2026-11-17',
				label: 'Nov 17',
				task_count: tasks,
				tasks: Array.from({ length: tasks }, (_, i) => ({
					id: `${projectId}-${i}`,
					title: `T${i}`,
					state_key: 'todo',
					due_at: '2026-11-17T12:00:00Z'
				}))
			}
		]
	});

	it("puts a check-in in its project's section, and gives a lone one its own", () => {
		const sections = attachCheckIns(
			buildInboxSections([cleanupItem('p', 'P', [line('1')], '2026-11-15T00:00:00Z')]),
			[checkIn('p', 3), checkIn('q', 2)]
		);
		expect(sections.map((s) => [s.label, s.checkIns.length, s.openCount])).toEqual([
			['P', 1, 4],
			['Q', 1, 2]
		]);
	});

	it('counts cards like the server badge: a cleanup list or check-in is one', () => {
		const sections = attachCheckIns(
			buildInboxSections([
				cleanupItem('p', 'P', [line('1'), line('2'), line('3')], '2026-11-15T00:00:00Z'),
				accountCard
			]),
			[checkIn('p', 13)]
		);
		expect(inboxCardCount(sections, 1)).toBe(4);
		expect(inboxSummaryLine(0)).toBe('Inbox is clear');
		expect(inboxSummaryLine(1)).toBe('1 item needs attention');
		expect(inboxSummaryLine(4)).toBe('4 items need attention');
	});
});
