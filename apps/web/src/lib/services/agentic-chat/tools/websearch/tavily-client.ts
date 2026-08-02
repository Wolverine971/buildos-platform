// apps/web/src/lib/services/agentic-chat/tools/websearch/tavily-client.ts
import { PRIVATE_TAVILY_API_KEY } from '$env/static/private';
import {
	createTavilyDiscoveryAdapter,
	type NativeSearchDiscoveryResult,
	type NormalizedNativeSearchRequest
} from '@buildos/shared-agent-ops/web/native-search';

interface TavilyClientOptions {
	apiKey?: string;
	fetchFn?: typeof fetch;
	timeoutMs?: number;
}

export async function tavilySearch(
	request: NormalizedNativeSearchRequest,
	options: TavilyClientOptions = {}
): Promise<NativeSearchDiscoveryResult> {
	const apiKey = options.apiKey ?? PRIVATE_TAVILY_API_KEY;
	if (!apiKey) {
		throw new Error(
			'Tavily API key not configured. Set PRIVATE_TAVILY_API_KEY in the web environment.'
		);
	}

	const adapter = createTavilyDiscoveryAdapter({
		apiKey,
		fetchFn: options.fetchFn,
		timeoutMs: options.timeoutMs
	});
	return adapter.discover(request);
}
