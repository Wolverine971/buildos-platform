// packages/shared-agent-ops/src/embeddings/entity-embedding.ts
//
// Canonical "entity → embedded text" composition for the semantic discovery
// pipeline (docs/architecture/semantic-discovery/README.md). The worker embed
// job, the backfill script, and any future re-embed path MUST all compose
// through this module so the index-side text and its content hash stay in
// lockstep. Documents chunk by top-level outline section (anchors round-trip
// with read_document_section); everything else is a single composed chunk.

import { sha256 } from 'js-sha256';
import { extractOutline } from '../utils/document-outline';

/** Search vocabulary, matching onto_search_entities / onto_search_semantic. */
export const ONTO_EMBEDDING_ENTITY_TYPES = [
	'project',
	'task',
	'goal',
	'plan',
	'milestone',
	'document',
	'risk',
	'requirement',
	'event',
	'image'
] as const;

export type OntoEmbeddingEntityType = (typeof ONTO_EMBEDDING_ENTITY_TYPES)[number];

export function isOntoEmbeddingEntityType(value: unknown): value is OntoEmbeddingEntityType {
	return (
		typeof value === 'string' &&
		(ONTO_EMBEDDING_ENTITY_TYPES as readonly string[]).includes(value)
	);
}

/** Source table + the columns the composition reads, per entity type. */
export const ONTO_EMBEDDING_SOURCES = {
	project: {
		table: 'onto_projects',
		columns: ['id', 'name', 'description', 'next_step_short', 'next_step_long']
	},
	task: { table: 'onto_tasks', columns: ['id', 'project_id', 'title', 'description'] },
	goal: { table: 'onto_goals', columns: ['id', 'project_id', 'name', 'description', 'goal'] },
	plan: { table: 'onto_plans', columns: ['id', 'project_id', 'name', 'description', 'plan'] },
	milestone: {
		table: 'onto_milestones',
		columns: ['id', 'project_id', 'title', 'description', 'milestone']
	},
	document: {
		table: 'onto_documents',
		columns: ['id', 'project_id', 'title', 'description', 'content']
	},
	risk: { table: 'onto_risks', columns: ['id', 'project_id', 'title', 'content'] },
	requirement: { table: 'onto_requirements', columns: ['id', 'project_id', 'text'] },
	event: {
		table: 'onto_events',
		columns: ['id', 'project_id', 'title', 'description', 'location']
	},
	image: {
		table: 'onto_assets',
		columns: [
			'id',
			'project_id',
			'caption',
			'alt_text',
			'original_filename',
			'extraction_summary',
			'extracted_text'
		]
	}
} as const satisfies Record<
	OntoEmbeddingEntityType,
	{ table: string; columns: readonly string[] }
>;

export type OntoEmbeddingChunk = {
	chunk_index: number;
	/** Document section anchor when the chunk maps to an outline section. */
	chunk_anchor: string | null;
	text: string;
	content_hash: string;
};

/** ~600 tokens of typical English; comfortably inside the embed model's window. */
const MAX_CHUNK_CHARS = 2400;
const SLIDING_OVERLAP_CHARS = 200;
const MAX_CHUNKS_PER_ENTITY = 60;

export function embeddingContentHash(text: string): string {
	return sha256(text);
}

/** pgvector input literal: '[0.1,0.2,...]'. PostgREST casts it server-side. */
export function formatPgVectorLiteral(embedding: number[]): string {
	return `[${embedding.map((value) => (Number.isFinite(value) ? value : 0)).join(',')}]`;
}

function str(row: Record<string, unknown>, key: string): string {
	const value = row[key];
	return typeof value === 'string' ? value.trim() : '';
}

function joinNonEmpty(parts: string[], separator = '\n'): string {
	return parts.filter((part) => part.length > 0).join(separator);
}

function slidingWindowChunks(text: string): string[] {
	if (text.length <= MAX_CHUNK_CHARS) return [text];
	const chunks: string[] = [];
	let start = 0;
	while (start < text.length && chunks.length < MAX_CHUNKS_PER_ENTITY) {
		chunks.push(text.slice(start, start + MAX_CHUNK_CHARS));
		start += MAX_CHUNK_CHARS - SLIDING_OVERLAP_CHARS;
	}
	return chunks;
}

function toChunks(entries: Array<{ anchor: string | null; text: string }>): OntoEmbeddingChunk[] {
	return entries
		.filter((entry) => entry.text.trim().length > 0)
		.slice(0, MAX_CHUNKS_PER_ENTITY)
		.map((entry, index) => {
			const text = entry.text.trim();
			return {
				chunk_index: index,
				chunk_anchor: entry.anchor,
				text,
				content_hash: embeddingContentHash(text)
			};
		});
}

function composeDocumentChunks(row: Record<string, unknown>): OntoEmbeddingChunk[] {
	const title = str(row, 'title');
	const description = str(row, 'description');
	const content = str(row, 'content');
	const header = joinNonEmpty([`Document: ${title || 'Untitled'}`, description]);

	if (!content) {
		return toChunks([{ anchor: null, text: header }]);
	}

	const outline = extractOutline(content);
	const entries: Array<{ anchor: string | null; text: string }> = [];

	if (outline.nodes.length === 0) {
		for (const piece of slidingWindowChunks(content)) {
			entries.push({ anchor: null, text: `${header}\n\n${piece}` });
		}
		return toChunks(entries);
	}

	const firstHeadingStart = outline.nodes[0]?.char_start ?? content.length;
	const preamble = content.slice(0, firstHeadingStart).trim();
	entries.push({ anchor: null, text: joinNonEmpty([header, preamble], '\n\n') });

	for (const node of outline.nodes) {
		const section = content.slice(node.char_start, node.char_end).trim();
		const sectionHeader = `Document: ${title || 'Untitled'} — ${node.text}`;
		for (const piece of slidingWindowChunks(section)) {
			entries.push({ anchor: node.anchor, text: `${sectionHeader}\n\n${piece}` });
		}
	}
	return toChunks(entries);
}

function composeImageChunks(row: Record<string, unknown>): OntoEmbeddingChunk[] {
	const label =
		str(row, 'caption') || str(row, 'alt_text') || str(row, 'original_filename') || 'Image';
	const header = joinNonEmpty([
		`Image: ${label}`,
		str(row, 'alt_text'),
		str(row, 'extraction_summary')
	]);
	const extracted = str(row, 'extracted_text');
	if (!extracted) return toChunks([{ anchor: null, text: header }]);
	return toChunks(
		slidingWindowChunks(extracted)
			.slice(0, 8)
			.map((piece) => ({ anchor: null, text: `${header}\n\n${piece}` }))
	);
}

/**
 * Compose the embeddable chunks for one entity row. Returns [] when the entity
 * has no embeddable text (the pipeline then clears any stored chunks).
 */
export function composeOntoEmbeddingChunks(
	entityType: OntoEmbeddingEntityType,
	row: Record<string, unknown>
): OntoEmbeddingChunk[] {
	switch (entityType) {
		case 'project':
			return toChunks([
				{
					anchor: null,
					text: joinNonEmpty([
						`Project: ${str(row, 'name') || 'Untitled'}`,
						str(row, 'description'),
						str(row, 'next_step_short'),
						str(row, 'next_step_long')
					])
				}
			]);
		case 'task':
			return toChunks([
				{
					anchor: null,
					text: joinNonEmpty([
						`Task: ${str(row, 'title') || 'Untitled'}`,
						str(row, 'description')
					])
				}
			]);
		case 'goal':
			return toChunks([
				{
					anchor: null,
					text: joinNonEmpty([
						`Goal: ${str(row, 'name') || 'Untitled'}`,
						str(row, 'description'),
						str(row, 'goal')
					])
				}
			]);
		case 'plan':
			return toChunks([
				{
					anchor: null,
					text: joinNonEmpty([
						`Plan: ${str(row, 'name') || 'Untitled'}`,
						str(row, 'description'),
						str(row, 'plan')
					])
				}
			]);
		case 'milestone':
			return toChunks([
				{
					anchor: null,
					text: joinNonEmpty([
						`Milestone: ${str(row, 'title') || 'Untitled'}`,
						str(row, 'description'),
						str(row, 'milestone')
					])
				}
			]);
		case 'risk':
			return toChunks(
				slidingWindowChunks(
					joinNonEmpty([`Risk: ${str(row, 'title') || 'Untitled'}`, str(row, 'content')])
				).map((piece) => ({ anchor: null, text: piece }))
			);
		case 'requirement': {
			const requirementText = str(row, 'text');
			return toChunks(
				requirementText ? [{ anchor: null, text: `Requirement: ${requirementText}` }] : []
			);
		}
		case 'event':
			return toChunks([
				{
					anchor: null,
					text: joinNonEmpty([
						`Event: ${str(row, 'title') || 'Untitled'}`,
						str(row, 'description'),
						str(row, 'location') ? `Location: ${str(row, 'location')}` : ''
					])
				}
			]);
		case 'document':
			return composeDocumentChunks(row);
		case 'image':
			return composeImageChunks(row);
	}
}
