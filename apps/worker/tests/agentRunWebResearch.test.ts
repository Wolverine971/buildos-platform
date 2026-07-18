// apps/worker/tests/agentRunWebResearch.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createAgentRunWebResearchPort } from '../src/workers/agent-run/webResearchPort';

const NOW = new Date('2026-07-18T12:00:00.000Z');

describe('Agent Run web research port', () => {
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
		const fetchFn = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
			const request = JSON.parse(String(init?.body)) as Record<string, unknown>;
			expect(request).toMatchObject({
				query: 'BuildOS research',
				api_key: 'test-key',
				search_depth: 'advanced',
				max_results: 2,
				include_raw_content: false
			});
			return new Response(
				JSON.stringify({
					answer: 'A'.repeat(2_500),
					results: [
						{
							title: 'Primary source',
							url: 'https://example.com/research',
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
			now: () => NOW
		});

		const result = (await port.search!({
			query: '  BuildOS research  ',
			max_results: 2
		})) as {
			answer: string;
			results: Array<{ title: string; url: string; snippet: string }>;
			security_notice: string;
			info: { fetched_at: string };
		};

		expect(result.answer.length).toBeLessThanOrEqual(2_003);
		expect(result.results[0]).toMatchObject({
			title: 'Primary source',
			url: 'https://example.com/research'
		});
		expect(result.results[0]?.snippet.length).toBeLessThanOrEqual(1_603);
		expect(result.security_notice).toContain('untrusted');
		expect(result.info.fetched_at).toBe(NOW.toISOString());
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
