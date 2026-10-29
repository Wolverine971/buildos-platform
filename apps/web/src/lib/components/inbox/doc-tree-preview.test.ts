// apps/web/src/lib/components/inbox/doc-tree-preview.test.ts
import { describe, expect, it } from 'vitest';
import type { ProjectCleanupItem } from '@buildos/shared-types';
import {
	buildDocTreePreview,
	collectTreeOperations,
	countTreeOperations,
	readDocTreeSnapshot,
	treeDocumentIds,
	treeOperationsLine,
	type TreePreviewNode
} from './doc-tree-preview';

function doc(id: string, title: string, extra: Record<string, unknown> = {}) {
	return { id, title, state_key: 'draft', ...extra };
}

// Top level: Outreach Desk (2 docs), Context (3 docs), Blog (2 docs), Templates, Specs (empty
// folder stand-in), Book Research, Outreach clients (1 child).
const payload = {
	structure: {
		version: 4,
		root: [
			{
				id: 'outreach',
				order: 0,
				children: [
					{ id: 'o-1', order: 0 },
					{ id: 'o-2', order: 1 }
				]
			},
			{
				id: 'context',
				order: 1,
				children: [
					{ id: 'c-1', order: 0 },
					{ id: 'c-expo', order: 1 },
					{ id: 'c-3', order: 2 }
				]
			},
			{
				id: 'blog',
				order: 2,
				children: [
					{ id: 'b-1', order: 0 },
					{ id: 'b-2', order: 1 }
				]
			},
			{ id: 'templates', order: 4 },
			{ id: 'specs', order: 3 },
			{ id: 'book', order: 5 },
			{ id: 'clients', order: 6, children: [{ id: 'clients-csv', order: 0 }] },
			{ id: 'old', order: 7, children: [{ id: 'old-child', order: 0 }] }
		]
	},
	documents: Object.fromEntries(
		[
			doc('outreach', 'Outreach Desk'),
			doc('o-1', 'Scripts'),
			doc('o-2', 'Sequence'),
			doc('context', 'Project Context and Strategy'),
			doc('c-1', 'Wayne Strategies Context'),
			doc('c-expo', 'Biz Expo notes'),
			doc('c-3', 'County Outreach'),
			doc('blog', 'Blog Documents'),
			doc('b-1', 'AI Experiments'),
			doc('b-2', 'Political Analysis'),
			doc('templates', 'Templates'),
			doc('specs', 'Processes & Specs'),
			doc('book', 'Book Research'),
			doc('clients', 'Outreach clients'),
			doc('clients-csv', 'Outreach clients — CSV'),
			doc('old', 'Old archived folder', { state_key: 'archived' }),
			doc('old-child', 'Survivor'),
			doc('loose', 'Loose note')
		].map((entry) => [entry.id, entry])
	),
	unlinked: [doc('loose', 'Loose note')],
	archived: [doc('old', 'Old archived folder', { state_key: 'archived' })]
};

function tidyItem(id: string, steps: Array<{ tool: string; args: Record<string, unknown> }>) {
	return {
		id,
		source: 'review',
		kind: 'doc_org',
		section: 'safe_cleanup',
		title: `Item ${id}`,
		summary: null,
		why_now: null,
		executable: true,
		rows: [
			{
				suggestion_id: `s-${id}`,
				kind: 'doc_org',
				title: `Row ${id}`,
				operation_count: steps.length,
				verified_headline: null,
				verified_fingerprint: `fp-${id}`,
				verified_operations: [
					{ key: 'archive_onto_task:task-1:0', target: 'Send the Jim Acosta opener' }
				],
				tree_operations: steps,
				updated_at: '2026-10-29T00:00:00.000Z'
			}
		],
		evidence_refs: [],
		seen_count: 1,
		first_seen_at: '2026-10-01T00:00:00.000Z',
		updated_at: '2026-10-29T00:00:00.000Z'
	} as ProjectCleanupItem;
}

function titles(nodes: TreePreviewNode[]): string[] {
	return nodes.map((node) => node.title);
}

function find(nodes: TreePreviewNode[], title: string): TreePreviewNode | undefined {
	for (const node of nodes) {
		if (node.title === title) return node;
		const inner = find(node.children, title);
		if (inner) return inner;
	}
	return undefined;
}

describe('doc tree preview', () => {
	it('reads the endpoint payload in order, dropping archived documents but not their children', () => {
		const snapshot = readDocTreeSnapshot(payload)!;
		expect(snapshot.root.map((node) => node.id)).toEqual([
			'outreach',
			'context',
			'blog',
			'specs',
			'templates',
			'book',
			'clients',
			'old-child'
		]);
		expect(snapshot.titles.get('loose')).toBe('Loose note');
		expect(readDocTreeSnapshot({ structure: null })).toBeNull();
		expect(readDocTreeSnapshot(null)).toBeNull();
	});

	it('collects move and archive steps with their real argument names', () => {
		const items = [
			tidyItem('a', [
				{
					tool: 'move_document_in_tree',
					args: { document_id: 'templates', new_parent_id: 'specs', new_position: 0 }
				},
				{ tool: 'archive_onto_document', args: { document_id: 'blog' } },
				{
					tool: 'archive_onto_document',
					args: { document_id: 'clients', children: 'promote_children' }
				},
				{ tool: 'archive_onto_task', args: { task_id: 'task-1' } },
				{ tool: 'move_document_in_tree', args: { new_parent_id: 'specs' } },
				{ tool: 'update_onto_document', args: { document_id: 'x' } }
			])
		];
		const ops = collectTreeOperations(items);
		expect(ops).toEqual([
			{
				kind: 'move',
				documentId: 'templates',
				parentId: 'specs',
				position: 0,
				title: null,
				itemId: 'a'
			},
			{
				kind: 'archive_document',
				documentId: 'blog',
				mode: 'archive_children',
				title: null,
				itemId: 'a'
			},
			{
				kind: 'archive_document',
				documentId: 'clients',
				mode: 'promote_children',
				title: null,
				itemId: 'a'
			},
			{
				kind: 'archive_task',
				taskId: 'task-1',
				title: 'Send the Jim Acosta opener',
				itemId: 'a'
			}
		]);
		expect(countTreeOperations(ops)).toEqual({ moves: 1, archives: 3 });
		expect(treeOperationsLine({ moves: 4, archives: 6 })).toBe('4 moves and 6 archives');
		expect(treeOperationsLine({ moves: 1, archives: 0 })).toBe('1 move');
		expect(treeOperationsLine({ moves: 0, archives: 0 })).toBeNull();
		expect([...treeDocumentIds(ops)]).toEqual(['templates', 'blog', 'clients']);
	});

	it('simulates moves and archives and counts the top level before and after', () => {
		const snapshot = readDocTreeSnapshot(payload)!;
		const ops = collectTreeOperations([
			tidyItem('a', [
				{
					tool: 'move_document_in_tree',
					args: { document_id: 'templates', new_parent_id: 'specs', new_position: 0 }
				},
				{
					tool: 'move_document_in_tree',
					args: { document_id: 'book', new_parent_id: 'context', new_position: 99 }
				},
				{ tool: 'archive_onto_document', args: { document_id: 'blog' } },
				{
					tool: 'archive_onto_document',
					args: { document_id: 'clients', children: 'promote_children' }
				},
				{ tool: 'archive_onto_document', args: { document_id: 'c-expo' } },
				{ tool: 'archive_onto_task', args: { task_id: 'task-1' } }
			])
		]);
		const preview = buildDocTreePreview(snapshot, ops, { callDocumentIds: ['o-2'] });

		expect(preview.topLevelBefore).toBe(8);
		// Templates and Book Research move in, Blog goes, Outreach clients' CSV moves up.
		expect(preview.topLevelAfter).toBe(5);

		// Now: every top-level node, with what will happen to it.
		expect(titles(preview.now)).toHaveLength(8);
		expect(find(preview.now, 'Templates')).toMatchObject({
			mark: 'moving',
			note: '→ Processes & Specs'
		});
		expect(find(preview.now, 'Blog Documents')).toMatchObject({
			mark: 'archiving',
			note: 'archive with 2 inside',
			children: [],
			collapsedCount: 0
		});
		expect(find(preview.now, 'Outreach clients')).toMatchObject({
			mark: 'archiving',
			note: 'archive, contents move up'
		});
		// Untouched folders stay closed; the folder with a change opens to it alone.
		expect(find(preview.now, 'Project Context and Strategy')).toMatchObject({
			children: [expect.objectContaining({ title: 'Biz Expo notes', mark: 'archiving' })],
			hiddenCount: 2
		});
		expect(find(preview.now, 'Outreach Desk')).toMatchObject({
			children: [expect.objectContaining({ title: 'Sequence', mark: 'call' })],
			hiddenCount: 1
		});

		// After: moved nodes in their new place, archived ones gone.
		expect(titles(preview.after)).toEqual([
			'Outreach Desk',
			'Project Context and Strategy',
			'Processes & Specs',
			'Outreach clients — CSV',
			'Survivor'
		]);
		expect(find(preview.after, 'Processes & Specs')!.children).toEqual([
			expect.objectContaining({ title: 'Templates', mark: 'moved', note: 'moved here' })
		]);
		const context = find(preview.after, 'Project Context and Strategy')!;
		expect(context.children.map((node) => node.title)).toEqual(['Book Research']);
		expect(context.hiddenCount).toBe(2);
		expect(find(preview.after, 'Outreach clients — CSV')).toMatchObject({
			mark: 'moved',
			note: 'moved up'
		});
		expect(find(preview.after, 'Blog Documents')).toBeUndefined();
		expect(preview.archivedDocuments).toEqual([
			{ id: 'blog', title: 'Blog Documents', insideCount: 2 },
			{ id: 'clients', title: 'Outreach clients', insideCount: 0 },
			{ id: 'c-expo', title: 'Biz Expo notes', insideCount: 0 }
		]);
		expect(preview.archivedTasks).toEqual([
			{ id: 'task-1', title: 'Send the Jim Acosta opener' }
		]);
		expect([...preview.marks].sort()).toEqual(['archiving', 'call', 'moved', 'moving']);
	});

	it('brings a document from outside the tree in and skips impossible steps', () => {
		const snapshot = readDocTreeSnapshot(payload)!;
		const preview = buildDocTreePreview(
			snapshot,
			collectTreeOperations([
				tidyItem('b', [
					{
						tool: 'move_document_in_tree',
						args: { document_id: 'loose', new_parent_id: null, new_position: 1 }
					},
					// Into its own child: skipped.
					{
						tool: 'move_document_in_tree',
						args: { document_id: 'context', new_parent_id: 'c-1' }
					},
					// Destination unknown: skipped.
					{
						tool: 'move_document_in_tree',
						args: { document_id: 'book', new_parent_id: 'missing' }
					}
				])
			])
		);
		expect(titles(preview.after).slice(0, 3)).toEqual([
			'Outreach Desk',
			'Loose note',
			'Project Context and Strategy'
		]);
		expect(find(preview.after, 'Loose note')).toMatchObject({ mark: 'moved' });
		expect(preview.topLevelAfter).toBe(9);
		expect(find(preview.after, 'Book Research')).toMatchObject({ mark: null });
	});
});
