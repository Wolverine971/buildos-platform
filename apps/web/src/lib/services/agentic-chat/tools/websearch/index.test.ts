// apps/web/src/lib/services/agentic-chat/tools/websearch/index.test.ts
import { describe, expect, it } from 'vitest';
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
		const payload = await performWebSearch({ query: 'test query' }, stubTavilyFetch(content));

		const snippet = payload.results[0]?.snippet ?? '';
		expect(snippet.length).toBeGreaterThan(1500);
		expect(snippet.length).toBeLessThanOrEqual(1603); // cap + ellipsis
	});

	it('passes short content through untruncated', async () => {
		const payload = await performWebSearch(
			{ query: 'test query' },
			stubTavilyFetch('short evidence')
		);

		expect(payload.results[0]?.snippet).toBe('short evidence');
	});

	it('rejects empty queries', async () => {
		await expect(performWebSearch({ query: '  ' }, stubTavilyFetch('x'))).rejects.toThrow(
			'query is required'
		);
	});
});
