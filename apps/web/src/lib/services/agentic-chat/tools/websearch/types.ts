// apps/web/src/lib/services/agentic-chat/tools/websearch/types.ts
import type {
	NativeSearchCandidate,
	NativeSearchDepth,
	NativeSearchResponse
} from '@buildos/shared-agent-ops/web/native-search';

export type TavilySearchDepth = NativeSearchDepth;

export interface WebSearchArgs {
	query: string;
	search_depth?: TavilySearchDepth;
	max_results?: number;
	include_answer?: boolean;
	include_domains?: string[];
	exclude_domains?: string[];
}

export type WebSearchResultItem = NativeSearchCandidate;

export type WebSearchResultPayload = NativeSearchResponse;
