// apps/web/src/lib/services/agentic-chat/tools/websearch/types.ts
export type TavilySearchDepth = 'basic' | 'advanced';

export interface TavilySearchRequest {
	query: string;
	api_key: string;
	search_depth?: TavilySearchDepth;
	max_results?: number;
	include_answer?: boolean;
	include_raw_content?: boolean;
	include_images?: boolean;
	include_domains?: string[];
	exclude_domains?: string[];
}

export interface TavilySearchResult {
	title: string;
	url: string;
	content?: string;
	raw_content?: string;
	score?: number;
	published_date?: string;
}

export interface TavilySearchResponse {
	query: string;
	answer?: string;
	results: TavilySearchResult[];
	images?: string[];
	follow_up_questions?: string[];
}

export interface WebSearchArgs {
	query: string;
	search_depth?: TavilySearchDepth;
	max_results?: number;
	include_answer?: boolean;
	include_domains?: string[];
	exclude_domains?: string[];
}

export interface WebSearchResultItem {
	title: string;
	url: string;
	snippet?: string;
	score?: number;
	published_date?: string;
}

export interface WebSearchResultPayload {
	query: string;
	answer?: string;
	results: WebSearchResultItem[];
	follow_up_questions?: string[];
	message: string;
	info: {
		provider: 'tavily';
		search_depth: TavilySearchDepth;
		max_results: number;
		include_answer: boolean;
		include_domains?: string[];
		exclude_domains?: string[];
		fetched_at: string;
	};
}
