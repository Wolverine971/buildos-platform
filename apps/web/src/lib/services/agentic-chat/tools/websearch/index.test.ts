// apps/web/src/lib/services/agentic-chat/tools/websearch/index.test.ts
import { describe, expect, it, vi } from 'vitest';
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
				include_answer: false
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
			search_depth: 'advanced',
			max_results: 4,
			include_answer: false,
			cache_status: 'miss'
		});
	});

	it('deduplicates normalized queries in the short-lived cache', async () => {
		const fetchFn = vi.fn(
			async () =>
				new Response(JSON.stringify({ results: [] }), {
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
		expect(second.info.cache_status).toBe('hit');
	});

	it('rejects empty queries', async () => {
		await expect(performWebSearch({ query: '  ' }, stubTavilyFetch('x'))).rejects.toThrow(
			'query is required'
		);
	});
});
