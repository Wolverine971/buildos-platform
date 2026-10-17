// packages/shared-types/src/project-family.types.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildProjectHierarchyIndexV1,
	parseProjectFamilyV1,
	projectHierarchyFieldsV1
} from './project-family.types';

describe('parseProjectFamilyV1', () => {
	it('parses a child with a readable parent and a shelf', () => {
		const family = parseProjectFamilyV1({
			project_id: 'child',
			parent: {
				id: 'hub',
				name: 'Wayne Strategies',
				state_key: 'active',
				can_write: true,
				shared_folder_document_id: 'folder',
				child_count: 5
			},
			shelf: [
				{
					id: 'doc-1',
					title: 'Brand Direction',
					description: null,
					type_key: 'document.default',
					state_key: 'ready',
					updated_at: '2026-09-30T00:00:00Z',
					tree_parent_id: null,
					depth: 0
				},
				{ title: 'missing id is dropped' }
			],
			children: [],
			own_shared_folder_document_id: null,
			child_count: 0
		});
		expect(family?.parent).toMatchObject({ id: 'hub', can_write: true, child_count: 5 });
		expect(family?.shelf.map((doc) => doc.id)).toEqual(['doc-1']);
	});

	it('drops the shelf when there is no readable parent', () => {
		const family = parseProjectFamilyV1({
			project_id: 'child',
			parent: null,
			shelf: [{ id: 'leak', title: 'Should not appear' }],
			children: [
				{
					id: 'kid',
					name: 'Redline',
					state_key: 'active',
					next_step_short: null,
					can_detach: true
				}
			],
			own_shared_folder_document_id: 'folder',
			child_count: 2
		});
		expect(family?.parent).toBeNull();
		expect(family?.shelf).toEqual([]);
		expect(family?.children).toEqual([
			{
				id: 'kid',
				name: 'Redline',
				state_key: 'active',
				next_step_short: null,
				updated_at: '',
				can_detach: true
			}
		]);
		expect(family?.child_count).toBe(2);
	});

	it('returns null for unusable input', () => {
		expect(parseProjectFamilyV1(null)).toBeNull();
		expect(parseProjectFamilyV1({ parent: null })).toBeNull();
		expect(parseProjectFamilyV1([])).toBeNull();
	});
});

describe('buildProjectHierarchyIndexV1 (tasker 122)', () => {
	const accessible = [
		{ id: 'hub', name: 'Wayne Strategies' },
		{ id: 'cadre', name: 'Cadre' },
		{ id: 'redline', name: 'Redline' },
		{ id: 'solo', name: 'Solo' }
	];
	const rows = [
		{ id: 'cadre', parent_project_id: 'hub' },
		{ id: 'redline', parent_project_id: 'hub' },
		// The viewer can't open this parent: no name, no link.
		{ id: 'solo', parent_project_id: 'secret-parent' },
		{ id: 'hub', parent_project_id: null },
		// A child the viewer can't open is never counted.
		{ id: 'secret-child', parent_project_id: 'hub' }
	];

	it('names a parent only when the viewer can open it', () => {
		const index = buildProjectHierarchyIndexV1(rows, accessible);
		expect(projectHierarchyFieldsV1(index, 'cadre')).toEqual({
			parent: { id: 'hub', name: 'Wayne Strategies' }
		});
		expect(projectHierarchyFieldsV1(index, 'solo')).toEqual({});
		expect(JSON.stringify([...index.parentOf.values()])).not.toContain('secret');
	});

	it('counts and lists only accessible sub-projects, capped by the limit', () => {
		const index = buildProjectHierarchyIndexV1(rows, accessible);
		expect(projectHierarchyFieldsV1(index, 'hub')).toEqual({ sub_project_count: 2 });
		expect(projectHierarchyFieldsV1(index, 'hub', { subProjectLimit: 1 })).toEqual({
			sub_project_count: 2,
			sub_projects: [{ id: 'cadre', name: 'Cadre' }]
		});
	});

	it('returns no fields for a missing index or unusable rows', () => {
		expect(projectHierarchyFieldsV1(null, 'hub')).toEqual({});
		const index = buildProjectHierarchyIndexV1('not rows', accessible);
		expect(projectHierarchyFieldsV1(index, 'cadre')).toEqual({});
	});
});
