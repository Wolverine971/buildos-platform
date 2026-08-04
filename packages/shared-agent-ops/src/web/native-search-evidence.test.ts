// packages/shared-agent-ops/src/web/native-search-evidence.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	buildNativeSearchEvidenceChunks,
	hashNativeSearchPageContent,
	loadCurrentNativeSearchPageEvidence,
	parseNativeSearchPageEvidenceReceipt,
	persistNativeSearchPageEvidence,
	type NativeSearchEvidenceRpcClient
} from './native-search-evidence';

const PAGE_VISIT_ID = '10000000-0000-4000-8000-000000000001';
const PAGE_VERSION_ID = '20000000-0000-4000-8000-000000000001';

function receipt(content: string) {
	return {
		page_visit_id: PAGE_VISIT_ID,
		page_version_id: PAGE_VERSION_ID,
		version_number: 1,
		content_hash: hashNativeSearchPageContent(content),
		content_length: Array.from(content).length,
		content_format: 'markdown',
		fetched_at: '2026-08-04T12:00:00.000Z',
		extraction_method: 'static',
		extraction_version: 'web-visit-v1',
		created: true,
		chunks: buildNativeSearchEvidenceChunks(content, { maxChars: 3, overlapChars: 1 }).map(
			(chunk) => ({
				id: `30000000-0000-4000-8000-00000000000${chunk.chunk_index + 1}`,
				chunk_index: chunk.chunk_index,
				start_offset: chunk.start_offset,
				end_offset: chunk.end_offset,
				selector: `char:${chunk.start_offset}-${chunk.end_offset}`,
				content_hash: chunk.content_hash
			})
		)
	};
}

describe('native search immutable evidence', () => {
	it('chunks by Unicode code points with deterministic overlapping coordinates', () => {
		const chunks = buildNativeSearchEvidenceChunks('A😀BC', {
			maxChars: 3,
			overlapChars: 1
		});

		expect(chunks).toEqual([
			{
				chunk_index: 0,
				start_offset: 0,
				end_offset: 3,
				content: 'A😀B',
				content_hash: hashNativeSearchPageContent('A😀B')
			},
			{
				chunk_index: 1,
				start_offset: 2,
				end_offset: 4,
				content: 'BC',
				content_hash: hashNativeSearchPageContent('BC')
			}
		]);
	});

	it('rejects evidence that exceeds the bounded chunk count', () => {
		expect(() =>
			buildNativeSearchEvidenceChunks('x'.repeat(201), {
				maxChars: 1,
				overlapChars: 0
			})
		).toThrow('maximum chunk count');
	});

	it('persists content, hashes, and chunk coordinates through the service-only RPC', async () => {
		const content = 'A😀BC';
		const rpc = vi.fn(async (functionName: string, args: Record<string, unknown>) => {
			expect(functionName).toBe('persist_web_page_evidence_version');
			expect(args).toMatchObject({
				p_web_page_visit_id: PAGE_VISIT_ID,
				p_content: content,
				p_content_hash: hashNativeSearchPageContent(content),
				p_content_format: 'markdown',
				p_extraction_method: 'static'
			});
			expect(args.p_chunks).toEqual(buildNativeSearchEvidenceChunks(content));
			return {
				data: {
					...receipt(content),
					chunks: buildNativeSearchEvidenceChunks(content).map((chunk) => ({
						id: `30000000-0000-4000-8000-00000000000${chunk.chunk_index + 1}`,
						chunk_index: chunk.chunk_index,
						start_offset: chunk.start_offset,
						end_offset: chunk.end_offset,
						selector: `char:${chunk.start_offset}-${chunk.end_offset}`,
						content_hash: chunk.content_hash
					}))
				},
				error: null
			};
		});
		const client = { rpc } as NativeSearchEvidenceRpcClient;

		const result = await persistNativeSearchPageEvidence(client, {
			pageVisitId: PAGE_VISIT_ID,
			content,
			contentFormat: 'markdown'
		});

		expect(result).toMatchObject({
			page_visit_id: PAGE_VISIT_ID,
			page_version_id: PAGE_VERSION_ID,
			version_number: 1,
			created: true
		});
		expect(result.chunks[0]).not.toHaveProperty('content');
	});

	it('loads a current receipt and rejects malformed stable selectors', async () => {
		const content = 'A😀BC';
		const validReceipt = receipt(content);
		const client = {
			rpc: vi.fn(async () => ({ data: validReceipt, error: null }))
		} as NativeSearchEvidenceRpcClient;

		await expect(loadCurrentNativeSearchPageEvidence(client, PAGE_VISIT_ID)).resolves.toEqual(
			parseNativeSearchPageEvidenceReceipt(validReceipt)
		);
		expect(() =>
			parseNativeSearchPageEvidenceReceipt({
				...validReceipt,
				chunks: [{ ...validReceipt.chunks[0], selector: 'char:1-3' }]
			})
		).toThrow('invalid chunk');
	});

	it('surfaces RPC errors without accepting an unverified receipt', async () => {
		const client = {
			rpc: vi.fn(async () => ({ data: null, error: { message: 'permission denied' } }))
		} as NativeSearchEvidenceRpcClient;

		await expect(loadCurrentNativeSearchPageEvidence(client, PAGE_VISIT_ID)).rejects.toThrow(
			'permission denied'
		);
	});
});
