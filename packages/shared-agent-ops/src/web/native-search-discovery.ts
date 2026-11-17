// packages/shared-agent-ops/src/web/native-search-discovery.ts
import type {
	NativeSearchCandidate,
	NativeSearchDepth,
	NormalizedNativeSearchRequest
} from './native-search';

export const TAVILY_DISCOVERY_URL = 'https://api.tavily.com/search';
export const TAVILY_DISCOVERY_ADAPTER_VERSION = 'tavily-v1';
/** Serper: Google results (snippets only, no page text) for ~$0.001 a query. */
export const SERPER_DISCOVERY_URL = 'https://google.serper.dev/search';
export const SERPER_DISCOVERY_ADAPTER_VERSION = 'serper-v1';
/** Serper bills one credit for up to 10 results, so we always ask for 10 and trim locally. */
export const SERPER_DISCOVERY_RESULTS_PER_CREDIT = 10;
export const NATIVE_SEARCH_DISCOVERY_CACHE_VERSION = 'native-search-discovery-v1';
export const NATIVE_SEARCH_MAX_TITLE_CHARS = 500;
export const NATIVE_SEARCH_MAX_SNIPPET_CHARS = 1_600;
export const NATIVE_SEARCH_MAX_ANSWER_CHARS = 2_000;
export const NATIVE_SEARCH_MAX_FOLLOW_UP_QUESTIONS = 5;
export const NATIVE_SEARCH_MAX_FOLLOW_UP_CHARS = 500;
export const NATIVE_SEARCH_MAX_SOURCE_URL_CHARS = 2_048;
export const NATIVE_SEARCH_DEFAULT_DISCOVERY_TIMEOUT_MS = 30_000;

export type NativeSearchProvider = 'tavily' | 'serper';

export const NATIVE_SEARCH_PROVIDERS: readonly NativeSearchProvider[] = ['tavily', 'serper'];

/** Adapter version per provider; part of every cache key, so providers never share entries. */
export const NATIVE_SEARCH_ADAPTER_VERSIONS: Record<NativeSearchProvider, string> = {
	tavily: TAVILY_DISCOVERY_ADAPTER_VERSION,
	serper: SERPER_DISCOVERY_ADAPTER_VERSION
};

export function isNativeSearchProvider(value: unknown): value is NativeSearchProvider {
	return value === 'tavily' || value === 'serper';
}

export const NATIVE_SEARCH_MAX_PANEL_ATTRIBUTES = 20;

/**
 * Google's knowledge panel for the query (Serper only): who or what the top entity is, its
 * website, a short description and key/value attributes. It is search-engine text, not a page,
 * so callers must treat it as untrusted evidence like any snippet.
 */
export interface NativeSearchKnowledgePanel {
	title: string;
	type?: string;
	website?: string;
	description?: string;
	descriptionSource?: string;
	descriptionLink?: string;
	attributes?: Record<string, string>;
}

export interface NativeSearchProviderUsage {
	credits: number;
}

export interface NativeSearchProviderDiagnostics {
	provider: NativeSearchProvider;
	adapterVersion: string;
	providerRequestId?: string;
	usage?: NativeSearchProviderUsage;
}

/** Provider-neutral candidate set returned before BuildOS page enrichment. */
export interface NativeSearchDiscoveryResult {
	query: string;
	results: NativeSearchCandidate[];
	answer?: string;
	followUpQuestions?: string[];
	knowledgePanel?: NativeSearchKnowledgePanel;
	diagnostics: NativeSearchProviderDiagnostics;
}

export interface NativeSearchDiscoveryDispatch {
	provider: NativeSearchProvider;
	searchDepth: NativeSearchDepth;
	estimatedCredits: number;
}

export interface NativeSearchDiscoveryAdapter {
	provider: NativeSearchProvider;
	version: string;
	discover: (request: NormalizedNativeSearchRequest) => Promise<NativeSearchDiscoveryResult>;
}

export interface TavilyDiscoveryOptions {
	apiKey: string;
	fetchFn?: typeof fetch;
	timeoutMs?: number;
	onBeforeDispatch?: (dispatch: NativeSearchDiscoveryDispatch) => void | Promise<void>;
	signal?: AbortSignal;
}

export interface SerperDiscoveryOptions {
	apiKey: string;
	fetchFn?: typeof fetch;
	timeoutMs?: number;
	onBeforeDispatch?: (dispatch: NativeSearchDiscoveryDispatch) => void | Promise<void>;
	signal?: AbortSignal;
	/** Google country code, e.g. "us". Serper defaults to us when unset. */
	gl?: string;
	/** Google interface language, e.g. "en". Serper defaults to en when unset. */
	hl?: string;
}

export type NativeSearchDiscoveryErrorCode =
	| 'CONFIGURATION_ERROR'
	| 'REQUEST_FAILED'
	| 'HTTP_ERROR'
	| 'INVALID_RESPONSE';

export class NativeSearchDiscoveryError extends Error {
	constructor(
		message: string,
		public readonly code: NativeSearchDiscoveryErrorCode,
		public readonly status?: number
	) {
		super(message);
		this.name = 'NativeSearchDiscoveryError';
	}
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function compactText(value: unknown, maxChars: number): string | undefined {
	if (typeof value !== 'string') return undefined;
	const compact = value.replace(/\s+/g, ' ').trim();
	if (!compact) return undefined;
	return compact.length > maxChars ? `${compact.slice(0, maxChars)}...` : compact;
}

function normalizeSourceUrl(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	try {
		const url = new URL(value.trim());
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
			return undefined;
		}
		const normalized = url.toString();
		return normalized.length <= NATIVE_SEARCH_MAX_SOURCE_URL_CHARS ? normalized : undefined;
	} catch {
		return undefined;
	}
}

function normalizeCandidate(value: unknown): NativeSearchCandidate | undefined {
	const candidate = asRecord(value);
	if (!candidate) return undefined;
	const title = compactText(candidate.title, NATIVE_SEARCH_MAX_TITLE_CHARS);
	const url = normalizeSourceUrl(candidate.url);
	if (!title || !url) return undefined;
	const snippet = compactText(
		candidate.snippet ?? candidate.content ?? candidate.raw_content,
		NATIVE_SEARCH_MAX_SNIPPET_CHARS
	);
	const publishedDate = compactText(candidate.published_date, 100);
	return {
		title,
		url,
		...(snippet ? { snippet } : {}),
		...(typeof candidate.score === 'number' && Number.isFinite(candidate.score)
			? { score: candidate.score }
			: {}),
		...(publishedDate ? { published_date: publishedDate } : {})
	};
}

/**
 * Bound a knowledge panel. Serper's `knowledgeGraph` and our stored shape use the same keys, so
 * one reader serves both the provider response and the cache.
 */
function normalizeKnowledgePanel(value: unknown): NativeSearchKnowledgePanel | undefined {
	const panel = asRecord(value);
	const title = compactText(panel?.title, NATIVE_SEARCH_MAX_TITLE_CHARS);
	if (!panel || !title) return undefined;
	const type = compactText(panel.type, 200);
	const website = normalizeSourceUrl(panel.website);
	const description = compactText(panel.description, NATIVE_SEARCH_MAX_SNIPPET_CHARS);
	const descriptionSource = compactText(panel.descriptionSource, 200);
	const descriptionLink = normalizeSourceUrl(panel.descriptionLink);
	const rawAttributes = asRecord(panel.attributes);
	const attributes: Record<string, string> = {};
	for (const [rawKey, rawValue] of Object.entries(rawAttributes ?? {})) {
		if (Object.keys(attributes).length >= NATIVE_SEARCH_MAX_PANEL_ATTRIBUTES) break;
		const key = compactText(rawKey, 80);
		const attributeValue = compactText(rawValue, 300);
		if (key && attributeValue) attributes[key] = attributeValue;
	}
	return {
		title,
		...(type ? { type } : {}),
		...(website ? { website } : {}),
		...(description ? { description } : {}),
		...(descriptionSource ? { descriptionSource } : {}),
		...(descriptionLink ? { descriptionLink } : {}),
		...(Object.keys(attributes).length ? { attributes } : {})
	};
}

/** Validate and bound a provider-neutral discovery result loaded from storage. */
export function parseNativeSearchDiscoveryResult(
	payload: unknown,
	expectedAdapterVersion?: string
): NativeSearchDiscoveryResult {
	const response = asRecord(payload);
	const query = compactText(response?.query, 1_000);
	const rawResults = response?.results;
	const diagnostics = asRecord(response?.diagnostics);
	const adapterVersion = compactText(diagnostics?.adapterVersion, 100);
	if (
		!response ||
		!query ||
		!Array.isArray(rawResults) ||
		rawResults.length > 10 ||
		!isNativeSearchProvider(diagnostics?.provider) ||
		!adapterVersion ||
		(expectedAdapterVersion !== undefined && adapterVersion !== expectedAdapterVersion)
	) {
		throw new NativeSearchDiscoveryError(
			'Native search cache returned an invalid discovery payload',
			'INVALID_RESPONSE'
		);
	}

	const results = rawResults.map(normalizeCandidate);
	if (results.some((result) => result === undefined)) {
		throw new NativeSearchDiscoveryError(
			'Native search cache returned invalid discovery candidates',
			'INVALID_RESPONSE'
		);
	}
	const answer = compactText(response.answer, NATIVE_SEARCH_MAX_ANSWER_CHARS);
	const rawFollowUps = response.followUpQuestions;
	const followUpQuestions = Array.isArray(rawFollowUps)
		? rawFollowUps
				.map((question) => compactText(question, NATIVE_SEARCH_MAX_FOLLOW_UP_CHARS))
				.filter((question): question is string => Boolean(question))
				.slice(0, NATIVE_SEARCH_MAX_FOLLOW_UP_QUESTIONS)
		: undefined;
	const providerRequestId = compactText(diagnostics.providerRequestId, 300);
	const usage = asRecord(diagnostics.usage);
	const credits = usage?.credits;
	const knowledgePanel = normalizeKnowledgePanel(response.knowledgePanel);

	return {
		query,
		results: results as NativeSearchCandidate[],
		...(answer ? { answer } : {}),
		...(followUpQuestions?.length ? { followUpQuestions } : {}),
		...(knowledgePanel ? { knowledgePanel } : {}),
		diagnostics: {
			provider: diagnostics.provider as NativeSearchProvider,
			adapterVersion,
			...(providerRequestId ? { providerRequestId } : {}),
			...(typeof credits === 'number' && Number.isFinite(credits) && credits > 0
				? { usage: { credits } }
				: {})
		}
	};
}

export function normalizeTavilyDiscoveryResponse(
	request: NormalizedNativeSearchRequest,
	payload: unknown
): NativeSearchDiscoveryResult {
	const response = asRecord(payload);
	if (!response) {
		throw new NativeSearchDiscoveryError(
			'Tavily search returned an invalid response payload',
			'INVALID_RESPONSE'
		);
	}

	const results = (Array.isArray(response.results) ? response.results : [])
		.slice(0, request.maxResults)
		.flatMap((candidate) => {
			const normalized = normalizeCandidate(candidate);
			return normalized ? [normalized] : [];
		});
	const answer = request.includeAnswer
		? compactText(response.answer, NATIVE_SEARCH_MAX_ANSWER_CHARS)
		: undefined;
	const followUpQuestions = Array.isArray(response.follow_up_questions)
		? response.follow_up_questions
				.map((question) => compactText(question, NATIVE_SEARCH_MAX_FOLLOW_UP_CHARS))
				.filter((question): question is string => Boolean(question))
				.slice(0, NATIVE_SEARCH_MAX_FOLLOW_UP_QUESTIONS)
		: undefined;
	const requestId = compactText(response.request_id, 300);
	const usage = asRecord(response.usage);
	const credits = usage?.credits;

	return {
		query: request.query,
		results,
		...(answer ? { answer } : {}),
		...(followUpQuestions?.length ? { followUpQuestions } : {}),
		diagnostics: {
			provider: 'tavily',
			adapterVersion: TAVILY_DISCOVERY_ADAPTER_VERSION,
			...(requestId ? { providerRequestId: requestId } : {}),
			...(typeof credits === 'number' && Number.isFinite(credits) && credits > 0
				? { usage: { credits } }
				: {})
		}
	};
}

export function createTavilyDiscoveryAdapter(
	options: TavilyDiscoveryOptions
): NativeSearchDiscoveryAdapter {
	return {
		provider: 'tavily',
		version: TAVILY_DISCOVERY_ADAPTER_VERSION,
		discover: (request) => discoverWithTavily(request, options)
	};
}

function tavilyCreditsForDepth(searchDepth: NativeSearchDepth): number {
	return searchDepth === 'basic' ? 1 : 2;
}

async function readErrorDetail(response: Response): Promise<string | undefined> {
	try {
		return compactText(await response.text(), 1_000);
	} catch {
		return undefined;
	}
}

/**
 * POST one discovery request with a timeout and the caller's abort signal, and return the parsed
 * JSON. Network, HTTP and JSON failures become NativeSearchDiscoveryError so callers (and the
 * provider fallback) can tell a provider failure from anything else.
 */
async function postDiscoveryRequest(
	label: string,
	url: string,
	init: { headers: Record<string, string>; body: string },
	options: { fetchFn?: typeof fetch; timeoutMs?: number; signal?: AbortSignal }
): Promise<unknown> {
	const controller = new AbortController();
	const onParentAbort = () => controller.abort(options.signal?.reason);
	// A signal aborted before we got here never fires its event again: abort right away.
	if (options.signal?.aborted) onParentAbort();
	else options.signal?.addEventListener('abort', onParentAbort, { once: true });
	const timeoutMs = Math.max(
		1,
		Math.floor(options.timeoutMs ?? NATIVE_SEARCH_DEFAULT_DISCOVERY_TIMEOUT_MS)
	);
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	let response: Response;
	try {
		response = await (options.fetchFn ?? fetch)(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...init.headers },
			body: init.body,
			signal: controller.signal
		});
	} catch (error) {
		clearTimeout(timeout);
		options.signal?.removeEventListener('abort', onParentAbort);
		const message = options.signal?.aborted
			? 'aborted by caller'
			: controller.signal.aborted
				? `timed out after ${timeoutMs}ms`
				: error instanceof Error
					? error.message
					: String(error);
		throw new NativeSearchDiscoveryError(`${label} failed: ${message}`, 'REQUEST_FAILED');
	}

	try {
		if (!response.ok) {
			const detail = await readErrorDetail(response);
			throw new NativeSearchDiscoveryError(
				`${label} failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`,
				'HTTP_ERROR',
				response.status
			);
		}
		try {
			return await response.json();
		} catch {
			throw new NativeSearchDiscoveryError(
				`${label} returned invalid JSON`,
				'INVALID_RESPONSE'
			);
		}
	} finally {
		clearTimeout(timeout);
		options.signal?.removeEventListener('abort', onParentAbort);
	}
}

export async function discoverWithTavily(
	request: NormalizedNativeSearchRequest,
	options: TavilyDiscoveryOptions
): Promise<NativeSearchDiscoveryResult> {
	const apiKey = options.apiKey.trim();
	if (!apiKey) {
		throw new NativeSearchDiscoveryError(
			'Tavily API key is not configured',
			'CONFIGURATION_ERROR'
		);
	}

	await options.onBeforeDispatch?.({
		provider: 'tavily',
		searchDepth: request.searchDepth,
		estimatedCredits: tavilyCreditsForDepth(request.searchDepth)
	});

	const payload = await postDiscoveryRequest(
		'Tavily search',
		TAVILY_DISCOVERY_URL,
		{
			headers: {},
			body: JSON.stringify({
				query: request.query,
				api_key: apiKey,
				search_depth: request.searchDepth,
				include_answer: request.includeAnswer,
				max_results: request.maxResults,
				include_domains: request.includeDomains,
				exclude_domains: request.excludeDomains,
				include_raw_content: false,
				include_images: false,
				include_usage: true
			})
		},
		options
	);
	return normalizeTavilyDiscoveryResponse(request, payload);
}

/**
 * Serper has no domain filter fields; Google's own `site:` operators do the same job. Domains
 * were already validated as bare names by normalizeNativeSearchRequest.
 */
export function buildSerperQuery(request: NormalizedNativeSearchRequest): string {
	const include = request.includeDomains ?? [];
	const exclude = request.excludeDomains ?? [];
	const parts = [request.query];
	if (include.length === 1) parts.push(`site:${include[0]}`);
	else if (include.length > 1)
		parts.push(`(${include.map((domain) => `site:${domain}`).join(' OR ')})`);
	for (const domain of exclude) parts.push(`-site:${domain}`);
	return parts.join(' ');
}

export function normalizeSerperDiscoveryResponse(
	request: NormalizedNativeSearchRequest,
	payload: unknown
): NativeSearchDiscoveryResult {
	const response = asRecord(payload);
	if (!response) {
		throw new NativeSearchDiscoveryError(
			'Serper search returned an invalid response payload',
			'INVALID_RESPONSE'
		);
	}

	// Serper results carry snippets only. Callers read pages with our own fetcher.
	const results = (Array.isArray(response.organic) ? response.organic : [])
		.flatMap((raw) => {
			const item = asRecord(raw);
			if (!item) return [];
			const normalized = normalizeCandidate({
				title: item.title,
				url: item.link,
				snippet: item.snippet,
				published_date: item.date
			});
			return normalized ? [normalized] : [];
		})
		.slice(0, request.maxResults);
	const answerBox = asRecord(response.answerBox);
	const answer = request.includeAnswer
		? compactText(answerBox?.answer ?? answerBox?.snippet, NATIVE_SEARCH_MAX_ANSWER_CHARS)
		: undefined;
	const followUpQuestions = Array.isArray(response.peopleAlsoAsk)
		? response.peopleAlsoAsk
				.map((entry) =>
					compactText(asRecord(entry)?.question, NATIVE_SEARCH_MAX_FOLLOW_UP_CHARS)
				)
				.filter((question): question is string => Boolean(question))
				.slice(0, NATIVE_SEARCH_MAX_FOLLOW_UP_QUESTIONS)
		: undefined;
	const knowledgePanel = normalizeKnowledgePanel(response.knowledgeGraph);
	const credits = response.credits;

	return {
		query: request.query,
		results,
		...(answer ? { answer } : {}),
		...(followUpQuestions?.length ? { followUpQuestions } : {}),
		...(knowledgePanel ? { knowledgePanel } : {}),
		diagnostics: {
			provider: 'serper',
			adapterVersion: SERPER_DISCOVERY_ADAPTER_VERSION,
			...(typeof credits === 'number' && Number.isFinite(credits) && credits > 0
				? { usage: { credits } }
				: {})
		}
	};
}

export function createSerperDiscoveryAdapter(
	options: SerperDiscoveryOptions
): NativeSearchDiscoveryAdapter {
	return {
		provider: 'serper',
		version: SERPER_DISCOVERY_ADAPTER_VERSION,
		discover: (request) => discoverWithSerper(request, options)
	};
}

export async function discoverWithSerper(
	request: NormalizedNativeSearchRequest,
	options: SerperDiscoveryOptions
): Promise<NativeSearchDiscoveryResult> {
	const apiKey = options.apiKey.trim();
	if (!apiKey) {
		throw new NativeSearchDiscoveryError(
			'Serper API key is not configured',
			'CONFIGURATION_ERROR'
		);
	}

	await options.onBeforeDispatch?.({
		provider: 'serper',
		searchDepth: request.searchDepth,
		estimatedCredits: 1
	});

	const gl = options.gl?.trim().toLowerCase();
	const hl = options.hl?.trim().toLowerCase();
	const payload = await postDiscoveryRequest(
		'Serper search',
		SERPER_DISCOVERY_URL,
		{
			headers: { 'X-API-KEY': apiKey },
			body: JSON.stringify({
				q: buildSerperQuery(request),
				num: SERPER_DISCOVERY_RESULTS_PER_CREDIT,
				...(gl ? { gl } : {}),
				...(hl ? { hl } : {})
			})
		},
		options
	);
	return normalizeSerperDiscoveryResponse(request, payload);
}
