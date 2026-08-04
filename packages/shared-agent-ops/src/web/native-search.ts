// packages/shared-agent-ops/src/web/native-search.ts
export const NATIVE_SEARCH_DEFAULT_MAX_RESULTS = 4;
export const NATIVE_SEARCH_MAX_RESULTS = 10;
export const NATIVE_SEARCH_MAX_QUERY_CHARS = 1_000;
export const NATIVE_SEARCH_MAX_DOMAIN_FILTERS = 20;
export const NATIVE_SEARCH_PAGE_CANDIDATE_LIMIT = 4;
export const NATIVE_SEARCH_PAGE_FETCH_LIMIT = 2;

const TRACKING_QUERY_PARAMS = new Set([
	'_hsenc',
	'_hsmi',
	'dclid',
	'fbclid',
	'gclid',
	'mc_cid',
	'mc_eid',
	'msclkid'
]);
const SENSITIVE_QUERY_PARAMS = new Set([
	'access_token',
	'apikey',
	'api_key',
	'auth',
	'authorization',
	'awsaccesskeyid',
	'code',
	'expires',
	'jwt',
	'key',
	'password',
	'secret',
	'session',
	'session_id',
	'sig',
	'signature',
	'token'
]);
const SENSITIVE_QUERY_PREFIXES = ['x-amz-', 'x-goog-'];

export type NativeSearchDepth = 'basic' | 'advanced';

export interface NativeSearchRequestInput {
	query?: unknown;
	search_depth?: unknown;
	max_results?: unknown;
	include_answer?: unknown;
	include_domains?: unknown;
	exclude_domains?: unknown;
}

export interface NormalizedNativeSearchRequest {
	query: string;
	searchDepth: NativeSearchDepth;
	maxResults: number;
	includeAnswer: boolean;
	includeDomains?: string[];
	excludeDomains?: string[];
}

export interface NativeSearchCandidate {
	title: string;
	url: string;
	snippet?: string;
	score?: number;
	published_date?: string;
	page_title?: string;
	page_content?: string;
	page_final_url?: string;
	page_fetched_at?: string;
	page_cache_hit?: boolean;
	page_visit_id?: string;
	page_version_id?: string;
	page_version_number?: number;
	page_content_hash?: string;
	page_evidence_chunks?: import('./native-search-evidence').NativeSearchEvidenceChunkReference[];
}

export interface NativeSearchPageFetchResult {
	title?: string;
	content: string;
	finalUrl: string;
	fetchedAt: string;
	cacheHit?: boolean;
	visitId?: string;
	versionId?: string;
	versionNumber?: number;
	contentHash?: string;
	evidenceChunks?: import('./native-search-evidence').NativeSearchEvidenceChunkReference[];
}

export interface NativeSearchEnrichmentResult<T extends NativeSearchCandidate> {
	results: T[];
	pagesRequested: number;
	pagesFetched: number;
}

export class NativeSearchValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'NativeSearchValidationError';
	}
}

function normalizeDomains(value: unknown, key: string): string[] | undefined {
	if (value === undefined || value === null) return undefined;
	if (!Array.isArray(value)) {
		throw new NativeSearchValidationError(`${key} must be an array of domains`);
	}
	const domains = Array.from(
		new Set(
			value
				.filter((domain): domain is string => typeof domain === 'string')
				.map((domain) => domain.trim().toLowerCase())
				.filter(Boolean)
		)
	);
	if (domains.length > NATIVE_SEARCH_MAX_DOMAIN_FILTERS) {
		throw new NativeSearchValidationError(
			`${key} supports at most ${NATIVE_SEARCH_MAX_DOMAIN_FILTERS} domains`
		);
	}
	if (domains.some((domain) => domain.length > 255 || /[/\s]/.test(domain))) {
		throw new NativeSearchValidationError(`${key} entries must be bare domain names`);
	}
	return domains.length > 0 ? domains : undefined;
}

export function normalizeNativeSearchRequest(
	input: NativeSearchRequestInput
): NormalizedNativeSearchRequest {
	if (typeof input.query !== 'string' || !input.query.trim()) {
		throw new NativeSearchValidationError('query is required for web_search');
	}
	const query = input.query.trim();
	if (query.length > NATIVE_SEARCH_MAX_QUERY_CHARS) {
		throw new NativeSearchValidationError(
			`query must be ${NATIVE_SEARCH_MAX_QUERY_CHARS} characters or fewer`
		);
	}
	const requestedMax =
		typeof input.max_results === 'number' && Number.isFinite(input.max_results)
			? Math.floor(input.max_results)
			: NATIVE_SEARCH_DEFAULT_MAX_RESULTS;
	return {
		query,
		searchDepth: input.search_depth === 'basic' ? 'basic' : 'advanced',
		maxResults: Math.min(Math.max(requestedMax, 1), NATIVE_SEARCH_MAX_RESULTS),
		includeAnswer: typeof input.include_answer === 'boolean' ? input.include_answer : false,
		includeDomains: normalizeDomains(input.include_domains, 'include_domains'),
		excludeDomains: normalizeDomains(input.exclude_domains, 'exclude_domains')
	};
}

function validCandidateUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
	} catch {
		return false;
	}
}

export async function enrichNativeSearchCandidates<T extends NativeSearchCandidate>(
	results: readonly T[],
	fetchPage: (candidate: T) => Promise<NativeSearchPageFetchResult>,
	options: { candidateLimit?: number; pageLimit?: number } = {}
): Promise<NativeSearchEnrichmentResult<T>> {
	const candidateLimit = Math.max(
		0,
		Math.floor(options.candidateLimit ?? NATIVE_SEARCH_PAGE_CANDIDATE_LIMIT)
	);
	const pageLimit = Math.max(0, Math.floor(options.pageLimit ?? NATIVE_SEARCH_PAGE_FETCH_LIMIT));
	const selected = results
		.slice(0, candidateLimit)
		.map((candidate, index) => ({ candidate, index }))
		.filter(({ candidate }) => validCandidateUrl(candidate.url))
		.slice(0, pageLimit);
	const pages = await Promise.allSettled(selected.map(({ candidate }) => fetchPage(candidate)));
	const enriched = results.map((result) => ({ ...result })) as T[];
	let pagesFetched = 0;
	for (const [selectedIndex, page] of pages.entries()) {
		if (page.status !== 'fulfilled') continue;
		const target = selected[selectedIndex];
		if (!target) continue;
		pagesFetched += 1;
		enriched[target.index] = {
			...enriched[target.index],
			...(page.value.title ? { page_title: page.value.title } : {}),
			...(page.value.visitId ? { page_visit_id: page.value.visitId } : {}),
			...(page.value.versionId ? { page_version_id: page.value.versionId } : {}),
			...(page.value.versionNumber === undefined
				? {}
				: { page_version_number: page.value.versionNumber }),
			...(page.value.contentHash ? { page_content_hash: page.value.contentHash } : {}),
			...(page.value.evidenceChunks?.length
				? { page_evidence_chunks: page.value.evidenceChunks.map((chunk) => ({ ...chunk })) }
				: {}),
			page_content: page.value.content,
			page_final_url: page.value.finalUrl,
			page_fetched_at: page.value.fetchedAt,
			...(page.value.cacheHit === undefined ? {} : { page_cache_hit: page.value.cacheHit })
		};
	}
	return {
		results: enriched,
		pagesRequested: selected.length,
		pagesFetched
	};
}

function isSensitiveQueryKey(key: string): boolean {
	const normalized = key.trim().toLowerCase();
	const compact = normalized.replace(/[^a-z0-9]/g, '');
	return (
		SENSITIVE_QUERY_PARAMS.has(normalized) ||
		SENSITIVE_QUERY_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
		compact.endsWith('token') ||
		compact.endsWith('secret') ||
		compact.endsWith('signature') ||
		compact.endsWith('password') ||
		compact.endsWith('credential') ||
		compact === 'sessionid'
	);
}

export function isGlobalWebPageCacheEligible(inputUrl: string): boolean {
	try {
		const url = new URL(inputUrl);
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
			return false;
		return [...url.searchParams.keys()].every((key) => !isSensitiveQueryKey(key));
	} catch {
		return false;
	}
}

export function normalizeWebPageCacheUrl(inputUrl: string): string {
	const url = new URL(inputUrl);
	url.hash = '';
	url.hostname = url.hostname.toLowerCase();
	url.protocol = url.protocol.toLowerCase();
	if (
		(url.protocol === 'http:' && url.port === '80') ||
		(url.protocol === 'https:' && url.port === '443')
	) {
		url.port = '';
	}

	const entries = [...url.searchParams.entries()]
		.filter(([key]) => {
			const normalized = key.toLowerCase();
			return !normalized.startsWith('utm_') && !TRACKING_QUERY_PARAMS.has(normalized);
		})
		.sort((left, right) => {
			const keyOrder = left[0].localeCompare(right[0]);
			return keyOrder !== 0 ? keyOrder : left[1].localeCompare(right[1]);
		});
	url.search = '';
	for (const [key, value] of entries) url.searchParams.append(key, value);
	return url.toString();
}

export * from './native-search-discovery';
export * from './native-search-response';
export * from './native-search-cache';
export * from './native-search-evidence';
