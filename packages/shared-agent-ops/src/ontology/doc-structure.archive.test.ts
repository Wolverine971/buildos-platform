// packages/shared-agent-ops/src/ontology/doc-structure.archive.test.ts
import { describe, expect, it, vi } from 'vitest';
import { archiveDocumentInTree } from './doc-structure.service';

const project = '10000000-0000-4000-8000-000000000001';
const parent = '10000000-0000-4000-8000-000000000002';
const child = '10000000-0000-4000-8000-000000000003';

describe('canonical archive with reviewed facts', () => {
	it.each(['archive_children', 'promote_children'] as const)(
		'uses one guarded RPC for %s, including the computed tree and child caches',
		async (mode) => {
			const tree = { version: 7, root: [{ id: parent, children: [{ id: child }] }] };
			const query = {
				select: vi.fn().mockReturnThis(),
				eq: vi.fn().mockReturnThis(),
				single: async () => ({ data: { doc_structure: tree }, error: null })
			};
			const ids = mode === 'archive_children' ? [parent, child] : [parent];
			const rpc = vi.fn(async () => ({
				data: {
					document: { id: parent, state_key: 'archived' },
					archived_document_ids: ids
				},
				error: null
			}));
			const snapshot = {
				document_id: parent,
				archive_mode: mode,
				tree_fingerprint: 'reviewed'
			};
			const result = await archiveDocumentInTree(
				{ from: () => query, rpc } as never,
				project,
				parent,
				{
					mode,
					expectedUpdatedAt: '2026-09-29T00:00:00Z',
					expectedReviewSnapshot: snapshot
				},
				'actor'
			);
			expect(rpc).toHaveBeenCalledExactlyOnceWith(
				'onto_document_archive_reviewed_atomic',
				expect.objectContaining({
					p_document_ids: ids,
					p_expected_structure_version: 7,
					p_archive_mode: mode,
					p_expected_review_snapshot: snapshot,
					p_next_structure: {
						version: 8,
						root:
							mode === 'archive_children'
								? []
								: [expect.objectContaining({ id: child })]
					},
					p_children_updates: expect.any(Array)
				})
			);
			expect(result.archivedDocumentIds).toEqual(ids);
		}
	);
});
