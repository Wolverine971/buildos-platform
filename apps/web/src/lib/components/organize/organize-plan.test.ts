// apps/web/src/lib/components/organize/organize-plan.test.ts
import { describe, expect, it } from 'vitest';
import { previewOrganizePlan, visibleDocumentTree, type OrganizeMove } from './organize-plan';
import { organizeFixtures } from './organize-fixtures';

const move: OrganizeMove = {
	kind: 'document',
	id: 'brief',
	project_id: 'source',
	destination_project_id: 'dest',
	parent_id: 'shared',
	position: 0
};

describe('Organize planner', () => {
	it('transfers a whole subtree into the shared folder, preserving ids, metadata, and input versions', () => {
		const baseline = organizeFixtures();
		const before = JSON.stringify(baseline);
		const result = previewOrganizePlan(baseline, [move]);
		expect(JSON.stringify(baseline)).toBe(before);
		expect(result.projects[0]!.documents.map((doc) => doc.id)).toEqual(['start', 'unlinked']);
		expect(result.projects[1]!.structure).toMatchObject({
			version: 8,
			root: [{ id: 'shared', children: [{ id: 'brief', children: [{ id: 'research' }] }] }]
		});
		expect(result.projects[1]!.documents.find((doc) => doc.id === 'research')?.updated_at).toBe(
			'v2'
		);
		expect(result.changes[0]).toMatchObject({
			child_count: 1,
			shared_with_count: 3,
			moved_ids: ['brief', 'research']
		});
	});

	it('can move a subtree back and undo the staged move by replaying its prefix', () => {
		const back: OrganizeMove = {
			...move,
			project_id: 'dest',
			destination_project_id: 'source',
			parent_id: null,
			position: 0
		};
		const result = previewOrganizePlan(organizeFixtures(), [move, back]);
		expect(result.projects[0]!.structure.root[0]?.id).toBe('brief');
		expect(result.projects[1]!.documents.map((doc) => doc.id)).toEqual(['shared']);
		expect(previewOrganizePlan(organizeFixtures(), [move]).projects[0]!.documents).toHaveLength(
			2
		);
	});

	it('handles in-project moves into and out of the shared folder', () => {
		const inside = previewOrganizePlan(organizeFixtures(), [move]).projects;
		const outside: OrganizeMove = {
			...move,
			project_id: 'dest',
			destination_project_id: 'dest',
			parent_id: null,
			position: 1
		};
		const result = previewOrganizePlan(inside, [outside]);
		expect(result.projects[1]!.structure.root.map((node) => node.id)).toEqual([
			'shared',
			'brief'
		]);
		expect(result.changes[0]!.shared_with_count).toBeNull();
	});

	it('moves unlinked docs without losing them or duplicating ids', () => {
		const result = previewOrganizePlan(organizeFixtures(), [{ ...move, id: 'unlinked' }]);
		expect(result.projects[1]!.structure.root[0]!.children?.[0]?.id).toBe('unlinked');
		expect(result.projects[0]!.documents.some((doc) => doc.id === 'unlinked')).toBe(false);
	});

	it('normalizes same-parent insertion coordinates after removal', () => {
		const result = previewOrganizePlan(organizeFixtures(), [
			{ ...move, destination_project_id: 'source', parent_id: null, position: 3 }
		]);
		expect(result.projects[0]!.structure.root.map((node) => node.id)).toEqual([
			'start',
			'unlinked',
			'brief'
		]);
	});

	it.each([
		[{ id: 'start' }, 'START HERE'],
		[
			{ id: 'shared', project_id: 'dest', destination_project_id: 'source', parent_id: null },
			'shared folder'
		],
		[{ destination_project_id: 'source', parent_id: 'research' }, 'own contents'],
		[{ parent_id: 'missing' }, 'no longer available'],
		[{ destination_project_id: 'missing' }, 'Open both'],
		[{ position: -1 }, 'valid destination'],
		[{ position: 999 }, 'no longer available'],
		[
			{ destination_project_id: 'source', parent_id: null, position: 1 },
			'Already in this position'
		]
	] as const)('rejects invalid plan %j', (overrides, message) => {
		expect(() => previewOrganizePlan(organizeFixtures(), [{ ...move, ...overrides }])).toThrow(
			message
		);
	});

	it('blocks protected descendants instead of bypassing pins by moving their parent', () => {
		const projects = organizeFixtures();
		projects[0]!.structure.root[0]!.children!.push({ id: 'start', order: 1 });
		expect(() => previewOrganizePlan(projects, [move])).toThrow('START HERE');
		projects[0]!.documents.find((doc) => doc.id === 'start')!.type_key =
			'document.context.thinking_log';
		expect(() => previewOrganizePlan(projects, [move])).toThrow('thinking log');
	});

	it.each([0, 1])('requires write access on project %s', (index) => {
		const projects = organizeFixtures();
		projects[index]!.can_write = false;
		expect(() => previewOrganizePlan(projects, [move])).toThrow('Edit access');
	});

	it('plans dated tasks and marks their calendar impact without performing synchronization', () => {
		const result = previewOrganizePlan(organizeFixtures(), [
			{ ...move, kind: 'task', id: 'task', parent_id: null }
		]);
		expect(result.projects[0]!.tasks).toHaveLength(0);
		expect(result.projects[1]!.tasks[0]).toMatchObject({ id: 'task', due_at: '2026-10-01' });
		expect(result.changes[0]!.scheduled).toBe(true);
		expect(() =>
			previewOrganizePlan(organizeFixtures(), [{ ...move, kind: 'task', id: 'task' }])
		).toThrow('not document folders');
	});

	it('does not hide live children beneath a stale tree parent', () => {
		const project = organizeFixtures()[0]!;
		project.documents = project.documents.filter((doc) => doc.id !== 'brief');
		expect(visibleDocumentTree(project).map((node) => node.id)).toEqual([
			'research',
			'start',
			'unlinked'
		]);
	});

	it('bounds plans and rejects duplicate project panes', () => {
		expect(() => previewOrganizePlan(organizeFixtures(), Array(201).fill(move))).toThrow('200');
		const project = organizeFixtures()[0]!;
		expect(() => previewOrganizePlan([project, project], [])).toThrow('different projects');
	});
});
