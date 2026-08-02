// apps/web/src/lib/services/agentic-chat/tools/websearch/index.ts
import { env } from '$env/dynamic/private';
import {
	LayeredNativeSearchCache,
	buildNativeSearchDiscoveryCacheKey,
	buildNativeSearchResponse,
	createNativeSearchDiscoveryCacheEntry,
	markNativeSearchResponseCacheStatus,
	normalizeNativeSearchRequest,
	type NativeSearchDiscoveryCacheEntry,
	type NativeSearchDurableCacheStore
} from '@buildos/shared-agent-ops/web/native-search';
import { createLogger } from '$lib/utils/logger';
import { tavilySearch } from './tavily-client';
import type { WebSearchArgs, WebSearchResultPayload } from './types';

const DEFAULT_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

function parsePositiveInteger(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? '', 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const logger = createLogger('WebSearch');
const searchCache = new LayeredNativeSearchCache<NativeSearchDiscoveryCacheEntry>({
	ttlMs: parsePositiveInteger(env.WEB_SEARCH_CACHE_TTL_MS, DEFAULT_SEARCH_CACHE_TTL_MS),
	maxEntries: 500,
	onDurableError: (error) => {
		logger.warn('Durable native-search cache unavailable; using provider fallback', {
			error: error instanceof Error ? error.message : String(error)
		});
	}
});

export async function performWebSearch(
	args: WebSearchArgs,
	fetchFn?: typeof fetch,
	durableStore?: NativeSearchDurableCacheStore<NativeSearchDiscoveryCacheEntry>
): Promise<WebSearchResultPayload> {
	const normalized = normalizeNativeSearchRequest(args);
	const { query, maxResults, searchDepth, includeAnswer, includeDomains, excludeDomains } =
		normalized;
	const cacheKey = buildNativeSearchDiscoveryCacheKey({
		query,
		searchDepth,
		maxResults,
		includeAnswer,
		includeDomains,
		excludeDomains
	});

	const cached = await searchCache.getOrLoad(
		cacheKey,
		async () => {
			const discovery = await tavilySearch(normalized, { fetchFn });
			return createNativeSearchDiscoveryCacheEntry(discovery, new Date().toISOString());
		},
		{ durableStore }
	);

	const response = buildNativeSearchResponse({
		request: normalized,
		discovery: cached.value.discovery,
		fetchedAt: cached.value.fetchedAt
	});

	return markNativeSearchResponseCacheStatus(response, cached.status);
}

export type {
	WebSearchArgs,
	WebSearchResultItem,
	WebSearchResultPayload,
	TavilySearchDepth
} from './types';
