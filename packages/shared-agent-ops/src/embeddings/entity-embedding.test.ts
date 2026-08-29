// packages/shared-agent-ops/src/embeddings/entity-embedding.test.ts
import { describe, expect, it } from 'vitest';
import {
	composeOntoEmbeddingChunks,
	embeddingContentHash,
	formatPgVectorLiteral,
	isOntoEmbeddingEntityType
} from './entity-embedding';

describe('composeOntoEmbeddingChunks', () => {
	it('composes a single labeled chunk for a task', () => {
		const chunks = composeOntoEmbeddingChunks('task', {
			title: 'Draft launch email',
			description: 'Write the announcement for the beta list'
		});
		expect(chunks).toHaveLength(1);
		expect(chunks[0]!.chunk_index).toBe(0);
		expect(chunks[0]!.chunk_anchor).toBeNull();
		expect(chunks[0]!.text).toBe(
			'Task: Draft launch email\nWrite the announcement for the beta list'
		);
		expect(chunks[0]!.content_hash).toBe(embeddingContentHash(chunks[0]!.text));
	});

	it('returns no chunks for an entity with no embeddable text', () => {
		expect(composeOntoEmbeddingChunks('requirement', { text: '   ' })).toHaveLength(0);
	});

	it('chunks a document by top-level outline section with anchors', () => {
		const content = [
			'Intro paragraph before any heading.',
			'',
			'# Positioning',
			'We lead with relief.',
			'',
			'## Details',
			'Nested section stays with its parent.',
			'',
			'# Campaigns',
			'Instagram is next.'
		].join('\n');
		const chunks = composeOntoEmbeddingChunks('document', {
			title: 'Marketing Direction',
			description: 'Current strategy',
			content
		});

		expect(chunks.length).toBe(3);
		expect(chunks[0]!.chunk_anchor).toBeNull();
		expect(chunks[0]!.text).toContain('Document: Marketing Direction');
		expect(chunks[0]!.text).toContain('Intro paragraph');
		const anchors = chunks.map((chunk) => chunk.chunk_anchor);
		expect(anchors).toContain('positioning');
		expect(anchors).toContain('campaigns');
		const positioning = chunks.find((chunk) => chunk.chunk_anchor === 'positioning')!;
		expect(positioning.text).toContain('Marketing Direction — Positioning');
		expect(positioning.text).toContain('Nested section stays with its parent.');
		expect(chunks.map((chunk) => chunk.chunk_index)).toEqual([0, 1, 2]);
	});

	it('splits long unheaded documents into overlapping windows', () => {
		const content = 'lorem ipsum '.repeat(600); // ~7200 chars
		const chunks = composeOntoEmbeddingChunks('document', {
			title: 'Long Notes',
			content
		});
		expect(chunks.length).toBeGreaterThan(2);
		expect(chunks.every((chunk) => chunk.text.length <= 2400 + 200)).toBe(true);
		expect(chunks.every((chunk) => chunk.text.includes('Document: Long Notes'))).toBe(true);
	});

	it('composition is deterministic (hash-stable)', () => {
		const row = { title: 'Same', description: 'Same body' };
		const a = composeOntoEmbeddingChunks('task', row);
		const b = composeOntoEmbeddingChunks('task', row);
		expect(a[0]!.content_hash).toBe(b[0]!.content_hash);
	});
});

describe('formatPgVectorLiteral', () => {
	it('formats a pgvector input literal', () => {
		expect(formatPgVectorLiteral([0.25, -1, 3])).toBe('[0.25,-1,3]');
	});
	it('zeroes non-finite values defensively', () => {
		expect(formatPgVectorLiteral([Number.NaN, Infinity, 1])).toBe('[0,0,1]');
	});
});

describe('isOntoEmbeddingEntityType', () => {
	it('accepts the search vocabulary and rejects strays', () => {
		expect(isOntoEmbeddingEntityType('document')).toBe(true);
		expect(isOntoEmbeddingEntityType('image')).toBe(true);
		expect(isOntoEmbeddingEntityType('asset')).toBe(false);
		expect(isOntoEmbeddingEntityType('')).toBe(false);
	});
});
