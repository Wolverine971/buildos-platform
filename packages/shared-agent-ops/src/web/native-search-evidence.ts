// packages/shared-agent-ops/src/web/native-search-evidence.ts
import { createHash } from 'node:crypto';

export const NATIVE_SEARCH_EVIDENCE_CHUNK_MAX_CHARS = 1_600;
export const NATIVE_SEARCH_EVIDENCE_CHUNK_OVERLAP_CHARS = 200;
export const NATIVE_SEARCH_EVIDENCE_CHUNK_MAX_COUNT = 200;
export const NATIVE_SEARCH_EVIDENCE_MAX_CONTENT_CHARS =
	NATIVE_SEARCH_EVIDENCE_CHUNK_MAX_CHARS +
	(NATIVE_SEARCH_EVIDENCE_CHUNK_MAX_COUNT - 1) *
		(NATIVE_SEARCH_EVIDENCE_CHUNK_MAX_CHARS - NATIVE_SEARCH_EVIDENCE_CHUNK_OVERLAP_CHARS);

export interface NativeSearchEvidenceChunkInput {
	chunk_index: number;
	start_offset: number;
	end_offset: number;
	content: string;
	content_hash: string;
}

export interface NativeSearchEvidenceChunk extends NativeSearchEvidenceChunkInput {
	id?: string;
	selector: string;
}

export type NativeSearchEvidenceChunkReference = Omit<NativeSearchEvidenceChunk, 'content'>;

export interface NativeSearchPageEvidenceReceipt {
	page_visit_id: string;
	page_version_id: string;
	version_number: number;
	content_hash: string;
	content_length: number;
	content_format: 'markdown' | 'text';
	fetched_at: string;
	extraction_method: 'static' | 'browser' | 'pdf' | 'text';
	extraction_version: string;
	created?: boolean;
	chunks: NativeSearchEvidenceChunkReference[];
}

export interface NativeSearchEvidenceRpcResult {
	data: unknown;
	error: { message: string } | null;
}

export interface NativeSearchEvidenceRpcClient {
	rpc: (
		functionName: string,
		args: Record<string, unknown>
	) => PromiseLike<NativeSearchEvidenceRpcResult>;
}

export interface PersistNativeSearchPageEvidenceInput {
	pageVisitId: string;
	content: string;
	contentFormat: 'markdown' | 'text';
	requestedUrl?: string;
	finalUrl?: string;
	canonicalUrl?: string;
	statusCode?: number;
	contentType?: string;
	title?: string;
	meta?: Record<string, string>;
	structuredData?: unknown[];
	excerpt?: string;
	bytes?: number;
	fetchedAt?: string;
	etag?: string;
	lastModified?: string;
	extractionMethod?: 'static' | 'browser' | 'pdf' | 'text';
	extractionVersion?: string;
	parser?: string;
	extractionStrategy?: string;
}

function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function isUuid(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
	);
}

export function buildNativeSearchEvidenceChunks(
	content: string,
	options: { maxChars?: number; overlapChars?: number } = {}
): NativeSearchEvidenceChunkInput[] {
	const codePoints = Array.from(content);
	if (codePoints.length === 0) return [];
	const maxChars = Math.max(
		1,
		Math.min(Math.floor(options.maxChars ?? NATIVE_SEARCH_EVIDENCE_CHUNK_MAX_CHARS), 4_000)
	);
	const overlapChars = Math.max(
		0,
		Math.min(
			Math.floor(options.overlapChars ?? NATIVE_SEARCH_EVIDENCE_CHUNK_OVERLAP_CHARS),
			maxChars - 1
		)
	);
	const step = maxChars - overlapChars;
	const chunks: NativeSearchEvidenceChunkInput[] = [];
	for (let startOffset = 0; startOffset < codePoints.length; startOffset += step) {
		if (chunks.length >= NATIVE_SEARCH_EVIDENCE_CHUNK_MAX_COUNT) {
			throw new Error('Native search evidence exceeds the maximum chunk count');
		}
		const endOffset = Math.min(startOffset + maxChars, codePoints.length);
		const chunkContent = codePoints.slice(startOffset, endOffset).join('');
		chunks.push({
			chunk_index: chunks.length,
			start_offset: startOffset,
			end_offset: endOffset,
			content: chunkContent,
			content_hash: sha256(chunkContent)
		});
		if (endOffset === codePoints.length) break;
	}
	return chunks;
}

export function hashNativeSearchPageContent(content: string): string {
	return sha256(content);
}

export function parseNativeSearchPageEvidenceReceipt(
	value: unknown
): NativeSearchPageEvidenceReceipt {
	const receipt = asRecord(value);
	const chunks = Array.isArray(receipt?.chunks) ? receipt.chunks : undefined;
	if (
		!receipt ||
		!isUuid(receipt.page_visit_id) ||
		!isUuid(receipt.page_version_id) ||
		typeof receipt.version_number !== 'number' ||
		!Number.isInteger(receipt.version_number) ||
		receipt.version_number < 1 ||
		typeof receipt.content_hash !== 'string' ||
		!/^[0-9a-f]{64}$/.test(receipt.content_hash) ||
		typeof receipt.content_length !== 'number' ||
		!Number.isInteger(receipt.content_length) ||
		receipt.content_length < 1 ||
		!['markdown', 'text'].includes(String(receipt.content_format)) ||
		typeof receipt.fetched_at !== 'string' ||
		!Number.isFinite(Date.parse(receipt.fetched_at)) ||
		!['static', 'browser', 'pdf', 'text'].includes(String(receipt.extraction_method)) ||
		typeof receipt.extraction_version !== 'string' ||
		!chunks
	) {
		throw new Error('Native search evidence RPC returned an invalid receipt');
	}

	const contentLength = receipt.content_length;
	let previousStart = -1;
	let previousEnd = 0;
	const parsedChunks = chunks.map((rawChunk, expectedIndex) => {
		const chunk = asRecord(rawChunk);
		if (
			!chunk ||
			chunk.chunk_index !== expectedIndex ||
			(chunk.id !== undefined && !isUuid(chunk.id)) ||
			typeof chunk.start_offset !== 'number' ||
			typeof chunk.end_offset !== 'number' ||
			chunk.start_offset < 0 ||
			chunk.end_offset <= chunk.start_offset ||
			chunk.end_offset > contentLength ||
			chunk.start_offset <= previousStart ||
			(expectedIndex === 0 && chunk.start_offset !== 0) ||
			(expectedIndex > 0 && chunk.start_offset > previousEnd) ||
			typeof chunk.selector !== 'string' ||
			chunk.selector !== `char:${chunk.start_offset}-${chunk.end_offset}` ||
			typeof chunk.content_hash !== 'string' ||
			!/^[0-9a-f]{64}$/.test(chunk.content_hash)
		) {
			throw new Error('Native search evidence RPC returned an invalid chunk');
		}
		previousStart = chunk.start_offset;
		previousEnd = chunk.end_offset;
		return {
			...(typeof chunk.id === 'string' ? { id: chunk.id } : {}),
			chunk_index: chunk.chunk_index,
			start_offset: chunk.start_offset,
			end_offset: chunk.end_offset,
			selector: chunk.selector,
			content_hash: chunk.content_hash
		} satisfies NativeSearchEvidenceChunkReference;
	});
	if (parsedChunks.length === 0 || previousEnd !== contentLength) {
		throw new Error('Native search evidence RPC returned incomplete chunk coverage');
	}

	return {
		page_visit_id: receipt.page_visit_id,
		page_version_id: receipt.page_version_id,
		version_number: receipt.version_number,
		content_hash: receipt.content_hash,
		content_length: contentLength,
		content_format: receipt.content_format as NativeSearchPageEvidenceReceipt['content_format'],
		fetched_at: receipt.fetched_at,
		extraction_method:
			receipt.extraction_method as NativeSearchPageEvidenceReceipt['extraction_method'],
		extraction_version: receipt.extraction_version,
		...(typeof receipt.created === 'boolean' ? { created: receipt.created } : {}),
		chunks: parsedChunks
	};
}

async function callEvidenceRpc(
	client: NativeSearchEvidenceRpcClient,
	functionName: string,
	args: Record<string, unknown>
): Promise<unknown> {
	const { data, error } = await client.rpc(functionName, args);
	if (error) throw new Error(`${functionName} failed: ${error.message}`);
	return data;
}

export async function loadCurrentNativeSearchPageEvidence(
	client: NativeSearchEvidenceRpcClient,
	pageVisitId: string
): Promise<NativeSearchPageEvidenceReceipt | null> {
	const data = await callEvidenceRpc(client, 'get_current_web_page_evidence', {
		p_web_page_visit_id: pageVisitId
	});
	return data === null ? null : parseNativeSearchPageEvidenceReceipt(data);
}

export async function persistNativeSearchPageEvidence(
	client: NativeSearchEvidenceRpcClient,
	input: PersistNativeSearchPageEvidenceInput
): Promise<NativeSearchPageEvidenceReceipt> {
	const chunks = buildNativeSearchEvidenceChunks(input.content);
	if (chunks.length === 0) throw new Error('Native search page evidence content is empty');
	const receipt = parseNativeSearchPageEvidenceReceipt(
		await callEvidenceRpc(client, 'persist_web_page_evidence_version', {
			p_web_page_visit_id: input.pageVisitId,
			p_content_hash: hashNativeSearchPageContent(input.content),
			p_content: input.content,
			p_requested_url: input.requestedUrl,
			p_final_url: input.finalUrl,
			p_canonical_url: input.canonicalUrl,
			p_status_code: input.statusCode ?? 200,
			p_content_type: input.contentType,
			p_title: input.title,
			p_meta: input.meta,
			p_structured_data: input.structuredData,
			p_content_format: input.contentFormat,
			p_excerpt: input.excerpt,
			p_bytes: input.bytes,
			p_fetched_at: input.fetchedAt,
			p_etag: input.etag,
			p_last_modified: input.lastModified,
			p_extraction_method: input.extractionMethod ?? 'static',
			p_extraction_version: input.extractionVersion ?? 'web-visit-v1',
			p_parser: input.parser,
			p_extraction_strategy: input.extractionStrategy,
			p_chunks: chunks
		})
	);
	if (
		receipt.page_visit_id !== input.pageVisitId ||
		receipt.content_hash !== hashNativeSearchPageContent(input.content) ||
		receipt.content_length !== Array.from(input.content).length ||
		receipt.content_format !== input.contentFormat
	) {
		throw new Error('Native search evidence RPC receipt does not match persisted content');
	}
	return receipt;
}
