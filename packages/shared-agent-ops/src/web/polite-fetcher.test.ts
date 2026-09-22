// packages/shared-agent-ops/src/web/polite-fetcher.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	isAllowedByRobots,
	parseRobotsTxt,
	PoliteWebFetcher,
	RobotsDisallowedError
} from './polite-fetcher';

const ROBOTS = `User-agent: GPTBot
Disallow: /

User-agent: *
Crawl-delay: 2
Disallow: /*/tree/
Disallow: /search
Allow: /search/about$
`;

describe('robots.txt', () => {
	it('selects the * group when no group names our token', () => {
		const rules = parseRobotsTxt(ROBOTS, 'BuildOS-AgentRun');
		expect(rules.crawlDelaySeconds).toBe(2);
		expect(isAllowedByRobots(rules, '/sveltejs/svelte/tree/main')).toBe(false);
		expect(isAllowedByRobots(rules, '/search?q=x')).toBe(false);
		expect(isAllowedByRobots(rules, '/search/about')).toBe(true);
		expect(isAllowedByRobots(rules, '/pricing')).toBe(true);
	});

	it('prefers a group naming our product token', () => {
		const rules = parseRobotsTxt(
			'User-agent: buildos\nDisallow: /private\n\nUser-agent: *\nDisallow: /',
			'BuildOS-AgentRun'
		);
		expect(isAllowedByRobots(rules, '/public')).toBe(true);
		expect(isAllowedByRobots(rules, '/private/x')).toBe(false);
	});
});

function html(body: string) {
	return new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
}

describe('PoliteWebFetcher', () => {
	const dnsLookup = async () => [{ address: '93.184.216.34', family: 4 }];

	it('refuses robots-disallowed URLs and spaces same-host requests by crawl-delay', async () => {
		let clock = 0;
		const sleeps: number[] = [];
		const fetchFn = vi.fn(async (input: string | URL | Request) =>
			String(input).endsWith('/robots.txt') ? new Response(ROBOTS) : html('<p>ok</p>')
		);
		const fetcher = new PoliteWebFetcher({
			userAgent: 'BuildOS-AgentRun/1.0',
			fetchFn: fetchFn as unknown as typeof fetch,
			dnsLookup,
			now: () => clock,
			sleep: async (ms) => {
				sleeps.push(ms);
				clock += ms;
			}
		});

		await expect(fetcher.fetch('https://example.com/search?q=1')).rejects.toBeInstanceOf(
			RobotsDisallowedError
		);
		await fetcher.fetch('https://example.com/a');
		await fetcher.fetch('https://example.com/b');
		// robots.txt went out at t=0 before its crawl-delay was known (1 s floor);
		// /a waits that 1 s, then /b waits the site's 2 s crawl-delay.
		expect(sleeps).toEqual([1000, 2000]);
		expect(fetcher.isKnownDisallowed('https://example.com/x/tree/y')).toBe(true);
		expect(fetchFn.mock.calls.filter(([u]) => String(u).endsWith('/robots.txt'))).toHaveLength(
			1
		);
	});

	it('treats a missing robots.txt as allowing everything', async () => {
		const fetchFn = vi.fn(async (input: string | URL | Request) =>
			String(input).endsWith('/robots.txt')
				? new Response('nope', { status: 404 })
				: html('<p>ok</p>')
		);
		const fetcher = new PoliteWebFetcher({
			userAgent: 'BuildOS-AgentRun/1.0',
			fetchFn: fetchFn as unknown as typeof fetch,
			dnsLookup,
			sleep: async () => undefined
		});
		expect(await fetcher.isAllowed('https://example.com/anything')).toBe(true);
	});
});
