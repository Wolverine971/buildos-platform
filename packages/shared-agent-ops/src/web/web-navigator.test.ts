// packages/shared-agent-ops/src/web/web-navigator.test.ts
import { describe, expect, it, vi } from 'vitest';
import { readTavilyMarkdown } from './tavily-extract';
import {
	buildNavigatorExcerpt,
	navigateWeb,
	NavigatorLoadError,
	splitNavigatorPassages,
	type NavigatorDecision,
	type NavigatorPage,
	type WebNavigationStep
} from './web-navigator';

function page(url: string, links: string[], text = 'x'.repeat(300)): NavigatorPage {
	return {
		requestedUrl: url,
		url,
		title: url.split('/').pop() || 'home',
		text,
		links: links.map((l) => ({
			url: l,
			label: l.split('/').pop()!,
			context: '',
			sameSite: true
		})),
		source: 'fetch',
		fetchMs: 10
	};
}

function decision(
	answer: number,
	links: [string, number][] = [],
	extra: Partial<NavigatorDecision> = {}
): NavigatorDecision {
	return {
		answerProbability: answer,
		links: links.map(([url, probability]) => ({ url, probability })),
		latencyMs: 5,
		costUsd: 0.0002,
		...extra
	};
}

const S = 'https://site.test';

describe('navigateWeb', () => {
	it('follows the best link to the answer and streams each step', async () => {
		const pages: Record<string, NavigatorPage> = {
			[`${S}/`]: page(`${S}/`, [`${S}/about`, `${S}/pricing`]),
			[`${S}/pricing`]: page(`${S}/pricing`, [])
		};
		const steps: WebNavigationStep[] = [];
		const result = await navigateWeb({
			startUrl: `${S}/`,
			goal: 'What does it cost?',
			maxPages: 5,
			loadPage: async (url) => pages[url]!,
			decide: async ({ page: p }) =>
				p.url.endsWith('/pricing')
					? decision(0.93)
					: decision(0.02, [
							[`${S}/pricing`, 0.9],
							[`${S}/about`, 0.08]
						]),
			onStep: (s) => steps.push(s)
		});
		expect(result.outcome).toBe('found');
		expect(result.page?.url).toBe(`${S}/pricing`);
		expect(result.trail.map((t) => t.chose?.url)).toEqual([`${S}/pricing`, undefined]);
		expect(result.decision_cost_usd).toBeCloseTo(0.0004);
		expect(steps.map((s) => s.kind)).toEqual([
			'opened',
			'decided',
			'opened',
			'decided',
			'finished'
		]);
		expect(result.visited_urls).toContain(`${S}/pricing`);
	});

	it('backtracks to the next most probable link and returns the best page seen', async () => {
		const pages: Record<string, NavigatorPage> = {
			[`${S}/`]: page(`${S}/`, [`${S}/a`, `${S}/b`]),
			[`${S}/a`]: page(`${S}/a`, []),
			[`${S}/b`]: page(`${S}/b`, [])
		};
		const answers: Record<string, NavigatorDecision> = {
			[`${S}/`]: decision(0.05, [
				[`${S}/a`, 0.6],
				[`${S}/b`, 0.35]
			]),
			[`${S}/a`]: decision(0.1),
			[`${S}/b`]: decision(0.4)
		};
		const steps: WebNavigationStep[] = [];
		const result = await navigateWeb({
			startUrl: `${S}/`,
			goal: 'g',
			maxPages: 5,
			loadPage: async (url) => pages[url]!,
			decide: async ({ page: p }) => answers[p.url]!,
			onStep: (s) => steps.push(s)
		});
		expect(steps.some((s) => s.kind === 'backtracking' && s.url === `${S}/b`)).toBe(true);
		expect(result.outcome).toBe('best_guess');
		expect(result.page?.url).toBe(`${S}/b`);
		expect(result.pages_loaded).toBe(3);
	});

	it('never follows a URL the decider invents', async () => {
		const loadPage = vi.fn(async (url: string) => page(url, [`${S}/real`]));
		const result = await navigateWeb({
			startUrl: `${S}/`,
			goal: 'g',
			maxPages: 5,
			loadPage,
			decide: async () => decision(0, [['https://evil.test/?q=secret', 0.99]])
		});
		expect(loadPage).toHaveBeenCalledTimes(1);
		expect(result.outcome).toBe('not_found');
		expect(result.page).toBeUndefined();
	});

	it('escalates blocked and empty pages but honors robots refusals', async () => {
		const renderPage = vi.fn(async (url: string) => ({
			...page(url, []),
			source: 'tavily_extract' as const,
			costUsd: 0.0032
		}));
		const loadPage = vi.fn(async (url: string) => {
			if (url.endsWith('/blocked')) throw new NavigatorLoadError('blocked', 'HTTP 403', 403);
			if (url.endsWith('/robots'))
				throw new NavigatorLoadError('robots', 'robots.txt disallows this URL');
			if (url.endsWith('/shell')) return page(url, [], 'Loading…');
			return page(url, [`${S}/robots`, `${S}/blocked`, `${S}/shell`]);
		});
		const result = await navigateWeb({
			startUrl: `${S}/`,
			goal: 'g',
			maxPages: 4,
			loadPage,
			renderPage,
			decide: async ({ page: p }) =>
				p.url === `${S}/`
					? decision(0, [
							[`${S}/robots`, 0.5],
							[`${S}/blocked`, 0.3],
							[`${S}/shell`, 0.2]
						])
					: decision(0.2)
		});
		expect(renderPage.mock.calls.map(([u]) => u)).toEqual([`${S}/blocked`, `${S}/shell`]);
		expect(result.failures.map((f) => f.reason)).toEqual(['robots', 'blocked']);
		expect(result.escalations).toBe(2);
		expect(result.escalation_cost_usd).toBeCloseTo(0.0064);
		expect(result.visited_urls).not.toContain(`${S}/robots`);
	});

	it('re-reads a page through the browser tier when the decider says content is missing', async () => {
		const renderPage = vi.fn(async (url: string) => ({
			...page(url, []),
			source: 'tavily_extract' as const
		}));
		const decide = vi
			.fn()
			.mockResolvedValueOnce(decision(0.01, [], { needsBrowserProbability: 0.9 }))
			.mockResolvedValueOnce(decision(0.8));
		const result = await navigateWeb({
			startUrl: `${S}/app`,
			goal: 'g',
			maxPages: 2,
			loadPage: async (url) => page(url, []),
			renderPage,
			decide
		});
		expect(renderPage).toHaveBeenCalledOnce();
		expect(result.outcome).toBe('found');
		expect(result.page?.source).toBe('tavily_extract');
		expect(result.decisions).toBe(1);
	});

	it('stops at the time budget with the best page so far and skips late paid renders', async () => {
		let clock = 0;
		const renderPage = vi.fn();
		const result = await navigateWeb({
			startUrl: `${S}/`,
			goal: 'g',
			maxPages: 8,
			timeBudgetMs: 40_000,
			now: () => clock,
			loadPage: async (url) => {
				clock += 30_000;
				if (url.endsWith('/slow')) throw new NavigatorLoadError('blocked', 'HTTP 403', 403);
				return page(url, [`${S}/slow`, `${S}/other`]);
			},
			renderPage,
			decide: async () =>
				decision(0.3, [
					[`${S}/slow`, 0.8],
					[`${S}/other`, 0.1]
				])
		});
		expect(result.pages_loaded).toBe(2);
		expect(renderPage).not.toHaveBeenCalled();
		expect(result.outcome).toBe('best_guess');
		expect(result.page?.url).toBe(`${S}/`);
	});

	it('ends with the best page so far when a decision fails', async () => {
		const result = await navigateWeb({
			startUrl: `${S}/`,
			goal: 'g',
			maxPages: 3,
			loadPage: async (url) => page(url, [`${S}/next`]),
			decide: vi
				.fn()
				.mockResolvedValueOnce(decision(0.3, [[`${S}/next`, 0.9]]))
				.mockRejectedValueOnce(new Error('jev_timeout'))
		});
		expect(result.outcome).toBe('best_guess');
		expect(result.trail.at(-1)?.error).toContain('jev_timeout');
	});
});

describe('passages and excerpts', () => {
	it('splits on line boundaries and keeps relevant passages in page order', () => {
		const text = ['A'.repeat(3500), 'B'.repeat(3500), 'C'.repeat(3500)].join('\n');
		const passages = splitNavigatorPassages(text);
		expect(passages.map((p) => p[0])).toEqual(['A', 'B', 'C']);
		const { excerpt, truncated } = buildNavigatorExcerpt(text, [0.05, 0.1, 0.9], 4000);
		expect(excerpt).toBe('C'.repeat(3500));
		expect(truncated).toBe(true);
		const pair = buildNavigatorExcerpt(text, [0.6, 0.05, 0.9], 8000).excerpt;
		expect(pair).toBe(`${'A'.repeat(3500)}\n\n…\n\n${'C'.repeat(3500)}`);
	});
});

describe('readTavilyMarkdown', () => {
	it('turns markdown links into page links and plain text', () => {
		const { text, links } = readTavilyMarkdown(
			'# Bids\n\nSee [Open Solicitations](/solicitations) or [portal](https://other.org/p "t").\n\n![logo](/l.png)',
			'https://www.aacounty.org/purchasing'
		);
		expect(text).toBe('# Bids\n\nSee Open Solicitations or portal.');
		expect(links.map((l) => [l.label, l.url, l.sameSite])).toEqual([
			['Open Solicitations', 'https://www.aacounty.org/solicitations', true],
			['portal', 'https://other.org/p', false]
		]);
	});
});
