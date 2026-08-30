// apps/worker/src/workers/embeddings/embedEntityWorker.ts
//
// Semantic discovery embedding pipeline (docs/architecture/semantic-discovery/
// README.md, tasker/71). Consumes `embed_onto_entity` jobs enqueued by the
// enqueue_onto_entity_embedding DB trigger, composes the entity's canonical
// embedding chunks via @buildos/shared-agent-ops (single source of truth with
// the backfill script), embeds changed chunks through OpenAI, and reconciles
// onto_embeddings. Content-hash comparison makes reruns idempotent and cheap.

import type { EmbedOntoEntityJobMetadata, EmbedOntoEntityResult } from '@buildos/shared-types';
import {
	ONTO_EMBEDDING_SOURCES,
	type OntoEmbeddingChunk,
	composeOntoEmbeddingChunks,
	formatPgVectorLiteral,
	isOntoEmbeddingEntityType
} from '@buildos/shared-agent-ops/embeddings/entity-embedding';
import {
	ONTO_EMBEDDING_MODEL,
	type OpenAiEmbeddingsClient,
	createEmbeddingsClientFromEnv
} from '@buildos/shared-agent-ops/embeddings/openai-embeddings';
import { supabase } from '../../lib/supabase';
import type { LegacyJob } from '../shared/jobAdapter';

let cachedEmbeddingsClient: OpenAiEmbeddingsClient | null = null;

function embeddingsClient(): OpenAiEmbeddingsClient {
	if (!cachedEmbeddingsClient) {
		cachedEmbeddingsClient = createEmbeddingsClientFromEnv(process.env);
		if (!cachedEmbeddingsClient) {
			throw new Error(
				'embed_onto_entity requires PRIVATE_OPENROUTER_API_KEY (or an OpenAI key fallback)'
			);
		}
	}
	return cachedEmbeddingsClient;
}

async function deleteEntityEmbeddings(entityType: string, entityId: string): Promise<number> {
	const { data, error } = await supabase
		.from('onto_embeddings')
		.delete()
		.eq('entity_type', entityType)
		.eq('entity_id', entityId)
		.select('id');
	if (error) throw new Error(`Failed to delete embeddings: ${error.message}`);
	return data?.length ?? 0;
}

export async function processEmbedOntoEntity(
	job: LegacyJob<EmbedOntoEntityJobMetadata>
): Promise<EmbedOntoEntityResult> {
	const { entityType, entityId, projectId, deleted } = job.data;
	if (!isOntoEmbeddingEntityType(entityType)) {
		throw new Error(`Unknown embedding entity type: ${entityType}`);
	}
	const result: EmbedOntoEntityResult = {
		success: true,
		entityType,
		entityId,
		chunksWritten: 0,
		chunksDeleted: 0,
		skippedUnchanged: false
	};

	if (deleted) {
		result.chunksDeleted = await deleteEntityEmbeddings(entityType, entityId);
		return result;
	}

	const source = ONTO_EMBEDDING_SOURCES[entityType];
	const { data: row, error: fetchError } = await supabase
		.from(source.table)
		.select([...source.columns, 'deleted_at'].join(', '))
		.eq('id', entityId)
		.maybeSingle()
		.overrideTypes<Record<string, unknown> | null, { merge: false }>();
	if (fetchError) {
		throw new Error(`Failed to load ${source.table} ${entityId}: ${fetchError.message}`);
	}
	if (!row || row.deleted_at) {
		result.chunksDeleted = await deleteEntityEmbeddings(entityType, entityId);
		return result;
	}

	const resolvedProjectId =
		entityType === 'project' ? entityId : ((row.project_id as string | null) ?? projectId);
	if (!resolvedProjectId) {
		// Unscoped entities are not discoverable by the membership-scoped RPC.
		result.chunksDeleted = await deleteEntityEmbeddings(entityType, entityId);
		return result;
	}

	const chunks = composeOntoEmbeddingChunks(entityType, row);
	if (chunks.length === 0) {
		result.chunksDeleted = await deleteEntityEmbeddings(entityType, entityId);
		return result;
	}

	const { data: existingRows, error: existingError } = await supabase
		.from('onto_embeddings')
		.select('chunk_index, content_hash')
		.eq('entity_type', entityType)
		.eq('entity_id', entityId);
	if (existingError) {
		throw new Error(`Failed to load existing embeddings: ${existingError.message}`);
	}
	const existingHashByIndex = new Map<number, string>(
		(existingRows ?? []).map((existing) => [existing.chunk_index, existing.content_hash])
	);

	const changed: OntoEmbeddingChunk[] = chunks.filter(
		(chunk) => existingHashByIndex.get(chunk.chunk_index) !== chunk.content_hash
	);
	const staleIndexes = [...existingHashByIndex.keys()].filter((index) => index >= chunks.length);

	if (changed.length === 0 && staleIndexes.length === 0) {
		result.skippedUnchanged = true;
		return result;
	}

	if (changed.length > 0) {
		const embeddings = await embeddingsClient().embed(changed.map((chunk) => chunk.text));
		const upserts = changed.map((chunk, index) => ({
			entity_type: entityType,
			entity_id: entityId,
			project_id: resolvedProjectId,
			chunk_index: chunk.chunk_index,
			chunk_anchor: chunk.chunk_anchor,
			content_hash: chunk.content_hash,
			content_text: chunk.text,
			embedding: formatPgVectorLiteral(embeddings[index]!),
			embedding_model: ONTO_EMBEDDING_MODEL,
			updated_at: new Date().toISOString()
		}));
		const { error: upsertError } = await supabase
			.from('onto_embeddings')
			.upsert(upserts as never[], { onConflict: 'entity_type,entity_id,chunk_index' });
		if (upsertError) {
			throw new Error(`Failed to upsert embeddings: ${upsertError.message}`);
		}
		result.chunksWritten = upserts.length;
	}

	if (staleIndexes.length > 0) {
		const { data: deletedRows, error: staleError } = await supabase
			.from('onto_embeddings')
			.delete()
			.eq('entity_type', entityType)
			.eq('entity_id', entityId)
			.in('chunk_index', staleIndexes)
			.select('id');
		if (staleError) {
			throw new Error(`Failed to prune stale embedding chunks: ${staleError.message}`);
		}
		result.chunksDeleted = deletedRows?.length ?? 0;
	}

	return result;
}
