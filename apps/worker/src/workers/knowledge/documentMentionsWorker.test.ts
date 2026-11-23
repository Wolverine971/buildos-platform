// apps/worker/src/workers/knowledge/documentMentionsWorker.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	docMentionsEnabled,
	enqueueDocumentMentions,
	refreshDocumentMentions
} from './documentMentionsWorker';

const DOC = '44444444-4444-4444-8444-444444444444';

/** Minimal PostgREST stand-in: every query on a table resolves to its canned rows. */
function db(tables: Record<string, any[]>) {
	return {
		rpc: vi.fn().mockResolvedValue({ data: 'job-1', error: null }),
		from(table: string) {
			const filters: Array<(r: any) => boolean> = [];
			let one = false;
			const q: any = {
				select: () => q,
				eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
				in: () => q,
				is: () => q,
				range: () => q,
				maybeSingle: () => ((one = true), q),
				then: (ok: any) => {
					const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
					return Promise.resolve(
						ok({ data: one ? (rows[0] ?? null) : rows, error: null })
					);
				}
			};
			return q;
		}
	};
}

describe('document mentions job', () => {
	it('has a kill switch', () => {
		expect(docMentionsEnabled({} as NodeJS.ProcessEnv)).toBe(true);
		expect(docMentionsEnabled({ KNOWLEDGE_DOC_MENTIONS: 'off' } as NodeJS.ProcessEnv)).toBe(
			false
		);
	});

	it('queues one debounced read per document text, 5 minutes out', async () => {
		const client = db({
			onto_documents: [
				{ id: DOC, content_hash: 'h1', created_by: 'actor-1', deleted_at: null }
			],
			onto_actors: [{ id: 'actor-1', user_id: 'user-1' }]
		});
		const now = new Date('2026-11-18T10:00:00Z');
		await enqueueDocumentMentions(client, DOC, now);
		expect(client.rpc).toHaveBeenCalledWith(
			'add_queue_job',
			expect.objectContaining({
				p_user_id: 'user-1',
				p_job_type: 'knowledge_doc_mentions',
				p_metadata: { documentId: DOC, contentHash: 'h1' },
				p_scheduled_for: '2026-11-18T10:05:00.000Z',
				p_dedup_key: `knowledge-doc-mentions:${DOC}:h1`
			})
		);
	});

	it('a job for older text steps aside for the newer one, without loading the name finder', async () => {
		const ner = vi.fn();
		const client = db({
			onto_documents: [
				{
					id: DOC,
					project_id: null,
					title: 'Doc',
					content: 'New text',
					content_hash: 'h2',
					created_by: null,
					deleted_at: null
				}
			]
		});
		const result = await refreshDocumentMentions(client, DOC, {
			expectedContentHash: 'h1',
			ner
		});
		expect(result.outcome).toBe('superseded');
		expect(ner).not.toHaveBeenCalled();
	});
});
