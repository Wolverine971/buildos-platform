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

		const projectUpdateQuery: Record<string, any> = {};
		projectUpdateQuery.update = vi.fn(() => projectUpdateQuery);
		projectUpdateQuery.eq = vi.fn(() => projectUpdateQuery);
		projectUpdateQuery.is = vi.fn(() => projectUpdateQuery);
		projectUpdateQuery.contains = vi.fn(() => projectUpdateQuery);
		projectUpdateQuery.select = vi.fn(() => projectUpdateQuery);
		projectUpdateQuery.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
		// Preserve the pre-fix awaitable update shape so this regression fails on
		// behavior, not because the mock cannot model the old query chain.
		projectUpdateQuery.then = (
			onfulfilled: (value: { data: null; error: null }) => unknown,
			onrejected?: (reason: unknown) => unknown
		) => Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);

		const historyInsert = vi.fn().mockResolvedValue({ error: null });
		const documentUpdateQuery: Record<string, any> = {};
		documentUpdateQuery.update = vi.fn(() => documentUpdateQuery);
		documentUpdateQuery.eq = vi.fn(() => documentUpdateQuery);
		documentUpdateQuery.then = (
			onfulfilled: (value: { error: null }) => unknown,
			onrejected?: (reason: unknown) => unknown
		) => Promise.resolve({ error: null }).then(onfulfilled, onrejected);

		let projectQueryCount = 0;
		const supabase = {
			from: vi.fn((table: string) => {
				if (table === 'onto_projects') {
					projectQueryCount += 1;
					return projectQueryCount === 1 ? projectReadQuery : projectUpdateQuery;
				}
				if (table === 'onto_project_structure_history') {
					return { insert: historyInsert };
				}
				if (table === 'onto_documents') {
					return documentUpdateQuery;
				}
				throw new Error(`Unexpected table query: ${table}`);
			})
		};

		await expect(
			updateDocStructure(supabase as any, 'proj-1', nextStructure, 'reorder', 'actor-1')
		).rejects.toThrow('Structure version conflict');

		expect(projectUpdateQuery.contains).toHaveBeenCalledWith('doc_structure', {
			version: 1
		});
		expect(historyInsert).not.toHaveBeenCalled();
		expect(documentUpdateQuery.update).not.toHaveBeenCalled();
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

		const projectUpdateQuery: Record<string, any> = {};
		projectUpdateQuery.update = vi.fn(() => projectUpdateQuery);
		projectUpdateQuery.eq = vi.fn(() => projectUpdateQuery);
		projectUpdateQuery.contains = vi.fn(() => projectUpdateQuery);
		projectUpdateQuery.select = vi.fn(() => projectUpdateQuery);
		projectUpdateQuery.maybeSingle = vi
			.fn()
			.mockResolvedValue({ data: { id: 'proj-1' }, error: null });

		const childrenUpdates: Array<{ id: string; children: unknown }> = [];
		function createDocumentUpdateQuery() {
			const query: Record<string, any> = {};
			let documentId = '';
			let children: unknown;
			query.update = vi.fn((payload: { children?: unknown }) => {
				children = payload.children;
				return query;
			});
			query.eq = vi.fn((column: string, value: string) => {
				if (column === 'id') documentId = value;
				return query;
			});
			query.then = (
				onfulfilled: (value: { error: null }) => unknown,
				onrejected?: (reason: unknown) => unknown
			) => {
				childrenUpdates.push({ id: documentId, children });
				return Promise.resolve({ error: null }).then(onfulfilled, onrejected);
			};
			return query;
		}

		const historyInsert = vi.fn().mockResolvedValue({ error: null });
		let projectQueryCount = 0;
		const supabase = {
			from: vi.fn((table: string) => {
				if (table === 'onto_projects') {
					projectQueryCount += 1;
					return projectQueryCount === 1 ? projectReadQuery : projectUpdateQuery;
				}
				if (table === 'onto_project_structure_history') {
					return { insert: historyInsert };
				}
				if (table === 'onto_documents') {
					return createDocumentUpdateQuery();
				}
				throw new Error(`Unexpected table query: ${table}`);
			})
		};

		await updateDocStructure(supabase as any, 'proj-1', nextStructure, 'move', 'actor-1');

		expect(childrenUpdates).toEqual([
			{
				id: 'parent-a',
				children: { children: [{ id: 'sibling-a', order: 0 }] }
			},
			{
				id: 'parent-b',
				children: { children: [{ id: 'moved-doc', order: 0 }] }
			}
		]);
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

		const projectUpdateQuery: Record<string, any> = {};
		projectUpdateQuery.update = vi.fn(() => projectUpdateQuery);
		projectUpdateQuery.eq = vi.fn(() => projectUpdateQuery);
		projectUpdateQuery.contains = vi.fn(() => projectUpdateQuery);
		projectUpdateQuery.select = vi.fn(() => projectUpdateQuery);
		projectUpdateQuery.maybeSingle = vi
			.fn()
			.mockResolvedValue({ data: { id: 'proj-1' }, error: null });

		const historyInsert = vi.fn().mockResolvedValue({ error: null });
		let projectQueryCount = 0;
		const supabase = {
			from: vi.fn((table: string) => {
				if (table === 'onto_projects') {
					projectQueryCount += 1;
					return projectQueryCount <= 2 ? createProjectReadQuery() : projectUpdateQuery;
				}
				if (table === 'onto_project_structure_history') {
					return { insert: historyInsert };
				}
				if (table === 'onto_documents') {
					throw new Error(
						'Document rows should not be loaded for a structure-only removal'
					);
				}
				throw new Error(`Unexpected table query: ${table}`);
			})
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
		expect(historyInsert).toHaveBeenCalledOnce();
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

		const projectUpdateQuery: Record<string, any> = {};
		projectUpdateQuery.update = vi.fn(() => projectUpdateQuery);
		projectUpdateQuery.eq = vi.fn(() => projectUpdateQuery);
		projectUpdateQuery.contains = vi.fn(() => projectUpdateQuery);
		projectUpdateQuery.select = vi.fn(() => projectUpdateQuery);
		projectUpdateQuery.maybeSingle = vi
			.fn()
			.mockResolvedValue({ data: { id: 'proj-1' }, error: null });

		function createDocumentQuery() {
			const query: Record<string, any> = {};
			let action: 'select' | 'update' | null = null;
			query.select = vi.fn((fields: string) => {
				action = 'select';
				documentSelections.push(fields);
				return query;
			});
			query.update = vi.fn(() => {
				action = 'update';
				return query;
			});
			query.eq = vi.fn(() => query);
			query.is = vi.fn(() => query);
			query.then = (
				onfulfilled: (value: { data?: unknown; error: null }) => unknown,
				onrejected?: (reason: unknown) => unknown
			) =>
				Promise.resolve(
					action === 'select'
						? {
								data: [{ id: 'a', title: 'Alpha', description: 'Summary' }],
								error: null
							}
						: { error: null }
				).then(onfulfilled, onrejected);
			return query;
		}

		const historyInsert = vi.fn().mockResolvedValue({ error: null });
		let projectQueryCount = 0;
		const supabase = {
			from: vi.fn((table: string) => {
				if (table === 'onto_projects') {
					projectQueryCount += 1;
					return projectQueryCount <= 2 ? createProjectReadQuery() : projectUpdateQuery;
				}
				if (table === 'onto_documents') {
					return createDocumentQuery();
				}
				if (table === 'onto_project_structure_history') {
					return { insert: historyInsert };
				}
				throw new Error(`Unexpected table query: ${table}`);
			})
		};

		const result = await recomputeDocStructure(supabase as any, 'proj-1', 'actor-1');

		expect(result).toEqual({
			version: 2,
			root: [{ id: 'a', order: 0, title: 'Alpha', description: 'Summary' }]
		});
		expect(documentSelections).toEqual(['id, title, description']);
	});
});
