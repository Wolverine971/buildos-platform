// apps/web/src/lib/services/agentic-chat/tools/websearch/index.ts
import { tavilySearch } from './tavily-client';
import type {
	TavilySearchDepth,
	WebSearchArgs,
	WebSearchResultItem,
	WebSearchResultPayload
} from './types';

const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_CAP = 10;

function normalizeQuery(query?: string): string {
	return query?.trim() ?? '';
}

function clampMaxResults(value?: number): number {
	if (!value || Number.isNaN(value)) return DEFAULT_MAX_RESULTS;
	return Math.min(Math.max(Math.floor(value), 1), MAX_RESULTS_CAP);
}

function normalizeDepth(depth?: TavilySearchDepth): TavilySearchDepth {
	return depth === 'basic' || depth === 'advanced' ? depth : 'advanced';
}

function summarizeContent(content?: string): string | undefined {
	if (!content) return undefined;
	const compact = content.replace(/\s+/g, ' ').trim();
	return compact.length > 400 ? `${compact.slice(0, 400)}...` : compact;
}

export async function performWebSearch(
	args: WebSearchArgs,
	fetchFn?: typeof fetch
): Promise<WebSearchResultPayload> {
	const query = normalizeQuery(args.query);
	if (!query) {
		throw new Error('query is required for web_search');
	}

	const maxResults = clampMaxResults(args.max_results);
	const searchDepth = normalizeDepth(args.search_depth);
	const includeAnswer = args.include_answer ?? true;

	const response = await tavilySearch(
		{
			query,
			search_depth: searchDepth,
			include_answer: includeAnswer,
			max_results: maxResults,
			include_domains: args.include_domains?.length ? args.include_domains : undefined,
			exclude_domains: args.exclude_domains?.length ? args.exclude_domains : undefined,
			include_raw_content: false,
			include_images: false
		},
		{ fetchFn }
	);

	const results: WebSearchResultItem[] = (response.results ?? []).map((result) => ({
		title: result.title,
		url: result.url,
		snippet: summarizeContent(result.content ?? result.raw_content),
		score: result.score,
		published_date: result.published_date
	}));

	return {
		query,
		answer: response.answer,
		results,
		follow_up_questions: response.follow_up_questions,
		message: `Web search results from Tavily for "${query}" (${searchDepth}, max ${maxResults}).`,
		info: {
			provider: 'tavily',
			search_depth: searchDepth,
			max_results: maxResults,
			include_answer: includeAnswer,
			include_domains: args.include_domains,
			exclude_domains: args.exclude_domains,
			fetched_at: new Date().toISOString()
		}
	};
}

export type {
	WebSearchArgs,
	WebSearchResultItem,
	WebSearchResultPayload,
	TavilySearchDepth
} from './types';
