// packages/shared-agent-ops/src/web/native-search-response.ts
import type { NativeSearchCandidate, NormalizedNativeSearchRequest } from './native-search';
import type {
	NativeSearchDiscoveryResult,
	NativeSearchKnowledgePanel,
	NativeSearchProvider
} from './native-search-discovery';

export type NativeSearchCacheStatus = 'miss' | 'hit' | 'shared';

export interface NativeSearchResponseInfo {
	provider: NativeSearchProvider;
	adapter_version: string;
	provider_request_id?: string;
	provider_credits?: number;
	search_depth: 'basic' | 'advanced';
	max_results: number;
	include_answer: boolean;
	include_domains?: string[];
	exclude_domains?: string[];
	fetched_at: string;
	cache_status: NativeSearchCacheStatus;
	pages_requested?: number;
	pages_fetched?: number;
}

export interface NativeSearchResponse {
	query: string;
	answer?: string;
	results: NativeSearchCandidate[];
	follow_up_questions?: string[];
	/** Google's knowledge panel (Serper only). Untrusted search-engine text, like snippets. */
	knowledge_panel?: NativeSearchKnowledgePanel;
	message: string;
	info: NativeSearchResponseInfo;
}

function clonePanel(panel: NativeSearchKnowledgePanel): NativeSearchKnowledgePanel {
	return { ...panel, ...(panel.attributes ? { attributes: { ...panel.attributes } } : {}) };
}

export interface BuildNativeSearchResponseInput {
	request: NormalizedNativeSearchRequest;
	discovery: NativeSearchDiscoveryResult;
	fetchedAt: string;
	results?: NativeSearchCandidate[];
	pagesRequested?: number;
	pagesFetched?: number;
}

export function buildNativeSearchResponse(
	input: BuildNativeSearchResponseInput
): NativeSearchResponse {
	const { request, discovery } = input;
	return {
		query: request.query,
		...(discovery.answer ? { answer: discovery.answer } : {}),
		results: (input.results ?? discovery.results).map((result) => ({ ...result })),
		...(discovery.followUpQuestions?.length
			? { follow_up_questions: [...discovery.followUpQuestions] }
			: {}),
		...(discovery.knowledgePanel
			? { knowledge_panel: clonePanel(discovery.knowledgePanel) }
			: {}),
		message: `Web search results for "${request.query}".`,
		info: {
			provider: discovery.diagnostics.provider,
			adapter_version: discovery.diagnostics.adapterVersion,
			...(discovery.diagnostics.providerRequestId
				? { provider_request_id: discovery.diagnostics.providerRequestId }
				: {}),
			...(discovery.diagnostics.usage?.credits !== undefined
				? { provider_credits: discovery.diagnostics.usage.credits }
				: {}),
			search_depth: request.searchDepth,
			max_results: request.maxResults,
			include_answer: request.includeAnswer,
			...(request.includeDomains ? { include_domains: [...request.includeDomains] } : {}),
			...(request.excludeDomains ? { exclude_domains: [...request.excludeDomains] } : {}),
			fetched_at: input.fetchedAt,
			cache_status: 'miss',
			...(input.pagesRequested === undefined
				? {}
				: { pages_requested: input.pagesRequested }),
			...(input.pagesFetched === undefined ? {} : { pages_fetched: input.pagesFetched })
		}
	};
}

export function markNativeSearchResponseCacheStatus<T extends NativeSearchResponse>(
	value: T,
	status: NativeSearchCacheStatus,
	options: { missOnlyInfoKeys?: string[] } = {}
): T {
	const info = { ...value.info } as Record<string, unknown>;
	if (status !== 'miss') {
		for (const key of ['provider_credits', ...(options.missOnlyInfoKeys ?? [])]) {
			delete info[key];
		}
	}
	return {
		...value,
		results: value.results.map((result) => ({ ...result })),
		...(value.follow_up_questions
			? { follow_up_questions: [...value.follow_up_questions] }
			: {}),
		...(value.knowledge_panel ? { knowledge_panel: clonePanel(value.knowledge_panel) } : {}),
		info: { ...info, cache_status: status }
	} as T;
}
