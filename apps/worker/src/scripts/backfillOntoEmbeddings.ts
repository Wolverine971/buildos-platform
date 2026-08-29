// apps/worker/src/scripts/backfillOntoEmbeddings.ts
//
// One-time (rerunnable) backfill for semantic discovery: composes and embeds
// every existing ontology entity through the same shared-agent-ops module the
// embed_onto_entity worker uses, so index text stays canonical. Content-hash
// comparison makes reruns cheap — only new/changed chunks hit OpenAI.
//
// Usage: pnpm --filter=@buildos/worker backfill:embeddings
// Env:   PRIVATE_SUPABASE_* (service role) + PRIVATE_OPENROUTER_API_KEY
//        (OpenRouter routes the same text-embedding-3-small; a direct OpenAI
//        key works as fallback)

import {
	ONTO_EMBEDDING_ENTITY_TYPES,
	ONTO_EMBEDDING_SOURCES,
	type OntoEmbeddingChunk,
	type OntoEmbeddingEntityType,
	composeOntoEmbeddingChunks,
	formatPgVectorLiteral
} from '@buildos/shared-agent-ops/embeddings/entity-embedding';
import {
	ONTO_EMBEDDING_MODEL,
	createEmbeddingsClientFromEnv
} from '@buildos/shared-agent-ops/embeddings/openai-embeddings';
import { supabase } from '../lib/supabase';

const BATCH_SIZE = 100;

const resolvedEmbeddings = createEmbeddingsClientFromEnv(process.env);
if (!resolvedEmbeddings) {
	console.error(
		'[embeddings-backfill] PRIVATE_OPENROUTER_API_KEY (or an OpenAI key fallback) is required'
	);
	process.exit(1);
}
const embeddings = resolvedEmbeddings;

type PendingChunk = {
	entityType: OntoEmbeddingEntityType;
	entityId: string;
	projectId: string;
	chunk: OntoEmbeddingChunk;
};

async function flush(pending: PendingChunk[]): Promise<number> {
	if (pending.length === 0) return 0;
	const vectors = await embeddings.embed(pending.map((entry) => entry.chunk.text));
	const rows = pending.map((entry, index) => ({
		entity_type: entry.entityType,
		entity_id: entry.entityId,
		project_id: entry.projectId,
		chunk_index: entry.chunk.chunk_index,
		chunk_anchor: entry.chunk.chunk_anchor,
		content_hash: entry.chunk.content_hash,
		content_text: entry.chunk.text,
		embedding: formatPgVectorLiteral(vectors[index]!),
		embedding_model: ONTO_EMBEDDING_MODEL,
		updated_at: new Date().toISOString()
	}));
	const { error } = await supabase
		.from('onto_embeddings')
		.upsert(rows as never[], { onConflict: 'entity_type,entity_id,chunk_index' });
	if (error) throw new Error(`Upsert failed: ${error.message}`);
	return rows.length;
}

async function backfillEntityType(entityType: OntoEmbeddingEntityType): Promise<void> {
	const source = ONTO_EMBEDDING_SOURCES[entityType];
	let offset = 0;
	let scanned = 0;
	let written = 0;
	let unchanged = 0;
	let skipped = 0;

	for (;;) {
		const { data, error } = await (supabase as any)
			.from(source.table)
			.select([...source.columns, 'deleted_at'].join(', '))
			.is('deleted_at', null)
			.order('id', { ascending: true })
			.range(offset, offset + BATCH_SIZE - 1);
		if (error) throw new Error(`Scan ${source.table} failed: ${error.message}`);

		const rows = (data ?? []) as Array<Record<string, unknown>>;
		if (rows.length === 0) break;
		scanned += rows.length;

		const entityIds = rows.map((row) => String(row.id));
		const { data: existingRows, error: existingError } = await supabase
			.from('onto_embeddings')
			.select('entity_id, chunk_index, content_hash')
			.eq('entity_type', entityType)
			.in('entity_id', entityIds);
		if (existingError) {
			throw new Error(`Existing lookup failed: ${existingError.message}`);
		}
		const existingHash = new Map<string, string>(
			(existingRows ?? []).map((row) => [
				`${row.entity_id}:${row.chunk_index}`,
				row.content_hash
			])
		);

		const pending: PendingChunk[] = [];
		for (const row of rows) {
			const entityId = String(row.id);
			const projectId =
				entityType === 'project' ? entityId : (row.project_id as string | null);
			if (!projectId) {
				skipped += 1;
				continue;
			}
			for (const chunk of composeOntoEmbeddingChunks(entityType, row)) {
				if (existingHash.get(`${entityId}:${chunk.chunk_index}`) === chunk.content_hash) {
					unchanged += 1;
					continue;
				}
				pending.push({ entityType, entityId, projectId, chunk });
			}
		}
		written += await flush(pending);
		offset += BATCH_SIZE;
		console.log(
			`[embeddings-backfill] ${entityType}: scanned=${scanned} written=${written} unchanged=${unchanged} skipped=${skipped}`
		);
	}
}

async function main() {
	const only = process.argv[2]?.trim();
	const types = only
		? ONTO_EMBEDDING_ENTITY_TYPES.filter((type) => type === only)
		: ONTO_EMBEDDING_ENTITY_TYPES;
	if (types.length === 0) {
		console.error(`[embeddings-backfill] unknown entity type: ${only}`);
		process.exit(1);
	}
	for (const entityType of types) {
		await backfillEntityType(entityType);
	}
	console.log('[embeddings-backfill] done');
}

main().catch((error) => {
	console.error('[embeddings-backfill] failed:', error);
	process.exit(1);
});
