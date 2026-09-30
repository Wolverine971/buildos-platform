// packages/shared-types/src/project-family.types.test.ts
import { describe, expect, it } from 'vitest';
import { parseProjectFamilyV1 } from './project-family.types';

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
			children: [{ id: 'kid', name: 'Redline', state_key: 'active', next_step_short: null }],
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
				updated_at: ''
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
