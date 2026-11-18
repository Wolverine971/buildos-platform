// apps/worker/tests/webSearchProviders.test.ts
// Serper as a search provider (mock fetch only): which surface uses which provider, fallback to
// Tavily when Serper fails, one reservation per search sized for the fallback, billing settled
// to the provider that answered, and caches that never mix providers.
import { describe, expect, it, vi } from 'vitest';
import {
	type PaidToolCharge,
	WEB_SEARCH_PROVIDER_ORDER,
	createAgentRunWebResearchPort,
	estimateWebSearchCharge,
	readPaidToolCharge,
	resolveSerperQueryCostUsd,
	resolveWebSearchProviders
} from '../src/workers/agent-run/webResearchPort';

const NOW = new Date('2026-11-17T12:00:00.000Z');
const SERPER = 'https://google.serper.dev/search';
const TAVILY = 'https://api.tavily.com/search';

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function serperOk(query: string) {
	return json({
		searchParameters: { q: query },
		knowledgeGraph: { title: 'Acme', website: 'https://acme.example/' },
		organic: [
			{ title: 'Acme', link: 'https://acme.example/', snippet: 'Widgets.', position: 1 }
		],
		credits: 1
	});
}

function tavilyOk() {
	return json({
		request_id: 'tav-1',
		usage: { credits: 1 },
		results: [{ title: 'Acme (Tavily)', url: 'https://acme.example/t', content: 'Widgets.' }]
	});
}

type Fetched = { url: string; body: Record<string, unknown>; headers: Record<string, string> };

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
	const calls: Fetched[] = [];
	const fetchFn = vi.fn(
		async (input: string | URL | Request, init?: Parameters<typeof fetch>[1]) => {
			const url = String(input);
			calls.push({
				url,
				body: JSON.parse(String(init?.body ?? '{}')),
				headers: (init?.headers ?? {}) as Record<string, string>
			});
			return handler(url);
		}
	);
	return { calls, fetchFn: fetchFn as unknown as typeof fetch };
}

describe('web search provider order', () => {
	it('puts knowledge research and chat on Serper first and keeps agent runs and tables on Tavily', () => {
		expect(WEB_SEARCH_PROVIDER_ORDER).toEqual({
			chat: ['serper', 'tavily'],
			agent_run: ['tavily'],
			table_fill: ['tavily'],
			knowledge_research: ['serper', 'tavily']
		});
		const keys = { tavilyApiKey: 't', serperApiKey: 's' };
		expect(resolveWebSearchProviders('knowledge_research', keys)).toEqual(['serper', 'tavily']);
		expect(resolveWebSearchProviders('chat', keys)).toEqual(['serper', 'tavily']);
		expect(resolveWebSearchProviders('agent_run', keys)).toEqual(['tavily']);
		// No Serper key: knowledge research falls back to today's Tavily-only behaviour.
		expect(
			resolveWebSearchProviders('knowledge_research', {
				tavilyApiKey: 't',
				serperApiKey: null
			})
		).toEqual(['tavily']);
		expect(
			resolveWebSearchProviders('knowledge_research', {
				tavilyApiKey: null,
				serperApiKey: null
			})
		).toEqual([]);
	});

	it('prices Serper at $0.001 a query by default and reserves for the priciest fallback', () => {
		const prior = process.env.SERPER_COST_PER_QUERY_USD;
		delete process.env.SERPER_COST_PER_QUERY_USD;
		try {
			expect(resolveSerperQueryCostUsd()).toBe(0.001);
			expect(resolveSerperQueryCostUsd(0.0005)).toBe(0.0005);
			process.env.SERPER_COST_PER_QUERY_USD = '0.00075';
			expect(resolveSerperQueryCostUsd()).toBe(0.00075);
		} finally {
			if (prior === undefined) delete process.env.SERPER_COST_PER_QUERY_USD;
			else process.env.SERPER_COST_PER_QUERY_USD = prior;
		}
		const basic = { search_depth: 'basic' };
		expect(
			estimateWebSearchCharge(basic, ['serper'], { serperQueryCostUsd: 0.001 })
		).toMatchObject({ provider: 'serper', credits: 1, cost_usd: 0.001 });
		expect(
			estimateWebSearchCharge(basic, ['serper', 'tavily'], { serperQueryCostUsd: 0.001 })
		).toMatchObject({ provider: 'tavily', cost_usd: 0.008 });
	});

	it('reads a Serper charge back and still rejects unknown providers', () => {
		const serper: PaidToolCharge = {
			provider: 'serper',
			credits: 1,
			unit_cost_usd: 0.001,
			cost_usd: 0.001,
			source: 'provider_reported'
		};
		expect(readPaidToolCharge({ info: { billing: serper } })).toEqual(serper);
		expect(
			readPaidToolCharge({ info: { billing: { ...serper, provider: 'bing' } } })
		).toBeNull();
	});
});

describe('knowledge research port with Serper', () => {
	it('searches Serper, reserves once, and bills what Serper charged', async () => {
		const { calls, fetchFn } = mockFetch(() => serperOk('Acme serper-only'));
		const reserved: PaidToolCharge[] = [];
		const port = createAgentRunWebResearchPort({
			purpose: 'knowledge_research',
			apiKey: 'tavily-key',
			serperApiKey: 'serper-key',
			serperQueryCostUsd: 0.001,
			fetchFn,
			now: () => NOW,
			onSearchDispatched: (charge) => {
				reserved.push(charge);
			}
		});
		const result = (await port.search!({
			query: 'Acme serper-only',
			max_results: 5,
			search_depth: 'basic'
		})) as any;

		expect(calls.map((c) => c.url)).toEqual([SERPER]);
		expect(calls[0]!.headers['X-API-KEY']).toBe('serper-key');
		expect(calls[0]!.body).toEqual({ q: 'Acme serper-only', num: 10 });
		expect(reserved).toHaveLength(1);
		expect(reserved[0]).toMatchObject({ provider: 'tavily', cost_usd: 0.008 });
		expect(readPaidToolCharge(result)).toMatchObject({
			provider: 'serper',
			credits: 1,
			cost_usd: 0.001,
			source: 'provider_reported'
		});
		expect(result.info.provider).toBe('serper');
		expect(result.info.provider_fallback).toBeUndefined();
		expect(result.knowledge_panel).toEqual({ title: 'Acme', website: 'https://acme.example/' });
		expect(result.results[0].page_content).toBeUndefined();
	});

	it('falls back to Tavily when Serper errors, without a second reservation', async () => {
		const { calls, fetchFn } = mockFetch((url) =>
			url === SERPER ? new Response('Not enough credits', { status: 400 }) : tavilyOk()
		);
		const reserved: PaidToolCharge[] = [];
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const port = createAgentRunWebResearchPort({
			purpose: 'knowledge_research',
			apiKey: 'tavily-key',
			serperApiKey: 'serper-key',
			tavilyCreditCostUsd: 0.008,
			fetchFn,
			now: () => NOW,
			onSearchDispatched: (charge) => {
				reserved.push(charge);
			}
		});
		const result = (await port.search!({
			query: 'Acme fallback',
			search_depth: 'basic'
		})) as any;
		warn.mockRestore();

		expect(calls.map((c) => c.url)).toEqual([SERPER, TAVILY]);
		expect(reserved).toHaveLength(1);
		expect(result.info.provider).toBe('tavily');
		expect(result.info.provider_fallback).toEqual([
			{ provider: 'serper', error: expect.stringContaining('Serper search failed (400') }
		]);
		expect(readPaidToolCharge(result)).toMatchObject({ provider: 'tavily', cost_usd: 0.008 });
		expect(result.results[0].title).toBe('Acme (Tavily)');
	});

	it('does not fall back when the reservation is refused (budget), and never dispatches', async () => {
		const { calls, fetchFn } = mockFetch(() => tavilyOk());
		const port = createAgentRunWebResearchPort({
			purpose: 'knowledge_research',
			apiKey: 'tavily-key',
			serperApiKey: 'serper-key',
			fetchFn,
			onSearchDispatched: () => {
				throw new Error('budget exceeded');
			}
		});
		await expect(port.search!({ query: 'Acme refused' })).rejects.toThrow(
			'Serper search reservation failed: budget exceeded'
		);
		expect(calls).toHaveLength(0);
	});

	it('reports the last provider error when every provider fails', async () => {
		const { fetchFn } = mockFetch(() => new Response('down', { status: 503 }));
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const port = createAgentRunWebResearchPort({
			purpose: 'knowledge_research',
			apiKey: 'tavily-key',
			serperApiKey: 'serper-key',
			fetchFn
		});
		await expect(port.search!({ query: 'Acme all down' })).rejects.toThrow(
			'Tavily search failed (503'
		);
		warn.mockRestore();
	});

	it('uses Tavily only for agent runs even when a Serper key is set', async () => {
		const { calls, fetchFn } = mockFetch(() => tavilyOk());
		const port = createAgentRunWebResearchPort({
			purpose: 'agent_run',
			apiKey: 'tavily-key',
			serperApiKey: 'serper-key',
			fetchFn
		});
		await port.search!({ query: 'Acme agent run only' });
		expect(calls.map((c) => c.url)).toEqual([TAVILY]);
	});

	it('never serves one provider’s cached result to another provider’s search', async () => {
		const tavily = mockFetch(() => tavilyOk());
		const serper = mockFetch(() => serperOk('Acme shared query'));
		const args = { query: 'Acme shared query', search_depth: 'basic' };
		const tavilyPort = createAgentRunWebResearchPort({
			purpose: 'chat',
			apiKey: 'tavily-key',
			fetchFn: tavily.fetchFn
		});
		const serperPort = createAgentRunWebResearchPort({
			providers: ['serper'],
			apiKey: null,
			serperApiKey: 'serper-key',
			fetchFn: serper.fetchFn
		});

		const first = (await tavilyPort.search!(args)) as any;
		expect(await serperPort.searchRequiresDispatch!(args)).toBe(true);
		const second = (await serperPort.search!(args)) as any;
		const again = (await serperPort.search!(args)) as any;

		expect(first.info.provider).toBe('tavily');
		expect(second.info.provider).toBe('serper');
		expect(serper.calls).toHaveLength(1);
		expect(again.info).toMatchObject({ provider: 'serper', cache_status: 'hit' });
		expect(readPaidToolCharge(again)).toBeNull(); // cache hits are free
		expect(await serperPort.searchRequiresDispatch!(args)).toBe(false);
	});

	it('has no search without any key', () => {
		const port = createAgentRunWebResearchPort({
			purpose: 'knowledge_research',
			apiKey: null,
			serperApiKey: null,
			fetchFn: vi.fn() as unknown as typeof fetch
		});
		expect(port.search).toBeUndefined();
		expect(port.visit).toBeTypeOf('function');
	});
});
