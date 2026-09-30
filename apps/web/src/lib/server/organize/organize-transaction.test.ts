// apps/web/src/lib/server/organize/organize-transaction.test.ts
import { describe, it, expect } from 'vitest';
import { organizeFixtures } from '$lib/components/organize/organize-fixtures';
import { previewOrganizePlan, type OrganizeMove } from '$lib/components/organize/organize-plan';
import {
	compileOrganizePlan,
	buildOrganizeInverse,
	type ManifestStep
} from './organize-transaction';
const move: OrganizeMove = {
	kind: 'document',
	id: 'brief',
	project_id: 'source',
	destination_project_id: 'dest',
	parent_id: 'shared',
	position: 0
};
const step: ManifestStep = {
	kind: 'document',
	id: 'brief',
	before: { project_id: 'source', parent_id: null, position: 0 },
	after: { project_id: 'dest', parent_id: 'shared', position: 0 },
	subtree: { id: 'brief', children: [{ id: 'research', children: [] }] }
};
describe('Organize transaction compiler and inverse', () => {
	it('rebuilds trees from fresh snapshots without mutating their versions', () => {
		const projects = organizeFixtures();
		const plan = compileOrganizePlan(projects, [move]);
		expect(plan.projects[0]).toEqual({ id: 'source', updated_at: projects[0]!.updated_at });
		expect(plan.trees[1]!.root[0]!.children?.[0]?.id).toBe('brief');
		expect(projects[0]!.structure.root[0]!.id).toBe('brief');
	});
	it('replays the full sequence when a subtree moves twice', () => {
		const moves = [
			move,
			{
				...move,
				project_id: 'dest',
				destination_project_id: 'source',
				parent_id: null,
				position: 1
			}
		];
		const plan = compileOrganizePlan(organizeFixtures(), moves);
		expect(plan.trees[0]!.root[1]!.id).toBe('brief');
		expect(plan.trees[1]!.root[0]!.children ?? []).toHaveLength(0);
	});
	it('rejects an invalid final step without returning a partial plan', () => {
		expect(() =>
			compileOrganizePlan(organizeFixtures(), [move, { ...move, id: 'start' }])
		).toThrow('START HERE');
	});
	it('inverts a subtree move and preserves content edits', () => {
		const projects = previewOrganizePlan(organizeFixtures(), [move]).projects;
		projects[1]!.documents.find((d) => d.id === 'research')!.title = 'Edited after move';
		// JSONB serializes object keys differently from JS insertion order.
		const manifest = JSON.parse(
			JSON.stringify(step).replace(
				'"id":"research","children":[]',
				'"children":[],"id":"research"'
			)
		);
		const inverse = buildOrganizeInverse(projects, [manifest]);
		expect(inverse.skipped).toEqual([]);
		const restored = previewOrganizePlan(projects, inverse.moves).projects;
		expect(restored[0]!.documents.find((d) => d.id === 'research')!.title).toBe(
			'Edited after move'
		);
		expect(restored[0]!.structure.root[0]!.id).toBe('brief');
	});
	it('skips a subtree with a new child instead of moving unrelated work', () => {
		const projects = previewOrganizePlan(organizeFixtures(), [move]).projects;
		projects[1]!.documents.push({
			id: 'new',
			title: 'New',
			type_key: 'document.default',
			updated_at: 'new'
		});
		projects[1]!.structure.root[0]!.children![0]!.children!.push({ id: 'new', order: 1 });
		const inverse = buildOrganizeInverse(projects, [step]);
		expect(inverse.moves).toEqual([]);
		expect(inverse.skipped[0]!.reason).toContain('subtree changed');
	});
	it('skips an item that was moved again after the batch', () => {
		const projects = previewOrganizePlan(organizeFixtures(), [
			move,
			{ ...move, project_id: 'dest', parent_id: null, position: 1 }
		]).projects;
		expect(buildOrganizeInverse(projects, [step]).skipped[0]!.reason).toContain(
			'moved or reordered'
		);
	});
	it('reverses repeated moves in order', () => {
		const second = {
			...move,
			project_id: 'dest',
			destination_project_id: 'source',
			parent_id: null,
			position: 1
		};
		const projects = previewOrganizePlan(organizeFixtures(), [move, second]).projects;
		const inverse = buildOrganizeInverse(projects, [
			step,
			{
				...step,
				before: step.after,
				after: { project_id: 'source', parent_id: null, position: 1 }
			}
		]);
		expect(inverse.moves).toHaveLength(2);
		expect(inverse.skipped).toEqual([]);
		expect(
			previewOrganizePlan(projects, inverse.moves).projects[0]!.structure.root[0]!.id
		).toBe('brief');
	});
	it('undoes unchanged tasks while reporting moved documents as skipped', () => {
		const taskStep: ManifestStep = {
			kind: 'task',
			id: 'task',
			before: { project_id: 'source', parent_id: null, position: 0 },
			after: { project_id: 'dest', parent_id: null, position: 0 },
			subtree: null
		};
		const projects = previewOrganizePlan(organizeFixtures(), [
			{ ...move, kind: 'task', id: 'task', parent_id: null }
		]).projects;
		const inverse = buildOrganizeInverse(projects, [step, taskStep]);
		expect(inverse.moves.map((m) => m.id)).toEqual(['task']);
		expect(inverse.skipped.map((s) => s.id)).toEqual(['brief']);
	});
});
