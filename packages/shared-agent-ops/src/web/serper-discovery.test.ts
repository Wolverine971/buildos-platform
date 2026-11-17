// packages/shared-agent-ops/src/web/serper-discovery.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	NativeSearchDiscoveryError,
	buildNativeSearchResponse,
	buildSerperQuery,
	createSerperDiscoveryAdapter,
	markNativeSearchResponseCacheStatus,
	normalizeNativeSearchRequest,
	parseNativeSearchDiscoveryResult
} from './native-search';

function serperPayload() {
	return {
		searchParameters: { q: 'Brave Lizard company', type: 'search', engine: 'google' },
		knowledgeGraph: {
			title: 'Brave Lizard',
			type: 'Design agency',
			website: 'https://bravelizard.example/',
			imageUrl: 'https://img.example/logo.png',
			description: 'Brave Lizard is a design studio in Baltimore.',
			descriptionSource: 'Wikipedia',
			descriptionLink: 'https://en.wikipedia.org/wiki/Brave_Lizard',
			attributes: { Founded: '2014', Headquarters: 'Baltimore, MD' }
		},
		answerBox: { answer: 'A design studio', link: 'https://bravelizard.example/' },
		organic: [
			{
				title: 'Brave Lizard | Home',
				link: 'https://bravelizard.example/',
				snippet: 'We design brands.',
				position: 1,
				sitelinks: [{ title: 'About', link: 'https://bravelizard.example/about' }]
			},
			{ title: 'No link', snippet: 'dropped' },
			{
				title: 'Brave Lizard on LinkedIn',
				link: 'https://www.linkedin.com/company/brave-lizard',
				snippet: 'Brave Lizard | 12 followers',
				date: 'Mar 3, 2026',
				position: 2
			},
			{ title: 'Third', link: 'https://third.example/', position: 3 }
		],
		peopleAlsoAsk: [{ question: 'Who owns Brave Lizard?', snippet: 'x', link: 'https://x' }],
		relatedSearches: [{ query: 'brave lizard baltimore' }],
		credits: 1
	};
}

describe('Serper discovery adapter', () => {
	it('posts q/num with the API key header and maps Google results into the shared shape', async () => {
		const fetchFn = vi.fn(
			async () =>
				new Response(JSON.stringify(serperPayload()), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
		);
		const onBeforeDispatch = vi.fn();
		const adapter = createSerperDiscoveryAdapter({
			apiKey: ' serper-key ',
			fetchFn: fetchFn as typeof fetch,
			onBeforeDispatch,
			gl: 'US'
		});
		const result = await adapter.discover(
			normalizeNativeSearchRequest({
				query: 'Brave Lizard company',
				search_depth: 'basic',
				max_results: 2
			})
		);

		expect(adapter).toMatchObject({ provider: 'serper', version: 'serper-v1' });
		expect(onBeforeDispatch).toHaveBeenCalledWith({
			provider: 'serper',
			searchDepth: 'basic',
			estimatedCredits: 1
		});
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://google.serper.dev/search');
		expect(init.method).toBe('POST');
		expect(init.headers).toMatchObject({
			'Content-Type': 'application/json',
			'X-API-KEY': 'serper-key'
		});
		expect(JSON.parse(String(init.body))).toEqual({
			q: 'Brave Lizard company',
			num: 10,
			gl: 'us'
		});
		expect(result).toEqual({
			query: 'Brave Lizard company',
			results: [
				{
					title: 'Brave Lizard | Home',
					url: 'https://bravelizard.example/',
					snippet: 'We design brands.'
				},
				{
					title: 'Brave Lizard on LinkedIn',
					url: 'https://www.linkedin.com/company/brave-lizard',
					snippet: 'Brave Lizard | 12 followers',
					published_date: 'Mar 3, 2026'
				}
			],
			followUpQuestions: ['Who owns Brave Lizard?'],
			knowledgePanel: {
				title: 'Brave Lizard',
				type: 'Design agency',
				website: 'https://bravelizard.example/',
				description: 'Brave Lizard is a design studio in Baltimore.',
				descriptionSource: 'Wikipedia',
				descriptionLink: 'https://en.wikipedia.org/wiki/Brave_Lizard',
				attributes: { Founded: '2014', Headquarters: 'Baltimore, MD' }
			},
			diagnostics: { provider: 'serper', adapterVersion: 'serper-v1', usage: { credits: 1 } }
		});
		// No page text: snippets only. Answer only when asked for.
		expect(result.results.every((r) => r.page_content === undefined)).toBe(true);
		expect(result.answer).toBeUndefined();
	});

	it('turns domain filters into Google site: operators', () => {
		expect(
			buildSerperQuery(
				normalizeNativeSearchRequest({
					query: 'pricing',
					include_domains: ['a.com', 'b.com'],
					exclude_domains: ['spam.com']
				})
			)
		).toBe('pricing (site:a.com OR site:b.com) -site:spam.com');
		expect(
			buildSerperQuery(
				normalizeNativeSearchRequest({ query: 'pricing', include_domains: ['a.com'] })
			)
		).toBe('pricing site:a.com');
	});

	it('fails with CONFIGURATION_ERROR and never dispatches without a key', async () => {
		const fetchFn = vi.fn();
		const onBeforeDispatch = vi.fn();
		const adapter = createSerperDiscoveryAdapter({
			apiKey: '  ',
			fetchFn: fetchFn as unknown as typeof fetch,
			onBeforeDispatch
		});
		await expect(
			adapter.discover(normalizeNativeSearchRequest({ query: 'x' }))
		).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
		expect(fetchFn).not.toHaveBeenCalled();
		expect(onBeforeDispatch).not.toHaveBeenCalled();
	});

	it('maps HTTP, JSON, network and timeout failures to discovery errors', async () => {
		const request = normalizeNativeSearchRequest({ query: 'x' });
		const run = (fetchFn: unknown, timeoutMs?: number) =>
			createSerperDiscoveryAdapter({
				apiKey: 'k',
				fetchFn: fetchFn as typeof fetch,
				timeoutMs
			}).discover(request);

		await expect(
			run(async () => new Response('Not enough credits', { status: 400 }))
		).rejects.toMatchObject({ code: 'HTTP_ERROR', status: 400 });
		await expect(run(async () => new Response('not json', { status: 200 }))).rejects.toThrow(
			'Serper search returned invalid JSON'
		);
		await expect(run(async () => new Response('[1,2]', { status: 200 }))).rejects.toThrow(
			NativeSearchDiscoveryError
		);
		await expect(
			run(async () => {
				throw new Error('ECONNRESET');
			})
		).rejects.toMatchObject({ code: 'REQUEST_FAILED' });
		await expect(
			run(
				(_url: string, init: RequestInit) =>
					new Promise((_resolve, reject) =>
						init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
					),
				5
			)
		).rejects.toThrow('Serper search failed: timed out after 5ms');
	});

	it('honours the caller abort signal', async () => {
		const parent = new AbortController();
		const pending = createSerperDiscoveryAdapter({
			apiKey: 'k',
			signal: parent.signal,
			// Like real fetch: rejects at once when handed an already-aborted signal.
			fetchFn: ((_url: string, init: RequestInit) =>
				new Promise((_resolve, reject) => {
					if (init.signal?.aborted) reject(new Error('aborted'));
					init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
				})) as unknown as typeof fetch
		}).discover(normalizeNativeSearchRequest({ query: 'x' }));
		parent.abort(new Error('stop'));
		await expect(pending).rejects.toThrow('Serper search failed: aborted by caller');
	});

	it('round-trips Serper results and the panel through the cache parser and response builder', async () => {
		const request = normalizeNativeSearchRequest({ query: 'Brave Lizard company' });
		const discovery = await createSerperDiscoveryAdapter({
			apiKey: 'k',
			fetchFn: (async () =>
				new Response(JSON.stringify(serperPayload()), { status: 200 })) as typeof fetch
		}).discover(request);
		const stored = JSON.parse(JSON.stringify(discovery));

		expect(parseNativeSearchDiscoveryResult(stored, 'serper-v1')).toEqual(discovery);
		expect(() => parseNativeSearchDiscoveryResult(stored, 'tavily-v1')).toThrow(
			'invalid discovery payload'
		);

		const response = buildNativeSearchResponse({
			request,
			discovery,
			fetchedAt: '2026-11-17T00:00:00.000Z'
		});
		expect(response.info).toMatchObject({ provider: 'serper', provider_credits: 1 });
		expect(response.knowledge_panel?.website).toBe('https://bravelizard.example/');
		const hit = markNativeSearchResponseCacheStatus(response, 'hit');
		expect(hit.info.provider_credits).toBeUndefined();
		expect(hit.knowledge_panel).toEqual(response.knowledge_panel);
	});
});
