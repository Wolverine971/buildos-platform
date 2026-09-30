// apps/web/src/lib/components/organize/organize-fixtures.ts
// Offline fixtures shared by the planner and component tests.
import type { OrganizeProject } from './organize-plan';

export function organizeFixtures(): OrganizeProject[] {
	return [
		{
			id: 'source',
			name: 'Client project',
			can_write: true,
			updated_at: '2026-09-30T12:00:00Z',
			shared_folder_document_id: null,
			shared_with_count: 0,
			structure: {
				version: 4,
				root: [
					{ id: 'brief', order: 0, children: [{ id: 'research', order: 0 }] },
					{ id: 'start', order: 1 }
				]
			},
			documents: [
				{ id: 'brief', title: 'Brief', type_key: 'document.default', updated_at: 'v1' },
				{
					id: 'research',
					title: 'Research',
					type_key: 'document.default',
					updated_at: 'v2'
				},
				{
					id: 'start',
					title: 'START HERE',
					type_key: 'document.context.project',
					updated_at: 'v3'
				},
				{
					id: 'unlinked',
					title: 'Loose notes',
					type_key: 'document.default',
					updated_at: 'v4'
				}
			],
			tasks: [
				{
					id: 'task',
					title: 'Send proposal',
					state_key: 'todo',
					updated_at: 'v5',
					start_at: null,
					due_at: '2026-10-01'
				}
			]
		},
		{
			id: 'dest',
			name: 'Business',
			can_write: true,
			updated_at: '2026-09-30T12:00:00Z',
			shared_folder_document_id: 'shared',
			shared_with_count: 3,
			structure: { version: 8, root: [{ id: 'shared', type: 'folder', order: 0 }] },
			documents: [
				{
					id: 'shared',
					title: 'Shared with sub-projects',
					type_key: 'document.default',
					updated_at: 'v6'
				}
			],
			tasks: []
		}
	];
}
