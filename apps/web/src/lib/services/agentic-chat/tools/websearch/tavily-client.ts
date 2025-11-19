// apps/web/src/lib/services/agentic-chat/tools/websearch/tavily-client.ts
import { PRIVATE_TAVILY_API_KEY } from '$env/static/private';
import type { TavilySearchRequest, TavilySearchResponse } from './types';

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';

interface TavilyClientOptions {
	apiKey?: string;
	fetchFn?: typeof fetch;
}

export async function tavilySearch(
	request: Omit<TavilySearchRequest, 'api_key'>,
	options: TavilyClientOptions = {}
): Promise<TavilySearchResponse> {
	const apiKey = options.apiKey ?? PRIVATE_TAVILY_API_KEY;
	if (!apiKey) {
		throw new Error(
			'Tavily API key not configured. Set PRIVATE_TAVILY_API_KEY in the web environment.'
		);
	}

	const fetcher = options.fetchFn ?? fetch;
	const response = await fetcher(TAVILY_SEARCH_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			...request,
			api_key: apiKey
		})
	});

	if (!response.ok) {
		let errorPayload: unknown;
		try {
			errorPayload = await response.json();
		} catch {
			errorPayload = await response.text();
		}

		throw new Error(
			`Tavily search failed (${response.status} ${response.statusText}): ${JSON.stringify(
				errorPayload
			)}`
		);
	}

	return (await response.json()) as TavilySearchResponse;
}
