// apps/web/src/lib/components/inbox/cleanup-triage.test.ts
import { describe, expect, it } from 'vitest';
import type { ProjectCleanupItem, ProjectCleanupView } from '@buildos/shared-types';
import {
	buildTriageSteps,
	chunkDecisions,
	expandBatchStep,
	groupQueuedByProject,
	triageDecisionsFor,
	triageItemCount,
	triageVerdictsFor,
	type TriageProject
} from './cleanup-triage';

function item(overrides: Partial<ProjectCleanupItem>): ProjectCleanupItem {
	return {
		id: 'item',
		source: 'review',
		kind: 'doc_org',
		section: 'safe_cleanup',
		title: 'Item',
		summary: null,
		why_now: null,
		executable: true,
		rows: [],
		evidence_refs: [],
		seen_count: 1,
		first_seen_at: '2026-09-04T12:00:00.000Z',
		updated_at: '2026-09-29T12:00:00.000Z',
		...overrides
	};
}

function row(id: string, fingerprint: string | null) {
	return {
		suggestion_id: id,
		kind: 'doc_org' as const,
		title: `Row ${id}`,
		operation_count: fingerprint ? 1 : 0,
		verified_headline: null,
		verified_fingerprint: fingerprint,
		updated_at: '2026-09-29T12:00:00.000Z'
	};
}

const ready = (id: string) =>
	item({ id, title: `Archive ${id}`, rows: [row(`s-${id}`, `fp-${id}`)] });
const call = (id: string) =>
	item({ id, section: 'needs_call', executable: false, rows: [row(`s-${id}`, null)] });
const note = (id: string) =>
	item({ id, section: 'note', executable: false, rows: [row(`s-${id}`, null)] });

function project(projectId: string, items: ProjectCleanupItem[]): TriageProject {
	const view = {
		project_id: projectId,
		items,
		groups: [],
		bottom_line: null,
		recommendation: null,
		synthesized_at: null,
		latest_run_id: null,
		latest_audit: null,
		counts: { total: items.length, safe_cleanup: 0, needs_call: 0, note: 0 },
		recently_closed: []
	} as ProjectCleanupView;
	return { projectId, projectName: projectId, inboxItemId: `inbox-${projectId}`, view };
}

describe('buildTriageSteps', () => {
	it('batches two or more verified changes, then calls, then notes, project by project', () => {
		const steps = buildTriageSteps([
			project('p1', [note('n1'), call('c1'), ready('r1'), ready('r2')]),
			project('p2', [ready('r3'), call('c2')])
		]);
		expect(
			steps.map((step) =>
				step.kind === 'batch' ? `batch:${step.items.length}` : step.item.id
			)
		).toEqual([
			'batch:2',
			'c1',
			'n1',
			// One ready change is just a card of its own.
			'r3',
			'c2'
		]);
		expect(triageItemCount(steps)).toBe(6);
	});

	it('leaves an unverified change out of the batch', () => {
		const unverified = item({ id: 'u1', rows: [row('s-u1', null)] });
		const steps = buildTriageSteps([project('p1', [ready('r1'), ready('r2'), unverified])]);
		expect(steps[0]).toMatchObject({ kind: 'batch' });
		expect(steps[0].kind === 'batch' && steps[0].items.map((entry) => entry.id)).toEqual([
			'r1',
			'r2'
		]);
		expect(steps[1]).toMatchObject({ kind: 'item', item: { id: 'u1' } });
	});

	it('expands a batch into one card per change', () => {
		const [batch] = buildTriageSteps([project('p1', [ready('r1'), ready('r2')])]);
		if (batch.kind !== 'batch') throw new Error('expected a batch');
		expect(expandBatchStep(batch).map((step) => step.key)).toEqual(['p1:r1', 'p1:r2']);
	});
});

describe('triage verdicts', () => {
	it('offers apply only on verified changes and done only on findings', () => {
		expect(triageVerdictsFor(ready('r1'))).toEqual(['apply', 'not_needed', 'note', 'skip']);
		expect(triageVerdictsFor(call('c1'))).toEqual(['done', 'not_needed', 'note', 'skip']);
		expect(triageVerdictsFor(item({ id: 'u', rows: [row('s-u', null)] }))).toEqual([
			'not_needed',
			'note',
			'skip'
		]);
	});

	it('turns verdicts into decisions without asking for a reason', () => {
		expect(triageDecisionsFor(ready('r1'), 'apply')).toEqual([
			{ suggestion_id: 's-r1', action: 'approve', expected_fingerprint: 'fp-r1' }
		]);
		expect(triageDecisionsFor(call('c1'), 'not_needed')).toEqual([
			{ suggestion_id: 's-c1', action: 'dismiss', reason: 'not_relevant' }
		]);
		expect(triageDecisionsFor(call('c1'), 'done')).toEqual([
			{
				suggestion_id: 's-c1',
				action: 'address',
				note: 'Handled from the project cleanup list'
			}
		]);
		expect(triageDecisionsFor(call('c1'), 'apply')).toEqual([]);
		expect(triageDecisionsFor(ready('r1'), 'skip')).toEqual([]);
	});
});

describe('saving', () => {
	it('groups queued decisions into one request per project', () => {
		const grouped = groupQueuedByProject([
			{
				stepKey: 'a',
				projectId: 'p1',
				items: [],
				decisions: [{ suggestion_id: '1', action: 'dismiss' }]
			},
			{
				stepKey: 'b',
				projectId: 'p2',
				items: [],
				decisions: [{ suggestion_id: '2', action: 'dismiss' }]
			},
			{
				stepKey: 'c',
				projectId: 'p1',
				items: [],
				decisions: [{ suggestion_id: '3', action: 'address' }]
			}
		]);
		expect(
			grouped.map((group) => [group.projectId, group.decisions.map((d) => d.suggestion_id)])
		).toEqual([
			['p1', ['1', '3']],
			['p2', ['2']]
		]);
	});

	it('chunks to the endpoint limit', () => {
		expect(
			chunkDecisions(Array.from({ length: 85 }, (_, index) => index)).map((c) => c.length)
		).toEqual([40, 40, 5]);
	});
});
