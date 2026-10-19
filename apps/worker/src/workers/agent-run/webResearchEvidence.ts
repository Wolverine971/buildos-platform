// apps/worker/src/workers/agent-run/webResearchEvidence.ts
import { AGENT_OP_WEB_SEARCH, AGENT_OP_WEB_VISIT } from '@buildos/shared-agent-ops';
import type { NativeSearchEvidenceChunkReference } from '@buildos/shared-agent-ops/web/native-search';

const MAX_OBSERVED_VISITS = 50;
const MAX_OBSERVED_SEARCH_RESULTS = 50;

export interface ObservedResearchSource {
	requestedUrl: string;
	finalUrl: string;
	title?: string;
	accessedAt: string;
	/** Bounded text already persisted in the successful tool-execution result. */
	content?: string;
	pageVisitId?: string;
	pageVersionId?: string;
	pageVersionNumber?: number;
	contentHash?: string;
	evidenceChunks?: NativeSearchEvidenceChunkReference[];
}

export interface ObservedResearchSearchResult {
	query: string;
	title: string;
	url: string;
	snippet?: string;
}

export interface WebResearchObservations {
	searchQueries: string[];
	searchResults: ObservedResearchSearchResult[];
	visitedSources: ObservedResearchSource[];
}

function readRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function readText(value: unknown, maxChars: number): string | null {
	if (typeof value !== 'string') return null;
	const compact = value.replace(/\s+/g, ' ').trim();
	return compact ? compact.slice(0, maxChars) : null;
}

function canonicalizeResearchUrl(value: unknown): string | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	try {
		const url = new URL(value.trim());
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
			return null;
		url.hash = '';
		const normalized = url.toString();
		return normalized.length <= 2_048 ? normalized : null;
	} catch {
		return null;
	}
}

function validDateText(value: unknown): string | undefined {
	const text = readText(value, 100);
	return text && Number.isFinite(Date.parse(text)) ? text : undefined;
}

function readUuid(value: unknown): string | undefined {
	return typeof value === 'string' &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
		? value
		: undefined;
}

function readSha256(value: unknown): string | undefined {
	return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : undefined;
}

function readEvidenceChunks(value: unknown): NativeSearchEvidenceChunkReference[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const chunks = value
		.map((raw): NativeSearchEvidenceChunkReference | undefined => {
			const chunk = readRecord(raw);
			if (
				!chunk ||
				typeof chunk.chunk_index !== 'number' ||
				!Number.isInteger(chunk.chunk_index) ||
				chunk.chunk_index < 0 ||
				typeof chunk.start_offset !== 'number' ||
				typeof chunk.end_offset !== 'number' ||
				chunk.start_offset < 0 ||
				chunk.end_offset <= chunk.start_offset ||
				chunk.selector !== `char:${chunk.start_offset}-${chunk.end_offset}`
			) {
				return undefined;
			}
			const contentHash = readSha256(chunk.content_hash);
			if (!contentHash) return undefined;
			return {
				...(readUuid(chunk.id) ? { id: readUuid(chunk.id) } : {}),
				chunk_index: chunk.chunk_index,
				start_offset: chunk.start_offset,
				end_offset: chunk.end_offset,
				selector: chunk.selector,
				content_hash: contentHash
			};
		})
		.filter((chunk): chunk is NativeSearchEvidenceChunkReference => Boolean(chunk))
		.slice(0, 10);
	return chunks.length > 0 ? chunks : undefined;
}

function readPageEvidence(
	record: Record<string, unknown>,
	prefix: '' | 'page_'
): Pick<
	ObservedResearchSource,
	'pageVisitId' | 'pageVersionId' | 'pageVersionNumber' | 'contentHash' | 'evidenceChunks'
> {
	const versionNumber = record.page_version_number;
	return {
		pageVisitId: readUuid(record[prefix ? 'page_visit_id' : 'visit_id']),
		pageVersionId: readUuid(record.page_version_id),
		pageVersionNumber:
			typeof versionNumber === 'number' &&
			Number.isInteger(versionNumber) &&
			versionNumber > 0
				? versionNumber
				: undefined,
		contentHash: readSha256(record[prefix ? 'page_content_hash' : 'content_hash']),
		evidenceChunks: readEvidenceChunks(
			record[prefix ? 'page_evidence_chunks' : 'evidence_chunks']
		)
	};
}

function dedupeStrings(values: string[], limit: number): string[] {
	return Array.from(new Set(values)).slice(0, limit);
}

export function observeWebResearchToolResult(params: {
	op: string;
	args: Record<string, unknown>;
	result: unknown;
	observedAt: string;
}): WebResearchObservations {
	if (params.op === AGENT_OP_WEB_SEARCH) {
		const query = readText(params.args.query, 1_000);
		const result = readRecord(params.result);
		const rawResults = Array.isArray(result?.results) ? result.results : [];
		const searchResults = rawResults.slice(0, 20).flatMap((value) => {
			const candidate = readRecord(value);
			const url = canonicalizeResearchUrl(candidate?.url);
			const title = readText(candidate?.title, 500);
			if (!query || !url || !title) return [];
			return [
				{
					query,
					title,
					url,
					snippet: readText(candidate?.snippet, 600) ?? undefined
				}
			];
		});
		const visitedSources = rawResults.slice(0, 20).flatMap((value) => {
			const candidate = readRecord(value);
			const content = readText(candidate?.page_content, 12_000);
			const requestedUrl = canonicalizeResearchUrl(candidate?.url);
			const finalUrl = canonicalizeResearchUrl(candidate?.page_final_url ?? requestedUrl);
			if (!content || !requestedUrl || !finalUrl) return [];
			return [
				{
					requestedUrl,
					finalUrl,
					title:
						readText(candidate?.page_title, 500) ??
						readText(candidate?.title, 500) ??
						undefined,
					accessedAt: validDateText(candidate?.page_fetched_at) ?? params.observedAt,
					content,
					...(candidate ? readPageEvidence(candidate, 'page_') : {})
				}
			];
		});
		return {
			searchQueries: query ? [query] : [],
			searchResults,
			visitedSources
		};
	}
	if (params.op !== AGENT_OP_WEB_VISIT) {
		return { searchQueries: [], searchResults: [], visitedSources: [] };
	}
	const result = readRecord(params.result);
	const requestedUrl = canonicalizeResearchUrl(result?.url ?? params.args.url);
	const finalUrl = canonicalizeResearchUrl(result?.final_url ?? requestedUrl);
	if (!requestedUrl || !finalUrl) {
		return { searchQueries: [], searchResults: [], visitedSources: [] };
	}
	const info = readRecord(result?.info);
	return {
		searchQueries: [],
		searchResults: [],
		visitedSources: [
			{
				requestedUrl,
				finalUrl,
				title: readText(result?.title, 500) ?? undefined,
				accessedAt: validDateText(info?.fetched_at) ?? params.observedAt,
				content: readText(result?.content, 12_000) ?? undefined,
				...(result ? readPageEvidence(result, '') : {})
			}
		]
	};
}

export function mergeWebResearchObservations(
	...observations: WebResearchObservations[]
): WebResearchObservations {
	const sourceByVisit = new Map<string, ObservedResearchSource>();
	const searchResultByUrl = new Map<string, ObservedResearchSearchResult>();
	for (const observation of observations) {
		for (const searchResult of observation.searchResults) {
			searchResultByUrl.set(searchResult.url, searchResult);
		}
		for (const source of observation.visitedSources) {
			// Preserve every requested URL alias. Two inputs may redirect to the
			// same final URL, and either input is legitimate provenance for a later
			// model-authored source record.
			sourceByVisit.set(`${source.requestedUrl}\n${source.finalUrl}`, source);
		}
	}
	return {
		searchQueries: dedupeStrings(
			observations.flatMap((observation) => observation.searchQueries),
			50
		),
		searchResults: Array.from(searchResultByUrl.values()).slice(0, MAX_OBSERVED_SEARCH_RESULTS),
		visitedSources: Array.from(sourceByVisit.values()).slice(0, MAX_OBSERVED_VISITS)
	};
}
