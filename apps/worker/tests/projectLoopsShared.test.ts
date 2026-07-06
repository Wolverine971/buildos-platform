// apps/worker/tests/projectLoopsShared.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildProjectLoopParentMap,
	buildProjectLoopSourceFingerprint,
	buildScopedSuggestionFingerprint,
	extractProjectLoopSuggestionEntities,
	readProjectLoopQueueMetadata,
	type ProjectLoopScopedEntity,
	summarizeProjectLoopDocTree,
	type ProjectLoopFingerprintContext
} from '../../../packages/shared-agent-ops/src/project-loops';

function baseContext(): ProjectLoopFingerprintContext {
	return {
		projectId: 'project-1',
		projectName: 'Launch',
		projectDescription: 'Ship the launch project',
		goals: [{ name: 'Ship v1', description: 'Public launch' }],
		documents: [
			{
				id: 'doc-b',
				title: 'Beta notes',
				state_key: 'draft',
				updated_at: '2026-06-20T00:00:00.000Z',
				parent_id: 'doc-a'
			},
			{
				id: 'doc-a',
				title: 'Launch plan',
				state_key: 'active',
				updated_at: '2026-06-21T00:00:00.000Z',
				parent_id: null
			}
		],
		tasks: [
			{
				id: 'task-b',
				title: 'Publish announcement',
				state_key: 'todo',
				updated_at: '2026-06-21T00:00:00.000Z'
			},
			{
				id: 'task-a',
				title: 'Finalize pricing',
				state_key: 'in_progress',
				updated_at: '2026-06-20T00:00:00.000Z'
			}
		]
	};
}

describe('project loop shared helpers', () => {
	it('builds an order-independent fingerprint but changes when project recency changes', () => {
		const first = baseContext();
		const reordered: ProjectLoopFingerprintContext = {
			...first,
			goals: [...first.goals].reverse(),
			documents: [...first.documents].reverse(),
			tasks: [...first.tasks].reverse()
		};
		const updatedDocTimestamp: ProjectLoopFingerprintContext = {
			...first,
			documents: first.documents.map((doc) =>
				doc.id === 'doc-a' ? { ...doc, updated_at: '2026-06-25T00:00:00.000Z' } : doc
			)
		};

		expect(buildProjectLoopSourceFingerprint(reordered)).toBe(
			buildProjectLoopSourceFingerprint(first)
		);
		expect(buildProjectLoopSourceFingerprint(updatedDocTimestamp)).not.toBe(
			buildProjectLoopSourceFingerprint(first)
		);
	});

	it('changes the fingerprint when project structure or task intent changes', () => {
		const first = baseContext();
		const movedDoc = {
			...first,
			documents: first.documents.map((doc) =>
				doc.id === 'doc-b' ? { ...doc, parent_id: null } : doc
			)
		};
		const renamedTask = {
			...first,
			tasks: first.tasks.map((task) =>
				task.id === 'task-a' ? { ...task, title: 'Finalize enterprise pricing' } : task
			)
		};

		expect(buildProjectLoopSourceFingerprint(movedDoc)).not.toBe(
			buildProjectLoopSourceFingerprint(first)
		);
		expect(buildProjectLoopSourceFingerprint(renamedTask)).not.toBe(
			buildProjectLoopSourceFingerprint(first)
		);
	});

	it('extracts only the task/document ids a suggestion mutates', () => {
		const taskConflict = extractProjectLoopSuggestionEntities([
			{
				tool: 'update_onto_task',
				args: {
					task_id: 'task-a',
					props: { loop_flagged_conflict: true, loop_conflict_with_task_id: 'task-b' }
				}
			}
		]);
		expect(taskConflict).toEqual({ taskIds: ['task-a', 'task-b'], docIds: [] });

		const docOp = extractProjectLoopSuggestionEntities([
			{ tool: 'update_onto_document', args: { document_id: 'doc-a' } }
		]);
		expect(docOp).toEqual({ taskIds: [], docIds: ['doc-a'] });

		// Informational suggestions (drift, audit follow-ups) carry no operations.
		expect(extractProjectLoopSuggestionEntities([])).toEqual({ taskIds: [], docIds: [] });
		expect(extractProjectLoopSuggestionEntities(null)).toEqual({ taskIds: [], docIds: [] });
	});

	it('scopes the freshness fingerprint to the referenced entities only', () => {
		const taskA: ProjectLoopScopedEntity = {
			kind: 'task',
			id: 'task-a',
			title: 'Finalize pricing',
			state_key: 'in_progress',
			updated_at: '2026-06-20T00:00:00.000Z',
			parent_id: null
		};
		const taskB: ProjectLoopScopedEntity = {
			kind: 'task',
			id: 'task-b',
			title: 'Publish announcement',
			state_key: 'todo',
			updated_at: '2026-06-21T00:00:00.000Z',
			parent_id: null
		};

		// No concrete entities → no guard.
		expect(buildScopedSuggestionFingerprint([])).toBeNull();

		// Order-independent: the stamp and the approval-time check can load the two
		// entities in either order and still agree.
		const stamp = buildScopedSuggestionFingerprint([taskA, taskB]);
		const check = buildScopedSuggestionFingerprint([taskB, taskA]);
		expect(stamp).not.toBeNull();
		expect(check).toBe(stamp);

		// A change to a referenced entity supersedes the suggestion...
		const taskAEdited = { ...taskA, updated_at: '2026-06-25T00:00:00.000Z' };
		expect(buildScopedSuggestionFingerprint([taskAEdited, taskB])).not.toBe(stamp);

		// ...but the fingerprint only spans the referenced pair, so editing an
		// UNRELATED task never enters this hash — the core over-invalidation fix.
		const taskCUnrelated: ProjectLoopScopedEntity = {
			kind: 'task',
			id: 'task-c',
			title: 'Unrelated work',
			state_key: 'todo',
			updated_at: '2026-06-30T00:00:00.000Z',
			parent_id: null
		};
		expect([taskA, taskB]).not.toContain(taskCUnrelated);
		expect(buildScopedSuggestionFingerprint([taskA, taskB])).toBe(stamp);
	});

	it('summarizes root-wrapped document trees and exposes parent links', () => {
		const structure = {
			root: [
				{
					id: 'doc-a',
					children: [{ id: 'doc-b', children: [] }]
				}
			]
		};
		const titleById = new Map([
			['doc-a', 'Launch plan'],
			['doc-b', 'Beta notes']
		]);

		expect([...buildProjectLoopParentMap(structure).entries()]).toEqual([
			['doc-a', null],
			['doc-b', 'doc-a']
		]);
		expect(summarizeProjectLoopDocTree(structure, titleById)).toBe(
			'- Launch plan\n  - Beta notes'
		);
	});

	it('reads project-loop queue metadata defensively', () => {
		expect(
			readProjectLoopQueueMetadata({
				mode: 'complete_audit',
				runId: 'run-1',
				auditId: 'audit-1',
				projectId: 'project-1',
				userId: 'user-1',
				triggerReason: 'manual',
				ignored: 'value'
			})
		).toEqual({
			mode: 'complete_audit',
			runId: 'run-1',
			auditId: 'audit-1',
			projectId: 'project-1',
			userId: 'user-1',
			triggerReason: 'manual'
		});
		expect(readProjectLoopQueueMetadata(null)).toEqual({});
		expect(readProjectLoopQueueMetadata({ runId: '   ', auditId: 42 })).toEqual({});
	});
});
