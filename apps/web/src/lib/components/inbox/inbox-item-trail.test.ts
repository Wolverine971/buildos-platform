// apps/web/src/lib/components/inbox/inbox-item-trail.test.ts
import { describe, expect, it } from 'vitest';
import type { ProjectCleanupItem } from '@buildos/shared-types';
import { buildAppliedCheck, buildCleanupItemTrail, buildHeldCheck } from './inbox-item-trail';

const PROJECT = 'f85b6c5f-59fb-4e4c-8654-748f793d8f4b';
const DOC = '7a06e9cf-9767-4176-979e-76921dc4875d';
const MOVE_BAR = { minAbout: 0.85, minWanted: 0.75, minSafe: 0.85, maxReview: 0.65 };
const ARCHIVE_BAR = { minAbout: 0.85, minWanted: 0.8, minSafe: 0.9, maxReview: 0.3 };

function item(overrides: Partial<ProjectCleanupItem> = {}): ProjectCleanupItem {
	return {
		id: 'lineage-1',
		source: 'review',
		kind: 'doc_outdated',
		section: 'safe_cleanup',
		title: 'Archive "Outreach week: Oct 5–11"',
		summary: 'Archive the historical outreach week plan.',
		why_now: 'Its stated outreach window ended weeks ago.',
		executable: true,
		rows: [],
		evidence_refs: [
			{
				entity_type: 'document',
				entity_id: DOC,
				title: 'Outreach week: Oct 5–11',
				reason: 'A plan for the concluded outreach week.'
			}
		],
		seen_count: 1,
		first_seen_at: '2026-11-07T12:00:00.000Z',
		updated_at: '2026-11-07T12:00:00.000Z',
		...overrides
	};
}

describe('buildCleanupItemTrail', () => {
	it('names the source and links each cited record', () => {
		const trail = buildCleanupItemTrail(item(), PROJECT);
		expect(trail.origin).toMatch(/^Project review · first seen /);
		expect(trail.origin).not.toContain('seen in');
		expect(trail.whyNow).toBe('Its stated outreach window ended weeks ago.');
		expect(trail.records).toHaveLength(1);
		expect(trail.records[0]).toMatchObject({
			kindLabel: 'Doc',
			title: 'Outreach week: Oct 5–11',
			reason: 'A plan for the concluded outreach week.'
		});
		expect(trail.records[0]?.href).toContain(DOC);
		expect(trail.check).toBeNull();
	});

	it('adds the review count, drops a why-now that repeats the summary', () => {
		const trail = buildCleanupItemTrail(
			item({
				source: 'audit',
				seen_count: 3,
				why_now: 'archive the historical outreach week plan. '
			}),
			PROJECT
		);
		expect(trail.origin).toMatch(/^Project audit · .* · seen in 3 reviews$/);
		expect(trail.whyNow).toBeNull();
	});

	it('keeps records without a page as plain chips and merges review items once', () => {
		const trail = buildCleanupItemTrail(
			item({
				source: 'radar',
				evidence_refs: [
					{ entity_type: 'external', title: 'Client email' },
					{ entity_type: 'goal', title: 'Launch by March' },
					{ entity_type: 'task', entity_id: 'task-1', title: 'Send proposal' }
				],
				review_items: [
					{
						concern_id: 'c1',
						entity_type: 'task',
						entity_id: 'task-1',
						title: 'Send proposal',
						reason: 'Due date passed',
						fix_in_chat_prompt: ''
					},
					{
						concern_id: 'c2',
						entity_type: 'goal',
						entity_id: 'goal-1',
						title: 'Launch by March',
						reason: 'Target moved',
						fix_in_chat_prompt: ''
					}
				]
			}),
			PROJECT
		);
		expect(trail.origin).toMatch(/^From your recent chats/);
		expect(trail.records.map((record) => [record.title, Boolean(record.href)])).toEqual([
			['Client email', false],
			['Send proposal', true],
			['Launch by March', true]
		]);
		expect(trail.records[2]?.href).toContain(`/projects/${PROJECT}`);
	});

	it('caps the chips and counts the rest', () => {
		const refs = Array.from({ length: 8 }, (_, index) => ({
			entity_type: 'document' as const,
			entity_id: `doc-${index}`,
			title: `Doc ${index}`
		}));
		const trail = buildCleanupItemTrail(item({ evidence_refs: refs }), PROJECT);
		expect(trail.records).toHaveLength(6);
		expect(trail.more).toBe(2);
	});
});

describe('auto-apply check', () => {
	it('says which answers missed the bar', () => {
		const check = buildHeldCheck({
			scores: { about: 0.89, wanted: 0.79, review: 0.52, safe: 0.91 },
			bar: ARCHIVE_BAR,
			outcome: 'below_bar',
			at: '2026-11-07T05:01:00.000Z',
			run_id: null
		});
		expect(check.rows.map((row) => row.pass)).toEqual([true, false, false, true]);
		expect(check.verdict).toBe(
			'Asked first: not sure you want it; you would likely want to see it first.'
		);
	});

	it('explains a change that passed but hit the per-review limit', () => {
		const check = buildHeldCheck({
			scores: { about: 0.9, wanted: 0.8, review: 0.4, safe: 0.9 },
			bar: MOVE_BAR,
			outcome: 'cap',
			at: '2026-11-07T05:01:00.000Z',
			run_id: null
		});
		expect(check.rows.every((row) => row.pass)).toBe(true);
		expect(check.verdict).toContain('already applied its limit');
	});

	it('shows applied scores with or without a recorded bar', () => {
		const scores = { about: 0.86, wanted: 0.85, review: 0.35, safe: 0.94 };
		expect(buildAppliedCheck(null, null)).toBeNull();
		expect(buildAppliedCheck(scores, null)?.rows.every((row) => row.pass === null)).toBe(true);
		expect(buildAppliedCheck(scores, MOVE_BAR)?.rows.every((row) => row.pass)).toBe(true);
	});
});
