// apps/web/src/lib/services/agentic-chat/tools/websearch/index.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	createNativeSearchDiscoveryCacheEntry,
	type NativeSearchDiscoveryCacheEntry,
	type NativeSearchDurableCacheStore
} from '@buildos/shared-agent-ops/web/native-search';
import { performWebSearch } from './index';

function stubTavilyFetch(resultContent: string): typeof fetch {
	return (async () =>
		new Response(
			JSON.stringify({
				answer: 'Synthesized answer.',
				results: [
					{
						title: 'Result',
						url: 'https://example.com',
						content: resultContent,
						score: 0.9
					}
				]
			}),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		)) as typeof fetch;
}

describe('performWebSearch', () => {
	it('keeps snippets up to 1,600 chars instead of the old 400-char cap', async () => {
		const content = 'evidence '.repeat(220).trim(); // ~1,980 chars
		const payload = await performWebSearch(
			{ query: 'snippet limit query' },
			stubTavilyFetch(content)
		);

		const snippet = payload.results[0]?.snippet ?? '';
		expect(snippet.length).toBeGreaterThan(1500);
		expect(snippet.length).toBeLessThanOrEqual(1603); // cap + ellipsis
	});

	it('passes short content through untruncated', async () => {
		const payload = await performWebSearch(
			{ query: 'short content query' },
			stubTavilyFetch('short evidence')
		);

		expect(payload.results[0]?.snippet).toBe('short evidence');
	});

	it('keeps advanced discovery while disabling provider synthesis by default', async () => {
		const fetchFn = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
			const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
			expect(request).toMatchObject({
				search_depth: 'advanced',
				max_results: 4,
				include_answer: false,
				include_usage: true
			});
			return new Response(
				JSON.stringify({ answer: 'Provider answer should be ignored.', results: [] }),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		});

		const payload = await performWebSearch(
			{ query: 'default synthesis behavior' },
			fetchFn as typeof fetch
		);

		expect(payload.answer).toBeUndefined();
		expect(payload.info).toMatchObject({
			adapter_version: 'tavily-v1',
			search_depth: 'advanced',
			max_results: 4,
			include_answer: false,
			cache_status: 'miss'
		});
	});

	it('deduplicates normalized queries in the short-lived cache', async () => {
		const fetchFn = vi.fn(
			async () =>
				new Response(JSON.stringify({ usage: { credits: 2 }, results: [] }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
		);

		const first = await performWebSearch(
			{ query: '  Normalized   Cache Query  ' },
			fetchFn as typeof fetch
		);
		const second = await performWebSearch(
			{ query: 'normalized cache query' },
			fetchFn as typeof fetch
		);

		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(first.info.cache_status).toBe('miss');
		expect(first.info.provider_credits).toBe(2);
		expect(second.info.cache_status).toBe('hit');
		expect(second.info.provider_credits).toBeUndefined();
	});

	it('uses the durable discovery cache without dispatching Tavily', async () => {
		const entry = createNativeSearchDiscoveryCacheEntry(
			{
				query: 'durable web cache unique',
				results: [
					{
						title: 'Durable result',
						url: 'https://example.com/',
						snippet: 'Stored evidence'
					}
				],
				diagnostics: {
					provider: 'tavily',
					adapterVersion: 'tavily-v1',
					providerRequestId: 'durable-request',
					usage: { credits: 2 }
				}
			},
			'2026-08-02T12:00:00.000Z'
		);
		const durableStore: NativeSearchDurableCacheStore<NativeSearchDiscoveryCacheEntry> = {
			probe: vi.fn(async () => true),
			claim: vi.fn(async () => ({ state: 'hit' as const, value: entry })),
			complete: vi.fn(),
			release: vi.fn(),
			invalidate: vi.fn()
		};
		const fetchFn = vi.fn();

		const payload = await performWebSearch(
			{ query: 'durable web cache unique' },
			fetchFn as typeof fetch,
			durableStore
		);

		expect(fetchFn).not.toHaveBeenCalled();
		expect(payload.results[0]?.snippet).toBe('Stored evidence');
		expect(payload.info).toMatchObject({
			cache_status: 'hit',
			fetched_at: '2026-08-02T12:00:00.000Z',
			provider_request_id: 'durable-request'
		});
		expect(payload.info.provider_credits).toBeUndefined();
	});

	it('rejects empty queries', async () => {
		await expect(performWebSearch({ query: '  ' }, stubTavilyFetch('x'))).rejects.toThrow(
			'query is required'
		);
	});
});
