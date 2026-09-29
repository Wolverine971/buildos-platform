// packages/shared-agent-ops/src/project-cleanup.test.ts
import { describe, expect, it } from 'vitest';
import {
	type ProjectCleanupRowRecord,
	buildProjectCleanupView,
	projectCleanupInboxCopy
} from './project-cleanup';

function row(overrides: Partial<ProjectCleanupRowRecord>): ProjectCleanupRowRecord {
	return {
		id: 'row-1',
		project_id: 'p1',
		run_id: 'run-1',
		kind: 'doc_outdated',
		status: 'pending',
		risk_tier: 1,
		title: 'Archive the old plan',
		rationale: 'A newer plan replaced it.',
		why_now: null,
		evidence_refs: [],
		preview: null,
		operations: [
			{
				tool: 'archive_onto_document',
				args: { project_id: 'p1', document_id: 'd1', children: 'archive_children' }
			}
		],
		reversible: true,
		lineage_id: null,
		rollup: null,
		created_at: '2026-09-04T00:00:00.000Z',
		updated_at: '2026-09-04T00:00:00.000Z',
		...overrides
	};
}

const verified = (headline: string) => ({
	ok: true as const,
	headline,
	fingerprint: `fp-${headline}`,
	operations: [],
	cautions: []
});

describe('buildProjectCleanupView', () => {
	it('shows one item per lineage, carrying its history, and drops changes that no longer apply', () => {
		const view = buildProjectCleanupView({
			projectId: 'p1',
			rows: [
				row({
					id: 'a1',
					lineage_id: 'lin-a',
					rollup: {
						first_seen_at: '2026-09-04T00:00:00.000Z',
						last_confirmed_at: '2026-09-19T00:00:00.000Z',
						seen_run_ids: ['r1', 'r2', 'r3'],
						passes_since_confirmed: 0,
						summary: 'Still cluttering the tree.',
						section: 'safe_cleanup'
					}
				}),
				row({
					id: 'a2',
					lineage_id: 'lin-a',
					created_at: '2026-09-19T00:00:00.000Z',
					updated_at: '2026-09-19T00:00:00.000Z',
					operations: [
						{
							tool: 'archive_onto_document',
							args: {
								project_id: 'p1',
								document_id: 'd2',
								children: 'archive_children'
							}
						}
					]
				}),
				row({ id: 'gone', lineage_id: 'lin-gone' })
			],
			verification: new Map([
				['a1', verified('Archive "Old plan"')],
				['a2', verified('Archive "Old notes"')],
				['gone', { ok: false, diagnostic: { code: 'NO_OP_OPERATION', message: 'done' } }]
			])
		});
		expect(view.items).toHaveLength(1);
		expect(view.items[0]).toMatchObject({
			id: 'lin-a',
			section: 'safe_cleanup',
			summary: 'Still cluttering the tree.',
			seen_count: 3,
			first_seen_at: '2026-09-04T00:00:00.000Z',
			executable: true
		});
		expect(view.items[0].rows.map((r) => r.verified_fingerprint)).toEqual([
			'fp-Archive "Old plan"',
			'fp-Archive "Old notes"'
		]);
		expect(view.counts).toEqual({ total: 1, safe_cleanup: 1, needs_call: 0, note: 0 });
	});

	it('holds the section floor under the synthesis and its stamped sections', () => {
		const view = buildProjectCleanupView({
			projectId: 'p1',
			rows: [
				row({
					id: 'rename',
					kind: 'drift',
					operations: [
						{
							tool: 'update_onto_goal',
							args: { project_id: 'p1', goal_id: 'g1', name: 'New' }
						}
					]
				}),
				row({ id: 'note', kind: 'drift', operations: [] }),
				row({
					id: 'bundle',
					kind: 'freshness_update',
					lineage_id: 'ignored',
					operations: [
						{
							tool: 'update_onto_task',
							args: { project_id: 'p1', task_id: 't1', state_key: 'done' }
						}
					]
				})
			],
			synthesis: {
				bottom_line: 'Two goals drifted.',
				recommendation: 'Rename the goal first.',
				groups: [
					{
						title: 'Just do it',
						section: 'safe_cleanup',
						item_ids: ['rename', 'note'],
						recommendation: null
					}
				],
				open_count: 3,
				closed_this_pass: [
					{
						lineage_id: 'old',
						title: 'Old drift',
						reason: 'subject_archived',
						detail: 'Its subject was archived.'
					}
				],
				generated_at: '2026-09-29T04:00:00.000Z',
				source: 'llm'
			}
		});
		const section = (id: string) => view.items.find((item) => item.id === id)?.section;
		// A goal rename is never "ready to apply"; a finding with no change is never either.
		expect(section('rename')).toBe('needs_call');
		expect(section('note')).toBe('note');
		// The radar bundle is its own item, keyed by its suggestion id.
		expect(section('bundle')).toBe('safe_cleanup');
		expect(view.groups.map((group) => [group.title, group.item_ids])).toEqual([
			['Ready to apply', ['bundle']],
			['Needs your call', ['rename']],
			['Worth knowing', ['note']]
		]);
		expect(view.recently_closed).toEqual([
			expect.objectContaining({ lineage_id: 'old', at: '2026-09-29T04:00:00.000Z' })
		]);
		expect(projectCleanupInboxCopy(view)).toEqual({
			title: 'Two goals drifted.',
			summary: 'Rename the goal first. (1 ready to apply · 1 needs your call · 1 to know)'
		});
	});
});
