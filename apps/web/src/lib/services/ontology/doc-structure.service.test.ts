// apps/web/src/lib/services/ontology/doc-structure.service.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { DocTreeNode, OntoDocument } from '$lib/types/onto-api';
import {
	collectDocIds,
	findNodeById,
	getNodePath,
	wouldCreateCycle,
	removeNodeFromTree,
	removeNodeFromTreePromoteChildren,
	insertNodeIntoTree,
	reorderNodes,
	enrichTreeNodes,
	getDocTree,
	updateDocStructure,
	archiveDocumentInTree,
	restoreDocumentInTree,
	deleteDocumentInTree,
	removeDocumentFromTree,
	recomputeDocStructure
} from './doc-structure.service';

const baseTree: DocTreeNode[] = [
	{
		id: 'a',
		order: 0,
		children: [
			{ id: 'b', order: 0 },
			{
				id: 'c',
				order: 1,
				children: [{ id: 'd', order: 0 }]
			}
		]
	},
	{ id: 'e', order: 1 }
];

const doc = (id: string, title: string): OntoDocument => ({
	id,
	project_id: 'proj-1',
	type_key: 'document',
	title,
	state_key: 'draft',
	props: null,
	created_by: 'actor-1',
	created_at: '2026-01-01T00:00:00Z',
	updated_at: '2026-01-01T00:00:00Z'
});

describe('doc-structure tree utilities', () => {
	it('collectDocIds gathers every node id', () => {
		const ids = collectDocIds(baseTree);
		expect([...ids].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
	});

	it('findNodeById returns node, parent, and index', () => {
		const found = findNodeById(baseTree, 'c');
		expect(found?.node.id).toBe('c');
		expect(found?.parent?.id).toBe('a');
		expect(found?.index).toBe(1);
	});

	it('getNodePath returns full ancestor path', () => {
		const path = getNodePath(baseTree, 'd');
		expect(path).toEqual(['a', 'c', 'd']);
	});

	it('wouldCreateCycle detects descendant moves', () => {
		expect(wouldCreateCycle(baseTree, 'a', 'd')).toBe(true);
		expect(wouldCreateCycle(baseTree, 'a', 'a')).toBe(true);
		expect(wouldCreateCycle(baseTree, 'd', 'e')).toBe(false);
	});

	it('removeNodeFromTree removes nodes and reorders siblings', () => {
		const updated = removeNodeFromTree(baseTree, 'e');
		expect(updated).toHaveLength(1);
		expect(updated[0].id).toBe('a');
		expect(updated[0].order).toBe(0);
	});

	it('removeNodeFromTreePromoteChildren lifts children into parent level', () => {
		const updated = removeNodeFromTreePromoteChildren(baseTree, 'c');
		const children = updated[0].children ?? [];
		expect(children.map((child) => child.id)).toEqual(['b', 'd']);
		expect(children.map((child) => child.order)).toEqual([0, 1]);
	});

	it('removeNodeFromTreePromoteChildren promotes root children when removing root', () => {
		const updated = removeNodeFromTreePromoteChildren(baseTree, 'a');
		expect(updated.map((node) => node.id)).toEqual(['b', 'c', 'e']);
		expect(updated.map((node) => node.order)).toEqual([0, 1, 2]);
	});

	it('insertNodeIntoTree inserts at specified position and reorders', () => {
		const newNode: DocTreeNode = { id: 'f', order: 0 };
		const updated = insertNodeIntoTree(baseTree, newNode, 'a', 1);
		const children = updated[0].children ?? [];
		expect(children.map((child) => child.id)).toEqual(['b', 'f', 'c']);
		expect(children.map((child) => child.order)).toEqual([0, 1, 2]);
	});

	it('insertNodeIntoTree inserts at root when parentId is null', () => {
		const newNode: DocTreeNode = { id: 'f', order: 0 };
		const updated = insertNodeIntoTree(baseTree, newNode, null, 1);
		expect(updated.map((node) => node.id)).toEqual(['a', 'f', 'e']);
		expect(updated.map((node) => node.order)).toEqual([0, 1, 2]);
	});

	it('reorderNodes assigns sequential order values', () => {
		const reordered = reorderNodes([
			{ id: 'x', order: 5 },
			{ id: 'y', order: 9 }
		]);
		expect(reordered.map((node) => node.order)).toEqual([0, 1]);
	});
});

describe('enrichTreeNodes', () => {
	it('computes folder/doc types from children', () => {
		const documents: Record<string, OntoDocument> = {
			a: doc('a', 'Alpha'),
			b: doc('b', 'Beta')
		};

		const nodes: DocTreeNode[] = [{ id: 'a', order: 0, children: [{ id: 'b', order: 0 }] }];

		const enriched = enrichTreeNodes(nodes, documents);
		expect(enriched[0].type).toBe('folder');
		expect(enriched[0].children?.[0].type).toBe('doc');
		expect(enriched[0].title).toBe('Alpha');
		expect(enriched[0].children?.[0].title).toBe('Beta');
	});
});

describe('getDocTree', () => {
	it('uses the lean document-tree metadata RPC when content is excluded', async () => {
		const metadataDocument = {
			id: 'a',
			title: 'Alpha',
			type_key: 'document',
			state_key: 'draft',
			description: null,
			created_at: '2026-01-01T00:00:00Z',
			updated_at: '2026-01-02T00:00:00Z',
			has_content: true
		};
		const projectQuery = {
			select: vi.fn(),
			eq: vi.fn(),
			single: vi.fn()
		};
		projectQuery.select.mockReturnValue(projectQuery);
		projectQuery.eq.mockReturnValue(projectQuery);
		projectQuery.single.mockResolvedValue({
			data: { doc_structure: { version: 1, root: [{ id: 'a', order: 0 }] } },
			error: null
		});
		const supabase = {
			from: vi.fn((table: string) => {
				if (table !== 'onto_projects') {
					throw new Error(`Unexpected table query: ${table}`);
				}
				return projectQuery;
			}),
			rpc: vi.fn().mockResolvedValue({ data: [metadataDocument], error: null })
		};

		const result = await getDocTree(supabase as any, 'proj-1', { includeContent: false });

		expect(supabase.rpc).toHaveBeenCalledWith('get_project_document_tree_metadata', {
			p_project_id: 'proj-1'
		});
		expect(supabase.from).toHaveBeenCalledTimes(1);
		expect(result.documents.a).toEqual(metadataDocument);
		expect(result.documents.a).not.toHaveProperty('content');
		expect(result.documents.a).not.toHaveProperty('props');
		expect(result.documents.a).not.toHaveProperty('children');
	});
});

describe('updateDocStructure', () => {
	it('delegates the canonical tree, history, and changed children to one atomic RPC', async () => {
		const currentStructure = {
			version: 1,
			root: [
				{
					id: 'parent-a',
					order: 0,
					children: [{ id: 'moved-doc', order: 0 }]
				},
				{ id: 'parent-b', order: 1 }
			]
		};
		const nextStructure = {
			version: 1,
			root: [
				{ id: 'parent-a', order: 0 },
				{
					id: 'parent-b',
					order: 1,
					children: [{ id: 'moved-doc', order: 0 }]
				}
			]
		};

		const projectReadQuery: Record<string, any> = {};
		projectReadQuery.select = vi.fn(() => projectReadQuery);
		projectReadQuery.eq = vi.fn(() => projectReadQuery);
		projectReadQuery.single = vi.fn().mockResolvedValue({
			data: { doc_structure: currentStructure },
			error: null
		});
		const rpc = vi.fn().mockResolvedValue({
			data: { ...nextStructure, version: 2 },
			error: null
		});
		const supabase = {
			from: vi.fn((table: string) => {
				if (table === 'onto_projects') return projectReadQuery;
				throw new Error(`Unexpected non-transactional table write: ${table}`);
			}),
			rpc
		};

		const result = await updateDocStructure(
			supabase as any,
			'proj-1',
			nextStructure,
			'move',
			'actor-1'
		);

		expect(result).toEqual({ ...nextStructure, version: 2 });
		expect(supabase.from).toHaveBeenCalledTimes(1);
		expect(rpc).toHaveBeenCalledWith('onto_project_doc_structure_update_atomic', {
			p_project_id: 'proj-1',
			p_expected_version: 1,
			p_next_structure: { ...nextStructure, version: 2 },
			p_change_type: 'move',
			p_changed_by: 'actor-1',
			p_children_updates: [
				{ document_id: 'parent-a', children: [] },
				{
					document_id: 'parent-b',
					children: [{ id: 'moved-doc', order: 0 }]
				}
			]
		});
	});

	it('rejects a write-time version race before history or child synchronization', async () => {
		const currentStructure = {
			version: 1,
			root: [{ id: 'a', order: 0 }]
		};
		const nextStructure = {
			version: 1,
			root: [
				{ id: 'a', order: 0 },
				{ id: 'b', order: 1 }
			]
		};

		const projectReadQuery = {
			select: vi.fn(),
			eq: vi.fn(),
			single: vi.fn()
		};
		projectReadQuery.select.mockReturnValue(projectReadQuery);
		projectReadQuery.eq.mockReturnValue(projectReadQuery);
		projectReadQuery.single.mockResolvedValue({
			data: { doc_structure: currentStructure },
			error: null
		});

		const rpc = vi.fn().mockResolvedValue({
			data: null,
			error: { message: 'doc_structure_version_conflict' }
		});
		const supabase = {
			from: vi.fn((table: string) => {
				if (table === 'onto_projects') return projectReadQuery;
				throw new Error(`Unexpected table query: ${table}`);
			}),
			rpc
		};

		await expect(
			updateDocStructure(supabase as any, 'proj-1', nextStructure, 'reorder', 'actor-1')
		).rejects.toThrow('Structure version conflict');

		expect(supabase.from).toHaveBeenCalledTimes(1);
		expect(rpc).toHaveBeenCalledOnce();
	});

	it('synchronizes children only for parents changed by a move', async () => {
		const currentStructure = {
			version: 1,
			root: [
				{
					id: 'parent-a',
					order: 0,
					children: [
						{ id: 'moved-doc', order: 0 },
						{ id: 'sibling-a', order: 1 }
					]
				},
				{ id: 'parent-b', order: 1 },
				{
					id: 'untouched-parent',
					order: 2,
					children: [{ id: 'untouched-child', order: 0 }]
				}
			]
		};
		const nextStructure = {
			version: 1,
			root: [
				{
					id: 'parent-a',
					order: 0,
					children: [{ id: 'sibling-a', order: 0 }]
				},
				{
					id: 'parent-b',
					order: 1,
					children: [{ id: 'moved-doc', order: 0 }]
				},
				{
					id: 'untouched-parent',
					order: 2,
					children: [{ id: 'untouched-child', order: 0 }]
				}
			]
		};

		const projectReadQuery: Record<string, any> = {};
		projectReadQuery.select = vi.fn(() => projectReadQuery);
		projectReadQuery.eq = vi.fn(() => projectReadQuery);
		projectReadQuery.single = vi.fn().mockResolvedValue({
			data: { doc_structure: currentStructure },
			error: null
		});

		const rpc = vi.fn().mockResolvedValue({ data: { version: 2 }, error: null });
		const supabase = {
			from: vi.fn((table: string) => {
				if (table === 'onto_projects') return projectReadQuery;
				throw new Error(`Unexpected table query: ${table}`);
			}),
			rpc
		};

		await updateDocStructure(supabase as any, 'proj-1', nextStructure, 'move', 'actor-1');

		expect(rpc).toHaveBeenCalledWith(
			'onto_project_doc_structure_update_atomic',
			expect.objectContaining({
				p_children_updates: [
					{
						document_id: 'parent-a',
						children: [{ id: 'sibling-a', order: 0 }]
					},
					{
						document_id: 'parent-b',
						children: [{ id: 'moved-doc', order: 0 }]
					}
				]
			})
		);
	});
});

describe('removeDocumentFromTree', () => {
	it('uses structure-only reads and does not load document bodies', async () => {
		const currentStructure = {
			version: 1,
			root: [{ id: 'a', order: 0, title: 'Alpha' }]
		};

		function createProjectReadQuery() {
			const query: Record<string, any> = {};
			query.select = vi.fn(() => query);
			query.eq = vi.fn(() => query);
			query.single = vi.fn().mockResolvedValue({
				data: { doc_structure: currentStructure },
				error: null
			});
			return query;
		}

		const rpc = vi.fn().mockResolvedValue({ data: { version: 2 }, error: null });
		const supabase = {
			from: vi.fn((table: string) => {
				if (table === 'onto_projects') {
					return createProjectReadQuery();
				}
				if (table === 'onto_project_structure_history') {
					throw new Error('History must be written inside the atomic RPC');
				}
				if (table === 'onto_documents') {
					throw new Error(
						'Document rows should not be loaded for a structure-only removal'
					);
				}
				throw new Error(`Unexpected table query: ${table}`);
			}),
			rpc
		};

		const result = await removeDocumentFromTree(
			supabase as any,
			'proj-1',
			'a',
			{ mode: 'cascade' },
			'actor-1'
		);

		expect(result).toEqual({ version: 2, root: [] });
		expect(supabase.from).not.toHaveBeenCalledWith('onto_documents');
		expect(rpc).toHaveBeenCalledWith(
			'onto_project_doc_structure_update_atomic',
			expect.objectContaining({
				p_change_type: 'delete',
				p_children_updates: []
			})
		);
	});
});

describe('archiveDocumentInTree', () => {
	it('archives a subtree and its tree mutation through one atomic RPC', async () => {
		const currentStructure = {
			version: 4,
			root: [
				{
					id: 'parent-a',
					order: 0,
					children: [
						{ id: 'child-a', order: 0 },
						{
							id: 'child-b',
							order: 1,
							children: [{ id: 'grandchild-a', order: 0 }]
						}
					]
				},
				{ id: 'unrelated-root', order: 1 }
			]
		};
		const nextStructure = {
			version: 5,
			root: [{ id: 'unrelated-root', order: 0 }]
		};
		const archivedDocument = {
			...doc('parent-a', 'Parent A'),
			state_key: 'archived',
			updated_at: '2026-08-03T12:00:01Z'
		};

		const projectReadQuery: Record<string, any> = {};
		projectReadQuery.select = vi.fn(() => projectReadQuery);
		projectReadQuery.eq = vi.fn(() => projectReadQuery);
		projectReadQuery.single = vi.fn().mockResolvedValue({
			data: { doc_structure: currentStructure },
			error: null
		});
		const rpc = vi.fn().mockResolvedValue({
			data: {
				document: archivedDocument,
				structure: nextStructure,
				archived_document_ids: ['parent-a', 'child-a', 'child-b', 'grandchild-a']
			},
			error: null
		});
		const supabase = {
			from: vi.fn((table: string) => {
				if (table === 'onto_projects') return projectReadQuery;
				throw new Error(`Unexpected non-transactional table operation: ${table}`);
			}),
			rpc
		};

		const result = await archiveDocumentInTree(
			supabase as any,
			'proj-1',
			'parent-a',
			{
				mode: 'archive_children',
				expectedUpdatedAt: '2026-08-03T12:00:00Z'
			},
			'actor-1'
		);

		expect(result).toEqual({
			document: archivedDocument,
			structure: nextStructure,
			archivedDocumentIds: ['parent-a', 'child-a', 'child-b', 'grandchild-a'],
			archiveMode: 'archive_children'
		});
		expect(supabase.from).toHaveBeenCalledTimes(1);
		expect(rpc).toHaveBeenCalledWith('onto_document_archive_atomic', {
			p_project_id: 'proj-1',
			p_document_id: 'parent-a',
			p_document_ids: ['parent-a', 'child-a', 'child-b', 'grandchild-a'],
			p_expected_updated_at: '2026-08-03T12:00:00Z',
			p_expected_structure_version: 4,
			p_next_structure: nextStructure,
			p_changed_by: 'actor-1',
			p_children_updates: [
				{ document_id: 'parent-a', children: [] },
				{ document_id: 'child-b', children: [] }
			]
		});
	});

	it('archives an already-unlinked document without inventing a tree write', async () => {
		const currentStructure = {
			version: 7,
			root: [{ id: 'unrelated-root', order: 0 }]
		};
		const archivedDocument = {
			...doc('unlinked-doc', 'Unlinked'),
			state_key: 'archived'
		};
		const projectReadQuery: Record<string, any> = {};
		projectReadQuery.select = vi.fn(() => projectReadQuery);
		projectReadQuery.eq = vi.fn(() => projectReadQuery);
		projectReadQuery.single = vi.fn().mockResolvedValue({
			data: { doc_structure: currentStructure },
			error: null
		});
		const rpc = vi.fn().mockResolvedValue({
			data: {
				document: archivedDocument,
				structure: null,
				archived_document_ids: ['unlinked-doc']
			},
			error: null
		});
		const supabase = {
			from: vi.fn(() => projectReadQuery),
			rpc
		};

		const result = await archiveDocumentInTree(
			supabase as any,
			'proj-1',
			'unlinked-doc',
			{
				mode: 'archive_children',
				expectedUpdatedAt: '2026-08-03T12:00:00Z'
			},
			'actor-1'
		);

		expect(result.structure).toBeNull();
		expect(rpc).toHaveBeenCalledWith(
			'onto_document_archive_atomic',
			expect.objectContaining({
				p_document_ids: ['unlinked-doc'],
				p_expected_structure_version: null,
				p_next_structure: null,
				p_children_updates: []
			})
		);
	});
});

describe('restoreDocumentInTree', () => {
	it('restores an unlinked document without a no-op structure mutation', async () => {
		const currentStructure = {
			version: 7,
			root: [{ id: 'unrelated-root', order: 0 }]
		};
		const restoredDocument = {
			...doc('archived-doc', 'Archived'),
			state_key: 'draft',
			updated_at: '2026-08-03T12:00:01Z'
		};
		const projectReadQuery: Record<string, any> = {};
		projectReadQuery.select = vi.fn(() => projectReadQuery);
		projectReadQuery.eq = vi.fn(() => projectReadQuery);
		projectReadQuery.single = vi.fn().mockResolvedValue({
			data: { doc_structure: currentStructure },
			error: null
		});
		const rpc = vi.fn().mockResolvedValue({
			data: {
				document: restoredDocument,
				structure: currentStructure
			},
			error: null
		});
		const supabase = {
			from: vi.fn(() => projectReadQuery),
			rpc
		};

		const result = await restoreDocumentInTree(
			supabase as any,
			'proj-1',
			'archived-doc',
			{
				restoreStateKey: 'draft',
				expectedUpdatedAt: '2026-08-03T12:00:00Z'
			},
			'actor-1'
		);

		expect(result).toEqual({
			document: restoredDocument,
			structure: currentStructure
		});
		expect(rpc).toHaveBeenCalledWith('onto_document_restore_atomic', {
			p_project_id: 'proj-1',
			p_document_id: 'archived-doc',
			p_restore_state_key: 'draft',
			p_expected_updated_at: '2026-08-03T12:00:00Z',
			p_expected_structure_version: 7,
			p_next_structure: null,
			p_changed_by: 'actor-1',
			p_children_updates: []
		});
	});
});

describe('deleteDocumentInTree', () => {
	it('soft-deletes a document and promotes its children through one atomic RPC', async () => {
		const currentStructure = {
			version: 3,
			root: [
				{
					id: 'parent-a',
					order: 0,
					children: [
						{
							id: 'deleted-doc',
							order: 0,
							children: [{ id: 'promoted-child', order: 0 }]
						},
						{ id: 'sibling-doc', order: 1 }
					]
				}
			]
		};
		const nextStructure = {
			version: 4,
			root: [
				{
					id: 'parent-a',
					order: 0,
					children: [
						{ id: 'promoted-child', order: 0 },
						{ id: 'sibling-doc', order: 1 }
					]
				}
			]
		};
		const projectReadQuery: Record<string, any> = {};
		projectReadQuery.select = vi.fn(() => projectReadQuery);
		projectReadQuery.eq = vi.fn(() => projectReadQuery);
		projectReadQuery.single = vi.fn().mockResolvedValue({
			data: { doc_structure: currentStructure },
			error: null
		});
		const rpc = vi.fn().mockResolvedValue({
			data: { structure: nextStructure, permanent: false },
			error: null
		});
		const supabase = {
			from: vi.fn((table: string) => {
				if (table === 'onto_projects') return projectReadQuery;
				throw new Error(`Unexpected non-transactional table operation: ${table}`);
			}),
			rpc
		};

		const result = await deleteDocumentInTree(
			supabase as any,
			'proj-1',
			'deleted-doc',
			{
				mode: 'promote',
				permanent: false,
				expectedUpdatedAt: '2026-08-03T13:30:00Z'
			},
			'actor-1'
		);

		expect(result).toEqual({ structure: nextStructure, permanent: false });
		expect(supabase.from).toHaveBeenCalledTimes(1);
		expect(rpc).toHaveBeenCalledWith('onto_document_delete_atomic', {
			p_project_id: 'proj-1',
			p_document_id: 'deleted-doc',
			p_permanent: false,
			p_expected_updated_at: '2026-08-03T13:30:00Z',
			p_expected_structure_version: 3,
			p_next_structure: nextStructure,
			p_changed_by: 'actor-1',
			p_children_updates: [
				{
					document_id: 'parent-a',
					children: [
						{ id: 'promoted-child', order: 0 },
						{ id: 'sibling-doc', order: 1 }
					]
				},
				{ document_id: 'deleted-doc', children: [] }
			]
		});
	});
});

describe('recomputeDocStructure', () => {
	it('loads only document metadata when rebuilding the tree', async () => {
		const currentStructure = {
			version: 1,
			root: [{ id: 'a', order: 0 }]
		};
		const documentSelections: string[] = [];

		function createProjectReadQuery() {
			const query: Record<string, any> = {};
			query.select = vi.fn(() => query);
			query.eq = vi.fn(() => query);
			query.single = vi.fn().mockResolvedValue({
				data: { doc_structure: currentStructure },
				error: null
			});
			return query;
		}

		function createDocumentQuery() {
			const query: Record<string, any> = {};
			query.select = vi.fn((fields: string) => {
				documentSelections.push(fields);
				return query;
			});
			query.eq = vi.fn(() => query);
			query.is = vi.fn(() => query);
			query.then = (
				onfulfilled: (value: { data?: unknown; error: null }) => unknown,
				onrejected?: (reason: unknown) => unknown
			) =>
				Promise.resolve({
					data: [{ id: 'a', title: 'Alpha', description: 'Summary' }],
					error: null
				}).then(onfulfilled, onrejected);
			return query;
		}

		const rpc = vi.fn().mockResolvedValue({ data: { version: 2 }, error: null });
		const supabase = {
			from: vi.fn((table: string) => {
				if (table === 'onto_projects') {
					return createProjectReadQuery();
				}
				if (table === 'onto_documents') {
					return createDocumentQuery();
				}
				if (table === 'onto_project_structure_history') {
					throw new Error('History must be written inside the atomic RPC');
				}
				throw new Error(`Unexpected table query: ${table}`);
			}),
			rpc
		};

		const result = await recomputeDocStructure(supabase as any, 'proj-1', 'actor-1');

		expect(result).toEqual({
			version: 2,
			root: [{ id: 'a', order: 0, title: 'Alpha', description: 'Summary' }]
		});
		expect(documentSelections).toEqual(['id, title, description']);
	});
});
