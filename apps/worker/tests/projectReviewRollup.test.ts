// apps/worker/tests/projectReviewRollup.test.ts
//
// Tasker 112: the Project Review roll-up (carry forward, merge, close with a reason).
import type { LoopOperation, ProjectSuggestionEvidenceRef } from '@buildos/shared-types';
import { describe, expect, it } from 'vitest';
import {
	type RollupCandidate,
	type RollupItem,
	type RollupPass,
	applyRollupJudgment,
	applyRollupPass,
	closeRollupRows,
	findingSubjects,
	rollupRowKey,
	sameConcern
} from '../src/workers/project-loop/reviewRollup';

const flag = (documentId: string, reason = 'stale'): LoopOperation => ({
	tool: 'update_onto_document',
	args: {
		document_id: documentId,
		props: { loop_flagged_outdated: true, loop_outdated_reason: reason }
	}
});
const archive = (documentId: string): LoopOperation => ({
	tool: 'archive_onto_document',
	args: { document_id: documentId, children: 'archive_children' }
});
const move = (documentId: string, parentId: string): LoopOperation => ({
	tool: 'move_document_in_tree',
	args: { document_id: documentId, new_parent_id: parentId, new_position: 0 }
});
const ref = (entity_type: string, entity_id: string): ProjectSuggestionEvidenceRef =>
	({ entity_type, entity_id, title: entity_id }) as ProjectSuggestionEvidenceRef;

function candidate(
	suggestionId: string,
	kind: string,
	operations: LoopOperation[] = [],
	evidenceRefs: ProjectSuggestionEvidenceRef[] = []
): RollupCandidate {
	return { suggestionId, runId: 'run', kind, title: suggestionId, operations, evidenceRefs };
}

function pass(
	runId: string,
	at: string,
	candidates: RollupCandidate[],
	extra: Partial<RollupPass> = {}
): RollupPass {
	return { runId, at, candidates, subjectState: () => undefined, ...extra };
}

function run(passes: RollupPass[]): { items: RollupItem[]; events: string[] } {
	let items: RollupItem[] = [];
	const events: string[] = [];
	for (const next of passes) {
		const result = applyRollupPass(items, next);
		items = result.items;
		events.push(
			...result.events.map((event) =>
				event.type === 'closed'
					? `${next.runId} closed ${event.lineageId} ${event.reason}`
					: event.type === 'confirmed'
						? `${next.runId} confirmed ${event.lineageId} x${event.seenCount} ${event.scopeChange}${event.inPlaceRowId ? ' in-place' : ''}`
						: `${next.runId} ${event.type} ${event.lineageId}`
			)
		);
	}
	return { items, events };
}

const open = (items: RollupItem[]) => items.filter((item) => item.status === 'open');
const rowIds = (item: RollupItem | undefined) => item?.rows.map((row) => row.suggestionId);

describe('findingSubjects', () => {
	it('keys op targets and cited records, never move destinations or the project', () => {
		const subjects = findingSubjects({
			operations: [move('d1', 'hub')],
			evidenceRefs: [ref('project', 'p1'), ref('document', 'hub'), ref('goal', 'g1')]
		});
		expect(subjects.targets).toEqual(['document:d1']);
		expect(subjects.subjects).toEqual(['document:d1', 'document:hub', 'goal:g1']);
		expect(subjects.primarySubject).toBe('document:d1');
	});

	it('treats both tasks of a conflict pair as targets', () => {
		const subjects = findingSubjects({
			operations: [
				{
					tool: 'update_onto_task',
					args: { task_id: 't1', props: { loop_conflict_with_task_id: 't2' } }
				}
			],
			evidenceRefs: []
		});
		expect(subjects.targets).toEqual(['task:t1', 'task:t2']);
	});
});

describe('rollupRowKey', () => {
	it('ignores wording but not what the change does', () => {
		const key = (ops: LoopOperation[]) =>
			rollupRowKey({ kind: 'doc_outdated', operations: ops, evidenceRefs: [] });
		expect(key([flag('d1', 'one reason')])).toBe(key([flag('d1', 'another reason')]));
		expect(key([flag('d1')])).not.toBe(key([archive('d1')]));
		expect(
			rollupRowKey({ kind: 'doc_org', operations: [move('d1', 'a')], evidenceRefs: [] })
		).not.toBe(
			rollupRowKey({ kind: 'doc_org', operations: [move('d1', 'b')], evidenceRefs: [] })
		);
		const rename = (name: string): LoopOperation => ({
			tool: 'update_onto_goal',
			args: { project_id: 'p1', goal_id: 'g1', name },
			label: `Rename to ${name}`
		});
		const goalKey = (ops: LoopOperation[]) =>
			rollupRowKey({ kind: 'drift', operations: ops, evidenceRefs: [] });
		// A different value is a new revision; the same value reworded is the same change.
		expect(goalKey([rename('Exit plan')])).not.toBe(goalKey([rename('Exit strategy')]));
		expect(goalKey([rename('Exit plan')])).toBe(
			goalKey([{ ...rename('Exit plan'), label: 'Another label' }])
		);
	});
});

describe('applyRollupPass', () => {
	it('keeps a finding the next pass does not mention (silence is not a close)', () => {
		const { items, events } = run([
			pass('r1', '2026-09-04T04:00:00Z', [
				candidate('pa', 'doc_outdated', [flag('political')])
			]),
			pass('r2', '2026-09-19T04:00:00Z', [])
		]);
		expect(open(items)).toHaveLength(1);
		expect(items[0].passesSinceConfirmed).toBe(1);
		expect(events).toEqual(['r1 opened pa']);
	});

	it('confirms a re-worded finding in place instead of writing a second row', () => {
		const { items, events } = run([
			pass('r1', '2026-09-04T04:00:00Z', [candidate('a', 'doc_outdated', [flag('d1', 'x')])]),
			pass('r2', '2026-09-19T04:00:00Z', [candidate('b', 'doc_outdated', [flag('d1', 'y')])])
		]);
		expect(open(items)).toHaveLength(1);
		expect(items[0]).toMatchObject({
			lineageId: 'a',
			revisionIds: ['a'],
			seenInRuns: ['r1', 'r2']
		});
		expect(rowIds(items[0])).toEqual(['a']);
		expect(events).toContain('r2 confirmed a x2 same in-place');
	});

	it('replaces a flag with an archive proposal for the same document', () => {
		const { items } = run([
			pass('r1', '2026-09-04T04:00:00Z', [candidate('flag', 'doc_outdated', [flag('d1')])]),
			pass('r2', '2026-09-19T04:00:00Z', [candidate('arch', 'doc_outdated', [archive('d1')])])
		]);
		expect(rowIds(items[0])).toEqual(['arch']);
		expect(items[0].revisionIds).toEqual(['flag', 'arch']);
	});

	it('treats a folder and documents inside it as one finding at a wider scope', () => {
		const ancestorsOf = (id: string) => (id.startsWith('rod-') ? ['rod-hub'] : []);
		const { items, events } = run([
			pass('r1', '2026-09-04T04:00:00Z', [
				candidate('hub', 'doc_outdated', [flag('rod-hub')])
			]),
			pass(
				'r2',
				'2026-09-19T04:00:00Z',
				[
					candidate('prep', 'doc_outdated', [flag('rod-prep')]),
					candidate('plan', 'doc_outdated', [flag('rod-plan')])
				],
				{ ancestorsOf }
			)
		]);
		expect(open(items)).toHaveLength(1);
		expect(items[0].targets).toEqual([
			'document:rod-hub',
			'document:rod-plan',
			'document:rod-prep'
		]);
		expect(rowIds(items[0])).toEqual(['hub', 'prep', 'plan']);
		expect(events).toContain('r2 confirmed hub x2 wider');
	});

	it('replaces a move plan that overlaps an open one (scope changed, same finding)', () => {
		const { items, events } = run([
			pass('r1', '2026-09-04T04:00:00Z', [
				candidate('v1', 'doc_org', [move('vision', 'context'), move('brand', 'context')])
			]),
			pass('r2', '2026-09-28T04:00:00Z', [
				candidate('v2', 'doc_org', [move('vision', 'start'), move('brand', 'start')])
			]),
			pass('r3', '2026-09-29T04:00:00Z', [
				candidate('v3', 'doc_org', [move('brand', 'start')])
			])
		]);
		expect(open(items)).toHaveLength(1);
		expect(rowIds(items[0])).toEqual(['v3']);
		expect(items[0].targets).toEqual(['document:brand']);
		expect(events).toEqual([
			'r1 opened v1',
			'r2 confirmed v1 x2 same',
			'r3 confirmed v1 x3 narrower'
		]);
	});

	it('matches findings without a change on the stale record they name', () => {
		const { items } = run([
			pass('r1', '2026-09-04T04:00:00Z', [
				candidate(
					'd1',
					'drift',
					[],
					[ref('project', 'p'), ref('goal', 'rod-goal'), ref('task', 't1')]
				)
			]),
			pass('r2', '2026-09-19T04:00:00Z', [
				candidate('d2', 'drift', [], [ref('goal', 'rod-goal'), ref('document', 'plan')])
			]),
			pass('r3', '2026-09-28T04:00:00Z', [
				candidate('d3', 'drift', [], [ref('task', 'other'), ref('document', 'plan')])
			])
		]);
		expect(
			open(items).map((item) => [item.lineageId, item.seenInRuns.length, rowIds(item)])
		).toEqual([
			['d1', 2, ['d2']],
			['d3', 1, ['d3']]
		]);
	});

	it('closes a finding whose subject was archived, and narrows one partly archived', () => {
		const archived = new Set(['document:political', 'document:b']);
		const { items, events } = run([
			pass('r1', '2026-09-04T04:00:00Z', [
				candidate('pa', 'doc_outdated', [flag('political')]),
				candidate('pair', 'doc_outdated', [flag('a'), flag('b')])
			]),
			pass('r2', '2026-09-30T04:00:00Z', [], {
				subjectState: (key) => (archived.has(key) ? { archived: true } : undefined)
			})
		]);
		expect(items.find((item) => item.lineageId === 'pa')).toMatchObject({
			status: 'closed',
			closeReason: 'subject_archived',
			closedByRunId: 'r2'
		});
		expect(items.find((item) => item.lineageId === 'pair')?.targets).toEqual(['document:a']);
		expect(events).toContain('r2 closed pa subject_archived');
	});

	it('keeps a finding without a change open until every record it cites is gone', () => {
		const gone = new Set(['task:t1']);
		const { items } = run([
			pass('r1', '2026-09-04T04:00:00Z', [
				candidate('d', 'drift', [], [ref('task', 't1'), ref('goal', 'g1')])
			]),
			pass('r2', '2026-09-05T04:00:00Z', [], {
				subjectState: (key) => (gone.has(key) ? { deleted: true } : undefined)
			})
		]);
		expect(items[0].status).toBe('open');
		gone.add('goal:g1');
		const next = applyRollupPass(
			items,
			pass('r3', '2026-09-06T04:00:00Z', [], {
				subjectState: (key) => (gone.has(key) ? { deleted: true } : undefined)
			})
		);
		expect(next.items[0]).toMatchObject({ status: 'closed', closeReason: 'subject_deleted' });
	});

	it('applies model verdicts: resolved closes with its reason, still_true confirms', () => {
		const { items } = run([
			pass('r1', '2026-09-04T04:00:00Z', [
				candidate('x', 'doc_outdated', [flag('x')]),
				candidate('y', 'doc_outdated', [flag('y')])
			]),
			pass('r2', '2026-09-19T04:00:00Z', [], {
				verdicts: [
					{
						lineageId: 'x',
						verdict: 'resolved',
						reason: 'The user said this doc is current.'
					},
					{ lineageId: 'y', verdict: 'still_true' }
				]
			})
		]);
		expect(items[0]).toMatchObject({
			status: 'closed',
			closeReason: 'resolved',
			closeDetail: 'The user said this doc is current.'
		});
		expect(items[1]).toMatchObject({ status: 'open', seenInRuns: ['r1', 'r2'] });
	});

	it('ages out only after 30 quiet days AND 3 quiet passes', () => {
		const first = pass('r1', '2026-09-01T00:00:00Z', [
			candidate('x', 'doc_outdated', [flag('x')])
		]);
		const longGap = run([first, pass('r2', '2026-11-01T00:00:00Z', [])]);
		expect(open(longGap.items)).toHaveLength(1);

		const manyPasses = run([
			first,
			pass('r2', '2026-09-02T00:00:00Z', []),
			pass('r3', '2026-09-03T00:00:00Z', []),
			pass('r4', '2026-09-04T00:00:00Z', [])
		]);
		expect(open(manyPasses.items)).toHaveLength(1);

		const both = run([
			first,
			pass('r2', '2026-09-12T00:00:00Z', []),
			pass('r3', '2026-09-22T00:00:00Z', []),
			pass('r4', '2026-10-02T00:00:00Z', [])
		]);
		expect(both.items[0]).toMatchObject({ status: 'closed', closeReason: 'aged_out' });
	});

	it('merges two open findings that one candidate shows are the same concern', () => {
		const { items } = run([
			pass('r1', '2026-09-04T04:00:00Z', [candidate('a', 'doc_org', [move('d1', 'hub')])]),
			pass('r2', '2026-09-05T04:00:00Z', [candidate('b', 'doc_org', [move('d2', 'hub')])]),
			pass('r3', '2026-09-06T04:00:00Z', [
				candidate('c', 'doc_org', [move('d1', 'hub'), move('d2', 'hub')])
			])
		]);
		expect(items.find((item) => item.lineageId === 'b')).toMatchObject({
			status: 'closed',
			closeReason: 'merged',
			mergedInto: 'a'
		});
		expect(open(items)).toHaveLength(1);
		expect(rowIds(open(items)[0])).toEqual(['c']);
		expect(open(items)[0].targets).toEqual(['document:d1', 'document:d2']);
	});

	it('closes on a user decision about a live row', () => {
		const { items } = run([
			pass('r1', '2026-09-04T04:00:00Z', [candidate('x', 'doc_outdated', [flag('x')])]),
			pass('r2', '2026-09-05T04:00:00Z', [], { userDecisions: new Map([['x', 'rejected']]) })
		]);
		expect(items[0]).toMatchObject({ status: 'closed', closeReason: 'user_rejected' });
	});
});

describe('applyRollupJudgment', () => {
	it('merges into the older finding and ages out only unconfirmed ones', () => {
		const deterministic = applyRollupPass(
			[],
			pass('r1', '2026-09-04T04:00:00Z', [
				candidate('old', 'drift', [], [ref('goal', 'g1')]),
				candidate('new', 'drift', [], [ref('task', 't1')])
			]),
			{ judgment: false }
		);
		const judged = applyRollupJudgment(deterministic.items, {
			runId: 'r1',
			at: '2026-09-04T04:00:00Z',
			verdicts: [],
			merges: [{ lineageId: 'old', into: 'new' }],
			confirmed: deterministic.confirmed
		});
		// Both opened in the same pass; the lineage listed first keeps it.
		expect(open(judged.items)).toHaveLength(1);
		expect(rowIds(open(judged.items)[0])?.sort()).toEqual(['new', 'old']);
	});
});

describe('closeRollupRows', () => {
	it('closes a finding whose only row no longer applies, and narrows one with another row left', () => {
		const { items } = run([
			pass('r1', '2026-09-04T04:00:00Z', [
				candidate('solo', 'doc_org', [move('d1', 'hub')]),
				candidate('duo', 'doc_outdated', [flag('a')])
			])
		]);
		const withSecond = applyRollupPass(
			items,
			pass('r2', '2026-09-05T04:00:00Z', [candidate('duo-2', 'doc_outdated', [flag('a')])], {
				ancestorsOf: () => []
			})
		).items;
		const closed = closeRollupRows(
			withSecond,
			{ runId: 'r2', at: '2026-09-05T04:00:00Z' },
			new Map([['solo', { reason: 'already_done' as const, detail: 'Already there.' }]])
		);
		expect(closed.items.find((item) => item.lineageId === 'solo')).toMatchObject({
			status: 'closed',
			closeReason: 'already_done'
		});
		expect(closed.items.find((item) => item.lineageId === 'duo')?.status).toBe('open');
	});
});

describe('sameConcern', () => {
	it('never merges different kinds or different conflict pairs', () => {
		const shape = (kind: string, targets: string[]) => ({
			kind,
			targets,
			subjects: targets,
			primarySubject: targets[0] ?? null
		});
		expect(
			sameConcern(shape('doc_org', ['document:a']), shape('doc_outdated', ['document:a']))
		).toBe(false);
		expect(
			sameConcern(
				shape('task_conflict', ['task:a', 'task:b']),
				shape('task_conflict', ['task:a', 'task:c'])
			)
		).toBe(false);
	});
});
