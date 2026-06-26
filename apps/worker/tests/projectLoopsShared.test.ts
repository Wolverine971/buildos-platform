// apps/worker/tests/projectLoopsShared.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildProjectLoopParentMap,
	buildProjectLoopSourceFingerprint,
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
});
