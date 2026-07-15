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
	getDocTree
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
