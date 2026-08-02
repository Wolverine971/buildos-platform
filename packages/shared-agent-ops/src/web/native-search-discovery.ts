// packages/shared-agent-ops/src/web/native-search-discovery.ts
import type {
	NativeSearchCandidate,
	NativeSearchDepth,
	NormalizedNativeSearchRequest
} from './native-search';

export const TAVILY_DISCOVERY_URL = 'https://api.tavily.com/search';
export const TAVILY_DISCOVERY_ADAPTER_VERSION = 'tavily-v1';
export const NATIVE_SEARCH_DISCOVERY_CACHE_VERSION = 'native-search-discovery-v1';
export const NATIVE_SEARCH_MAX_TITLE_CHARS = 500;
export const NATIVE_SEARCH_MAX_SNIPPET_CHARS = 1_600;
export const NATIVE_SEARCH_MAX_ANSWER_CHARS = 2_000;
export const NATIVE_SEARCH_MAX_FOLLOW_UP_QUESTIONS = 5;
export const NATIVE_SEARCH_MAX_FOLLOW_UP_CHARS = 500;
export const NATIVE_SEARCH_MAX_SOURCE_URL_CHARS = 2_048;
export const NATIVE_SEARCH_DEFAULT_DISCOVERY_TIMEOUT_MS = 30_000;

export type NativeSearchProvider = 'tavily';

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
		diagnostics?.provider !== 'tavily' ||
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

	return {
		query,
		results: results as NativeSearchCandidate[],
		...(answer ? { answer } : {}),
		...(followUpQuestions?.length ? { followUpQuestions } : {}),
		diagnostics: {
			provider: 'tavily',
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

	const controller = new AbortController();
	const timeoutMs = Math.max(
		1,
		Math.floor(options.timeoutMs ?? NATIVE_SEARCH_DEFAULT_DISCOVERY_TIMEOUT_MS)
	);
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	let response: Response;
	try {
		response = await (options.fetchFn ?? fetch)(TAVILY_DISCOVERY_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
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
			}),
			signal: controller.signal
		});
	} catch (error) {
		const message = controller.signal.aborted
			? `timed out after ${timeoutMs}ms`
			: error instanceof Error
				? error.message
				: String(error);
		throw new NativeSearchDiscoveryError(`Tavily search failed: ${message}`, 'REQUEST_FAILED');
	} finally {
		clearTimeout(timeout);
	}

	if (!response.ok) {
		const detail = await readErrorDetail(response);
		throw new NativeSearchDiscoveryError(
			`Tavily search failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`,
			'HTTP_ERROR',
			response.status
		);
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		throw new NativeSearchDiscoveryError(
			'Tavily search returned invalid JSON',
			'INVALID_RESPONSE'
		);
	}
	return normalizeTavilyDiscoveryResponse(request, payload);
}
