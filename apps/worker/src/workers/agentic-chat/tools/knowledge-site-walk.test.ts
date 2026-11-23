// apps/worker/src/workers/agentic-chat/tools/knowledge-site-walk.test.ts
//
// Walking a site in guided search: the real navigation loop with a fake page loader and a
// fake decision model. No network.
//
// What must hold:
//   - only links that stay on the site are ever offered to the decision model, so a page
//     cannot send the walk somewhere else
//   - every page opened comes back (they all go to the reading model), each with how likely
//     it holds what was wanted, and the decisions' cost is reported
//   - a walk that runs out of time, or whose decision model fails, keeps what it opened
//   - a stopped turn stops the walk
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
	NavigatorDecision,
	NavigatorDecisionRequest,
	NavigatorPage
} from '@buildos/shared-agent-ops/web/navigation';
import { SITE_WALK_MIN_LINK_PROBABILITY, createKnowledgeSiteWalker } from './knowledge-site-walk';

const HOME = 'https://acme.example/';
const TEAM = 'https://acme.example/team';
const BLOG = 'https://acme.example/blog';
const ELSEWHERE = 'https://evil.example/leadership';
const TEXT = 'Readable page text. '.repeat(20);

function link(url: string, sameSite: boolean) {
	return { url, label: url, context: '', sameSite };
}

const SITE: Record<string, NavigatorPage> = {
	[HOME]: {
		requestedUrl: HOME,
		url: HOME,
		title: 'Acme',
		text: TEXT,
		links: [link(TEAM, true), link(BLOG, true), link(ELSEWHERE, false)],
		source: 'fetch',
		fetchMs: 5
	},
	[TEAM]: {
		requestedUrl: TEAM,
		url: TEAM,
		title: 'Our team',
		text: TEXT,
		links: [link(HOME, true)],
		source: 'fetch',
		fetchMs: 5
	},
	[BLOG]: {
		requestedUrl: BLOG,
		url: BLOG,
		title: 'Blog',
		text: TEXT,
		links: [],
		source: 'fetch',
		fetchMs: 5
	}
};

function harness(
	decide: (request: NavigatorDecisionRequest) => Partial<NavigatorDecision> | Promise<never>,
	loadPage?: (url: string, signal?: AbortSignal) => Promise<NavigatorPage>
) {
	const loaded: string[] = [];
	const asked: NavigatorDecisionRequest[] = [];
	const walk = createKnowledgeSiteWalker({
		jev: { decide: () => Promise.resolve({ ok: false, error: 'unused' }) } as never,
		loadPage:
			loadPage ??
			((url) => {
				loaded.push(url);
				const page = SITE[url];
				if (!page) return Promise.reject(new Error(`not found: ${url}`));
				return Promise.resolve(page);
			}),
		decide: async (request) => {
			asked.push(request);
			const answer = await decide(request);
			return { answerProbability: 0, links: [], latencyMs: 1, costUsd: 0.0002, ...answer };
		}
	});
	const input = {
		startUrl: HOME,
		goal: 'Who runs Acme',
		maxPages: 3,
		timeBudgetMs: 5_000,
		usage: { userId: 'u1' }
	};
	return { walk, input, loaded, asked };
}

afterEach(() => vi.useRealTimers());

describe('walking a site', () => {
	it('offers only links on the same site, follows the likeliest, and returns every page it opened', async () => {
		const h = harness((request) =>
			request.page.url === HOME
				? {
						answerProbability: 0.1,
						// Even if the decision model were steered to another site, that link
						// was never among its options and is not followed.
						links: [
							{ url: ELSEWHERE, probability: 0.99 },
							{ url: TEAM, probability: 0.8 },
							{ url: BLOG, probability: SITE_WALK_MIN_LINK_PROBABILITY - 0.01 }
						]
					}
				: { answerProbability: 0.9 }
		);
		const result = await h.walk(h.input);
		expect(h.asked[0]!.page.links.map((l) => l.url)).toEqual([TEAM, BLOG]);
		expect(h.loaded).toEqual([HOME, TEAM]);
		expect(result.pages.map((page) => [page.url, page.title, page.answer])).toEqual([
			[HOME, 'Acme', 0.1],
			[TEAM, 'Our team', 0.9]
		]);
		expect(result.pages[1]!.text).toBe(TEXT);
		expect(result.decisions).toBe(2);
		expect(result.costUsd).toBeCloseTo(0.0004, 6);
	});

	it('keeps going past a page that does not hold what is wanted, up to its page limit', async () => {
		const h = harness((request) =>
			request.page.url === HOME
				? {
						answerProbability: 0.1,
						links: [
							{ url: BLOG, probability: 0.5 },
							{ url: TEAM, probability: 0.4 }
						]
					}
				: { answerProbability: 0.2 }
		);
		const result = await h.walk({ ...h.input, maxPages: 3 });
		expect(result.pages.map((page) => page.url)).toEqual([HOME, BLOG, TEAM]);
	});

	it('keeps the pages it opened when the decision model fails', async () => {
		const h = harness(() => Promise.reject(new Error('decision model unavailable')));
		const result = await h.walk(h.input);
		expect(result.pages.map((page) => [page.url, page.answer])).toEqual([[HOME, null]]);
		expect(result.decisions).toBe(0);
	});

	it('is cut off when a page hangs past its time, keeping what it had', async () => {
		vi.useFakeTimers();
		const h = harness(
			() => ({ answerProbability: 0.1, links: [{ url: TEAM, probability: 0.9 }] }),
			(url, signal) =>
				url === HOME
					? Promise.resolve(SITE[HOME]!)
					: new Promise((_, reject) =>
							signal?.addEventListener('abort', () => reject(new Error('aborted')))
						)
		);
		const pending = h.walk({ ...h.input, timeBudgetMs: 1_000 });
		await vi.advanceTimersByTimeAsync(4_000);
		const result = await pending;
		expect(result.pages.map((page) => page.url)).toEqual([HOME]);
	});

	it('stops when the turn is stopped', async () => {
		const stop = new AbortController();
		const h = harness(() => {
			stop.abort(new Error('turn stopped'));
			return { answerProbability: 0.1, links: [{ url: TEAM, probability: 0.9 }] };
		});
		await expect(h.walk({ ...h.input, signal: stop.signal })).rejects.toThrow();
		expect(h.loaded).toEqual([HOME]);
	});
});
