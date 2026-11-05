// apps/worker/src/workers/embeddings/documentOutlineRefresh.ts
//
// Keeps `onto_documents.outline` fresh for every writer (tasker 150). The embedding trigger
// queues `embed_onto_entity` whenever a document's title, description or content changes,
// whichever path wrote it (web routes, agent ops, SQL functions), so refreshing the outline
// here covers the writers that skip `versioning.service`. The context finder reads headings
// from this cache; a stale one costs a text read on every project chat turn.
//
// The write touches only `outline` and is guarded by the content_hash it was computed from.
// It re-enqueues nothing: the embedding trigger skips writes that leave title, description
// and content unchanged, and the updated_at trigger keeps the old timestamp.
import { extractOutline } from '@buildos/shared-agent-ops/utils/document-outline';

type OutlineRow = {
	content: string | null;
	content_hash: string | null;
	outline: { content_hash?: unknown } | null;
	deleted_at: string | null;
};

type Query = {
	select(columns: string): Query;
	update(values: Record<string, unknown>): Query;
	eq(column: string, value: string): Query;
	maybeSingle(): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
	then: PromiseLike<{ data: unknown; error: { message?: string } | null }>['then'];
};
export type OutlineRefreshClient = { from(table: string): Query };

export type OutlineRefreshResult = 'fresh' | 'written' | 'skipped' | 'failed';

/** Best effort: never throws, so the embedding job behind it always runs. */
export async function refreshDocumentOutline(
	client: OutlineRefreshClient,
	documentId: string
): Promise<OutlineRefreshResult> {
	try {
		const { data, error } = await client
			.from('onto_documents')
			.select('content,content_hash,outline,deleted_at')
			.eq('id', documentId)
			.maybeSingle();
		const row = data as OutlineRow | null;
		if (error || !row || row.deleted_at || !row.content_hash) return 'skipped';
		if (row.outline?.content_hash === row.content_hash) return 'fresh';
		const outline = extractOutline(row.content);
		// The JS hash must match the generated column, or the finder would never see it fresh.
		if (outline.content_hash !== row.content_hash) return 'skipped';
		const write = await client
			.from('onto_documents')
			.update({ outline })
			.eq('id', documentId)
			.eq('content_hash', row.content_hash);
		return write.error ? 'failed' : 'written';
	} catch {
		return 'failed';
	}
}
