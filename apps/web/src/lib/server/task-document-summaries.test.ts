// apps/web/src/lib/server/task-document-summaries.test.ts
import { describe, expect, it, vi } from 'vitest';
import { loadTaskDocumentSummaries } from './task-document-summaries';

function client(tables: Record<string, { data: unknown; error: unknown }>) {
	const selects: Record<string, string> = {};
	return {
		selects,
		from: vi.fn((table: string) => {
			const query: Record<string, any> = {};
			for (const method of ['eq', 'in', 'is', 'order']) query[method] = vi.fn(() => query);
			query.select = vi.fn((columns: string) => {
				selects[table] = columns;
				return query;
			});
			query.then = (resolve: (value: unknown) => unknown) => resolve(tables[table]);
			return query;
		})
	};
}

describe('loadTaskDocumentSummaries', () => {
	it('lists the task docs in link order, without scratch pads or deleted docs', async () => {
		const supabase = client({
			onto_edges: {
				data: [
					{ dst_id: 'doc-b', props: {} },
					{ dst_id: 'scratch', props: { role: 'scratch' } },
					{ dst_id: 'doc-a', props: null },
					{ dst_id: 'gone', props: {} }
				],
				error: null
			},
			onto_documents: {
				data: [
					{
						id: 'doc-a',
						title: 'Notes',
						state_key: 'draft',
						type_key: 'document.default'
					},
					{ id: 'doc-b', title: 'Research', state_key: 'ready', type_key: null }
				],
				error: null
			}
		});

		const docs = await loadTaskDocumentSummaries(supabase, {
			taskId: 'task-1',
			projectId: 'project-1'
		});

		expect(docs.map((doc) => doc.id)).toEqual(['doc-b', 'doc-a']);
		// A list, not the docs: no bodies and no search index.
		expect(supabase.selects.onto_documents).toBe('id, title, state_key, type_key');
	});

	it('skips the document read when the task has no docs', async () => {
		const supabase = client({ onto_edges: { data: [], error: null } });

		await expect(
			loadTaskDocumentSummaries(supabase, { taskId: 'task-1', projectId: 'project-1' })
		).resolves.toEqual([]);
		expect(supabase.from).toHaveBeenCalledTimes(1);
	});
});
