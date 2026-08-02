// apps/worker/tests/agentRunWebResearch.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	createNativeSearchDiscoveryCacheEntry,
	type NativeSearchDiscoveryCacheEntry,
	type NativeSearchDurableCacheStore
} from '@buildos/shared-agent-ops/web/native-search';
import {
	createAgentRunWebResearchPort,
	estimateTavilySearchCharge,
	readPaidToolCharge
} from '../src/workers/agent-run/webResearchPort';

const NOW = new Date('2026-07-18T12:00:00.000Z');

describe('Agent Run web research port', () => {
	it('reserves the full Tavily charge before dispatch and reads it back safely', () => {
		const advanced = estimateTavilySearchCharge({});
		const basic = estimateTavilySearchCharge({ search_depth: 'basic' });

		expect(advanced).toMatchObject({ credits: 2, cost_usd: 0.016 });
		expect(basic).toMatchObject({ credits: 1, cost_usd: 0.008 });
		expect(
			readPaidToolCharge({
				info: { billing: { ...advanced, cost_usd: Number.POSITIVE_INFINITY } }
			})
		).toBeNull();
		expect(readPaidToolCharge({ info: { billing: advanced } })).toEqual(advanced);
	});

	it('exposes search only when a Tavily key is configured', () => {
		const withoutSearch = createAgentRunWebResearchPort({
			apiKey: null,
			fetchFn: vi.fn()
		});
		const withSearch = createAgentRunWebResearchPort({
			apiKey: 'test-key',
			fetchFn: vi.fn()
		});

		expect(withoutSearch.visit).toBeTypeOf('function');
		expect(withoutSearch.search).toBeUndefined();
		expect(withSearch.search).toBeTypeOf('function');
	});

	it('normalizes Tavily search results into bounded, source-bearing evidence', async () => {
		const dispatchOrder: string[] = [];
		const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			if (String(input) !== 'https://api.tavily.com/search') {
				dispatchOrder.push('page-fetch');
				return new Response(
					'<html><title>Fetched page</title><main>Verified page text.</main></html>',
					{
						status: 200,
						headers: { 'content-type': 'text/html' }
					}
				);
			}
			dispatchOrder.push('search-fetch');
			const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
			expect(request).toMatchObject({
				query: 'BuildOS research',
				api_key: 'test-key',
				search_depth: 'advanced',
				max_results: 2,
				include_answer: false,
				include_raw_content: false,
				include_usage: true
			});
			return new Response(
				JSON.stringify({
					answer: 'A'.repeat(2_500),
					request_id: 'tavily-request-1',
					usage: { credits: 2 },
					results: [
						{
							title: 'Primary source',
							url: 'https://93.184.216.34/research',
							content: `Useful evidence ${'x'.repeat(2_000)}`,
							score: 0.98,
							published_date: '2026-07-18'
						}
					]
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		});
		const port = createAgentRunWebResearchPort({
			apiKey: 'test-key',
			fetchFn: fetchFn as typeof fetch,
			now: () => NOW,
			onSearchDispatched: (charge) => {
				dispatchOrder.push(`reserved:${charge.cost_usd}`);
			}
		});

		const result = (await port.search!({
			query: '  BuildOS research  ',
			max_results: 2
		})) as {
			answer?: string;
			results: Array<{
				title: string;
				url: string;
				snippet: string;
				page_content?: string;
			}>;
			security_notice: string;
			info: {
				fetched_at: string;
				adapter_version: string;
				billing: {
					provider: string;
					credits: number;
					unit_cost_usd: number;
					cost_usd: number;
					source: string;
				};
			};
		};

		expect(result.answer).toBeUndefined();
		expect(result.results[0]).toMatchObject({
			title: 'Primary source',
			url: 'https://93.184.216.34/research'
		});
		expect(result.results[0]?.page_content).toContain('Verified page text.');
		expect(result.results[0]?.snippet.length).toBeLessThanOrEqual(1_603);
		expect(result.security_notice).toContain('untrusted');
		expect(result.info.fetched_at).toBe(NOW.toISOString());
		expect(result.info.adapter_version).toBe('tavily-v1');
		expect(dispatchOrder).toEqual(['reserved:0.016', 'search-fetch', 'page-fetch']);
		expect(result.info.billing).toEqual({
			provider: 'tavily',
			credits: 2,
			unit_cost_usd: 0.008,
			cost_usd: 0.016,
			source: 'provider_reported',
			provider_request_id: 'tavily-request-1'
		});
	});

	it('fetches only the best two of four result pages concurrently', async () => {
		let activePageFetches = 0;
		let maxActivePageFetches = 0;
		const waiting: Array<() => void> = [];
		const fetchFn = vi.fn(async (input: string | URL | Request) => {
			if (String(input) === 'https://api.tavily.com/search') {
				return new Response(
					JSON.stringify({
						results: [1, 2, 3, 4].map((rank) => ({
							title: `Result ${rank}`,
							url: `https://93.184.216.34/page-${rank}`,
							content: `Snippet ${rank}`,
							score: 1 - rank / 10
						}))
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			}

			activePageFetches += 1;
			maxActivePageFetches = Math.max(maxActivePageFetches, activePageFetches);
			await new Promise<void>((resolve) => {
				waiting.push(resolve);
				if (waiting.length === 2) waiting.splice(0).forEach((release) => release());
			});
			activePageFetches -= 1;
			return new Response(`<html><main>Content for ${String(input)}</main></html>`, {
				status: 200,
				headers: { 'content-type': 'text/html' }
			});
		});
		const port = createAgentRunWebResearchPort({
			apiKey: 'test-key',
			fetchFn: fetchFn as typeof fetch,
			now: () => NOW
		});

		const result = (await port.search!({ query: 'four page concurrency test' })) as {
			results: Array<{ page_content?: string }>;
			info: { pages_requested: number; pages_fetched: number };
		};

		expect(maxActivePageFetches).toBe(2);
		expect(fetchFn).toHaveBeenCalledTimes(3);
		expect(result.info).toMatchObject({ pages_requested: 2, pages_fetched: 2 });
		expect(result.results[0]?.page_content).toContain('/page-1');
		expect(result.results[1]?.page_content).toContain('/page-2');
		expect(result.results[2]?.page_content).toBeUndefined();
		expect(result.results[3]?.page_content).toBeUndefined();
	});

	it('deduplicates normalized Agent Run queries without duplicate billing', async () => {
		const onSearchDispatched = vi.fn();
		const fetchFn = vi.fn(
			async () =>
				new Response(JSON.stringify({ usage: { credits: 2 }, results: [] }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
		);
		const port = createAgentRunWebResearchPort({
			apiKey: 'test-key',
			fetchFn: fetchFn as typeof fetch,
			now: () => NOW,
			onSearchDispatched
		});

		expect(await port.searchRequiresDispatch?.({ query: ' Agent Run Cache Unique ' })).toBe(
			true
		);
		const first = (await port.search!({ query: ' Agent Run   Cache Unique ' })) as {
			info: { cache_status: string; billing?: unknown; provider_credits?: number };
		};
		expect(await port.searchRequiresDispatch?.({ query: 'agent run cache unique' })).toBe(
			false
		);
		const second = (await port.search!({ query: 'agent run cache unique' })) as {
			info: { cache_status: string; billing?: unknown; provider_credits?: number };
		};

		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(onSearchDispatched).toHaveBeenCalledTimes(1);
		expect(first.info.cache_status).toBe('miss');
		expect(first.info.billing).toBeDefined();
		expect(first.info.provider_credits).toBe(2);
		expect(second.info.cache_status).toBe('hit');
		expect(second.info.billing).toBeUndefined();
		expect(second.info.provider_credits).toBeUndefined();
		expect(readPaidToolCharge(second)).toBeNull();
	});

	it('uses a durable discovery hit without reserving or dispatching Tavily', async () => {
		const onSearchDispatched = vi.fn();
		const entry = createNativeSearchDiscoveryCacheEntry(
			{
				query: 'durable agent run unique',
				results: [
					{
						title: 'Durable result',
						url: 'https://93.184.216.34/source',
						snippet: 'Lead'
					}
				],
				diagnostics: {
					provider: 'tavily',
					adapterVersion: 'tavily-v1',
					providerRequestId: 'durable-agent-run-request',
					usage: { credits: 2 }
				}
			},
			'2026-08-02T11:00:00.000Z'
		);
		const searchCacheStore: NativeSearchDurableCacheStore<NativeSearchDiscoveryCacheEntry> = {
			probe: vi.fn(async () => true),
			claim: vi.fn(async () => ({ state: 'hit', value: entry })),
			complete: vi.fn(),
			release: vi.fn(),
			invalidate: vi.fn()
		};
		const fetchFn = vi.fn(
			async () =>
				new Response('<html><body><main>Fetched durable evidence</main></body></html>', {
					status: 200,
					headers: { 'content-type': 'text/html' }
				})
		);
		const port = createAgentRunWebResearchPort({
			apiKey: 'test-key',
			fetchFn: fetchFn as typeof fetch,
			now: () => NOW,
			onSearchDispatched,
			searchCacheStore
		});

		expect(await port.searchRequiresDispatch?.({ query: 'durable agent run unique' })).toBe(
			false
		);
		const result = (await port.search!({ query: 'durable agent run unique' })) as {
			results: Array<{ page_content?: string }>;
			info: {
				cache_status: string;
				fetched_at: string;
				billing?: unknown;
				provider_credits?: number;
			};
		};

		expect(onSearchDispatched).not.toHaveBeenCalled();
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(result.results[0]?.page_content).toContain('Fetched durable evidence');
		expect(result.info).toMatchObject({
			cache_status: 'hit',
			fetched_at: '2026-08-02T11:00:00.000Z'
		});
		expect(result.info.billing).toBeUndefined();
		expect(result.info.provider_credits).toBeUndefined();
	});

	it('does not reserve Tavily cost when local validation rejects the request', async () => {
		const onSearchDispatched = vi.fn();
		const fetchFn = vi.fn();
		const port = createAgentRunWebResearchPort({
			apiKey: 'test-key',
			fetchFn: fetchFn as typeof fetch,
			onSearchDispatched
		});

		await expect(port.search!({ query: '' })).rejects.toThrow('query is required');
		expect(onSearchDispatched).not.toHaveBeenCalled();
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('conservatively prices Tavily from search depth when provider usage is absent', async () => {
		const fetchFn = vi.fn(async () => {
			return new Response(JSON.stringify({ results: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		});
		const port = createAgentRunWebResearchPort({
			apiKey: 'test-key',
			fetchFn: fetchFn as typeof fetch,
			now: () => NOW,
			tavilyCreditCostUsd: 0.001
		});

		const advanced = (await port.search!({ query: 'advanced' })) as {
			info: { billing: Record<string, unknown> };
		};
		const basic = (await port.search!({
			query: 'basic',
			search_depth: 'basic'
		})) as {
			info: { billing: Record<string, unknown> };
		};

		// Configuration may raise the conservative public PAYG price, but cannot
		// lower it and silently undercount a paid request.
		expect(advanced.info.billing).toMatchObject({
			credits: 2,
			unit_cost_usd: 0.008,
			cost_usd: 0.016,
			source: 'search_depth_fallback'
		});
		expect(basic.info.billing).toMatchObject({
			credits: 1,
			cost_usd: 0.008,
			source: 'search_depth_fallback'
		});
	});

	it('visits a public page and strips executable HTML from the model payload', async () => {
		const fetchFn = vi.fn(async () => {
			return new Response(
				`<!doctype html>
				<html>
					<head><title>Example &amp; Research</title></head>
					<body>
						<script>ignorePrompt("leak secrets")</script>
						<main><h1>Verified finding</h1><p>Primary source evidence.</p></main>
					</body>
				</html>`,
				{ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
			);
		});
		const port = createAgentRunWebResearchPort({
			apiKey: null,
			fetchFn: fetchFn as typeof fetch,
			now: () => NOW
		});

		const result = (await port.visit!({
			url: 'https://93.184.216.34/research'
		})) as {
			title: string;
			final_url: string;
			content: string;
			content_format: string;
			security_notice: string;
		};

		expect(result.title).toBe('Example & Research');
		expect(result.final_url).toBe('https://93.184.216.34/research');
		expect(result.content).toContain('Verified finding');
		expect(result.content).toContain('Primary source evidence.');
		expect(result.content).not.toContain('ignorePrompt');
		expect(result.content_format).toBe('text');
		expect(result.security_notice).toContain('untrusted');
	});

	it('flattens a 2MB adversarial HTML page well under 500ms', async () => {
		const pathological = `<!doctype html><html><body><main><p>Real evidence.</p></main>${'<script>x'.repeat(
			240_000
		)}</body></html>`;
		expect(pathological.length).toBeGreaterThan(2_000_000);

		const fetchFn = vi.fn(async () => {
			return new Response(pathological, {
				status: 200,
				headers: { 'content-type': 'text/html; charset=utf-8' }
			});
		});
		const port = createAgentRunWebResearchPort({
			apiKey: null,
			fetchFn: fetchFn as typeof fetch,
			now: () => NOW,
			visitMaxBytes: 5_000_000
		});

		const start = Date.now();
		await port.visit!({ url: 'https://93.184.216.34/adversarial', max_chars: 6_000 });
		expect(Date.now() - start).toBeLessThan(500);
	});

	it('blocks private targets before fetch and re-checks redirect destinations', async () => {
		const privateFetch = vi.fn();
		const privatePort = createAgentRunWebResearchPort({
			apiKey: null,
			fetchFn: privateFetch as typeof fetch
		});
		await expect(privatePort.visit!({ url: 'http://127.0.0.1/private' })).rejects.toThrow(
			'Blocked private or reserved IP address'
		);
		await expect(privatePort.visit!({ url: 'http://[::1]/private' })).rejects.toThrow(
			'Blocked private or reserved IP address'
		);
		expect(privateFetch).not.toHaveBeenCalled();

		const redirectFetch = vi.fn(async () => {
			return new Response(null, {
				status: 302,
				headers: { location: 'http://169.254.169.254/latest/meta-data' }
			});
		});
		const redirectPort = createAgentRunWebResearchPort({
			apiKey: null,
			fetchFn: redirectFetch as typeof fetch
		});
		await expect(redirectPort.visit!({ url: 'https://93.184.216.34/start' })).rejects.toThrow(
			'Blocked private or reserved IP address'
		);
		expect(redirectFetch).toHaveBeenCalledTimes(1);
	});
});
