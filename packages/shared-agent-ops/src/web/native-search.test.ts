// packages/shared-agent-ops/src/web/native-search.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	buildNativeSearchResponse,
	createTavilyDiscoveryAdapter,
	enrichNativeSearchCandidates,
	isGlobalWebPageCacheEligible,
	normalizeNativeSearchRequest,
	normalizeTavilyDiscoveryResponse,
	normalizeWebPageCacheUrl,
	markNativeSearchResponseCacheStatus,
	type NativeSearchCandidate
} from './native-search';

describe('native search core', () => {
	it('normalizes the shared request while preserving Advanced as the default', () => {
		expect(
			normalizeNativeSearchRequest({
				query: '  BuildOS research  ',
				include_domains: ['Example.com', 'example.com']
			})
		).toEqual({
			query: 'BuildOS research',
			searchDepth: 'advanced',
			maxResults: 4,
			includeAnswer: false,
			includeDomains: ['example.com'],
			excludeDomains: undefined
		});
	});

	it('dispatches Tavily through one provider-neutral normalized contract', async () => {
		const onBeforeDispatch = vi.fn();
		const fetchFn = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
			expect(body).toMatchObject({
				query: 'BuildOS research',
				api_key: 'test-key',
				search_depth: 'advanced',
				max_results: 2,
				include_answer: false,
				include_raw_content: false,
				include_images: false,
				include_usage: true
			});
			return new Response(
				JSON.stringify({
					request_id: 'request-1',
					answer: 'Provider prose should be ignored.',
					usage: { credits: 2 },
					follow_up_questions: ['  First question?  ', '', 'Second question?'],
					results: [
						{
							title: '  Primary   source  ',
							url: 'https://example.com/research',
							content: `Evidence ${'x'.repeat(2_000)}`,
							score: 0.98
						},
						{ title: '', url: 'javascript:alert(1)' },
						{ title: 'Outside max_results', url: 'https://example.com/3' }
					]
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		});
		const request = normalizeNativeSearchRequest({
			query: '  BuildOS research  ',
			max_results: 2
		});

		const adapter = createTavilyDiscoveryAdapter({
			apiKey: 'test-key',
			fetchFn: fetchFn as typeof fetch,
			onBeforeDispatch
		});
		const result = await adapter.discover(request);

		expect(adapter).toMatchObject({ provider: 'tavily', version: 'tavily-v1' });
		expect(onBeforeDispatch).toHaveBeenCalledWith({
			provider: 'tavily',
			searchDepth: 'advanced',
			estimatedCredits: 2
		});
		expect(fetchFn).toHaveBeenCalledWith(
			'https://api.tavily.com/search',
			expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) })
		);
		expect(result).toMatchObject({
			query: 'BuildOS research',
			results: [
				{
					title: 'Primary source',
					url: 'https://example.com/research',
					score: 0.98
				}
			],
			followUpQuestions: ['First question?', 'Second question?'],
			diagnostics: {
				provider: 'tavily',
				adapterVersion: 'tavily-v1',
				providerRequestId: 'request-1',
				usage: { credits: 2 }
			}
		});
		expect(result.answer).toBeUndefined();
		expect(result.results[0]?.snippet?.length).toBeLessThanOrEqual(1_603);
	});

	it('only carries bounded provider synthesis when a caller explicitly requests it', () => {
		const request = normalizeNativeSearchRequest({
			query: 'explicit synthesis',
			include_answer: true
		});
		const result = normalizeTavilyDiscoveryResponse(request, {
			answer: `Answer ${'a'.repeat(2_500)}`,
			results: []
		});

		expect(result.answer).toBeDefined();
		expect(result.answer?.length).toBeLessThanOrEqual(2_003);
	});

	it('builds one response contract and strips miss-only telemetry from cache hits', () => {
		const request = normalizeNativeSearchRequest({ query: 'shared response contract' });
		const discovery = normalizeTavilyDiscoveryResponse(request, {
			request_id: 'request-2',
			usage: { credits: 2 },
			results: [
				{
					title: 'Primary source',
					url: 'https://example.com/source',
					content: 'Provider snippet'
				}
			]
		});
		const response = buildNativeSearchResponse({
			request,
			discovery,
			results: [
				{
					...discovery.results[0]!,
					page_content: 'Fetched source evidence',
					page_final_url: 'https://example.com/source'
				}
			],
			fetchedAt: '2026-08-02T12:00:00.000Z',
			pagesRequested: 2,
			pagesFetched: 1
		});
		const hit = markNativeSearchResponseCacheStatus(response, 'hit');

		expect(response).toMatchObject({
			query: 'shared response contract',
			message: 'Web search results for "shared response contract".',
			results: [{ page_content: 'Fetched source evidence' }],
			info: {
				adapter_version: 'tavily-v1',
				provider_request_id: 'request-2',
				provider_credits: 2,
				cache_status: 'miss',
				pages_requested: 2,
				pages_fetched: 1
			}
		});
		expect(hit.info).toMatchObject({
			provider_request_id: 'request-2',
			cache_status: 'hit'
		});
		expect(hit.info.provider_credits).toBeUndefined();
		expect(response.info.provider_credits).toBe(2);
		expect(hit.results).not.toBe(response.results);
	});

	it('fetches only the best two valid candidates among the top four concurrently', async () => {
		let active = 0;
		let maxActive = 0;
		const releases: Array<() => void> = [];
		const fetchPage = vi.fn(async (candidate: { title: string; url: string }) => {
			active += 1;
			maxActive = Math.max(maxActive, active);
			await new Promise<void>((resolve) => {
				releases.push(resolve);
				if (releases.length === 2) releases.splice(0).forEach((release) => release());
			});
			active -= 1;
			return {
				content: `Fetched ${candidate.title}`,
				finalUrl: candidate.url,
				fetchedAt: '2026-08-02T12:00:00.000Z'
			};
		});
		const candidates: NativeSearchCandidate[] = [
			{ title: 'Invalid', url: 'javascript:alert(1)' },
			{ title: 'Second', url: 'https://example.com/2' },
			{ title: 'Third', url: 'https://example.com/3' },
			{ title: 'Fourth', url: 'https://example.com/4' },
			{ title: 'Outside candidate set', url: 'https://example.com/5' }
		];
		const result = await enrichNativeSearchCandidates(candidates, fetchPage);

		expect(maxActive).toBe(2);
		expect(fetchPage).toHaveBeenCalledTimes(2);
		expect(result).toMatchObject({ pagesRequested: 2, pagesFetched: 2 });
		expect(result.results[1]?.page_content).toBe('Fetched Second');
		expect(result.results[2]?.page_content).toBe('Fetched Third');
		expect(result.results[3]?.page_content).toBeUndefined();
	});

	it('keeps signed URLs out of the global page cache and removes tracking keys', () => {
		expect(
			isGlobalWebPageCacheEligible('https://example.com/file?X-Amz-Signature=secret')
		).toBe(false);
		expect(isGlobalWebPageCacheEligible('https://example.com/file?client_secret=secret')).toBe(
			false
		);
		expect(isGlobalWebPageCacheEligible('https://example.com/file?sessionId=session')).toBe(
			false
		);
		expect(isGlobalWebPageCacheEligible('https://example.com/article?page=2')).toBe(true);
		expect(
			normalizeWebPageCacheUrl(
				'https://EXAMPLE.com:443/article?utm_source=newsletter&page=2&fbclid=tracking#part'
			)
		).toBe('https://example.com/article?page=2');
	});
});
