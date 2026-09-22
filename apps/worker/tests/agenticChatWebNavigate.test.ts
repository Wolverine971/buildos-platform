// apps/worker/tests/agenticChatWebNavigate.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { JevDecider } from '@buildos/smart-llm';
import { PoliteWebFetcher, type NavigatorPage } from '@buildos/shared-agent-ops/web/navigation';
import {
	buildJevPageDecisionRequest,
	createJevPageDecider,
	createWorkerWebNavigatePort,
	describeWebNavigationStep,
	normalizeWebNavigateArguments,
	parseJevPageDecision
} from '../src/workers/agentic-chat/tools/web-navigate';

function pageWithLinks(count: number, text = 'Chamber events'): NavigatorPage {
	return {
		requestedUrl: 'https://site.test/',
		url: 'https://site.test/',
		title: 'Home',
		text,
		links: Array.from({ length: count }, (_, i) => ({
			url: `https://site.test/p${i}`,
			label: `Page ${i}`,
			context: i === 3 ? 'Networking Lunch Italia’s Corner' : '',
			sameSite: true
		})),
		source: 'fetch',
		fetchMs: 12
	};
}

describe('Jev page decision request', () => {
	it('splits long link lists into Choice questions and maps answers back to URLs', () => {
		const built = buildJevPageDecisionRequest({
			goal: 'Find the lunch details',
			page: pageWithLinks(450),
			passages: ['a', 'b'],
			visited: []
		});
		expect(built.choiceQuestions).toEqual(['next_link_0', 'next_link_1', 'next_link_2']);
		expect(built.passageQuestions).toEqual(['passage_0', 'passage_1']);
		const first = built.questions.next_link_0 as { criteria: Record<string, string> };
		expect(Object.keys(first.criteria)).toHaveLength(201); // 200 links + none
		expect(first.criteria.l3).toContain('(after: "…Networking Lunch Italia’s Corner")');
		// The model-visible state carries no URLs beyond the current page's own.
		expect(JSON.stringify(built.state)).not.toContain('/p449');

		const decision = parseJevPageDecision(
			built,
			{
				page_has_answer: { type: 'noul', noul: 0.12 },
				needs_browser: { type: 'noul', noul: 0.03 },
				passage_0: { type: 'noul', noul: 0.8 },
				passage_1: { type: 'noul', noul: 0.1 },
				next_link_0: { type: 'choice', probabilities: { none: 0.1, l3: 0.7, l9: 0.2 } },
				next_link_1: {
					type: 'choice',
					probabilities: { none: 0.05, l250: 0.9, bogus: 0.99 }
				},
				next_link_2: { type: 'choice', probabilities: { none: 1 } }
			},
			{ durationMs: 310, costUsd: 0.0002 }
		);
		expect(decision.links.map((l) => [l.url, l.probability])).toEqual([
			['https://site.test/p250', 0.9],
			['https://site.test/p3', 0.7],
			['https://site.test/p9', 0.2]
		]);
		expect(decision.passageRelevance).toEqual([0.8, 0.1]);
		expect(decision.answerProbability).toBe(0.12);
	});

	it('omits the Choice question for a page with no links and surfaces Jev failures', async () => {
		const built = buildJevPageDecisionRequest({
			goal: 'g',
			page: pageWithLinks(0),
			passages: ['x'],
			visited: []
		});
		expect(Object.keys(built.questions)).toEqual(['page_has_answer', 'needs_browser']);
		const jev = {
			decide: vi.fn(async () => ({ ok: false, error: 'jev_timeout', receipt: {} }))
		};
		await expect(
			createJevPageDecider(jev as unknown as JevDecider, { operationType: 't' })({
				goal: 'g',
				page: pageWithLinks(1),
				passages: ['x'],
				visited: []
			})
		).rejects.toThrow('jev_timeout');
	});
});

describe('trail lines', () => {
	it('reads like a live navigation log', () => {
		expect(
			describeWebNavigationStep({
				kind: 'decided',
				page: 1,
				url: 'https://business.naaccc.com/event-calendar',
				answer: 0.04,
				next: {
					label: 'Networking Lunch Italia’s Corner',
					url: 'https://x/y',
					probability: 0.91
				},
				alternatives: [{ label: 'Register', probability: 0.05 }],
				ms: 312
			}).message
		).toBe(
			'Jev: not here (4%) → "Networking Lunch Italia’s Corner" (91%), else "Register" 5% · 312ms'
		);
		expect(
			describeWebNavigationStep({
				kind: 'opened',
				page: 2,
				url: 'https://www.aacounty.org/solicitations?x=1',
				links: 38,
				ms: 240,
				source: 'tavily_extract'
			}).message
		).toBe('Opened aacounty.org/solicitations?x=1 · 38 links · 240ms · via Tavily');
		expect(
			describeWebNavigationStep({
				kind: 'load_failed',
				page: 3,
				url: 'https://emma.maryland.gov/',
				reason: 'robots',
				detail: ''
			}).message
		).toBe("Couldn't open emma.maryland.gov: robots.txt asks bots to skip it");
	});
});

describe('normalizeWebNavigateArguments', () => {
	it('clamps the page budget and rejects credentials or missing goals', () => {
		expect(
			normalizeWebNavigateArguments({
				url: 'https://a.test/x#frag',
				goal: '  bids   due\nsoon ',
				max_pages: 50
			})
		).toEqual({ url: 'https://a.test/x', goal: 'bids due soon', max_pages: 8 });
		expect(() =>
			normalizeWebNavigateArguments({ url: 'https://u:p@a.test/', goal: 'g' })
		).toThrow();
		expect(() =>
			normalizeWebNavigateArguments({ url: 'https://a.test/', goal: ' ' })
		).toThrow();
	});
});

describe('createWorkerWebNavigatePort', () => {
	it('navigates a fake site end to end: politely fetched pages, Jev choices, compact payload', async () => {
		const site: Record<string, string> = {
			'https://chamber.test/robots.txt': 'User-agent: *\nDisallow: /admin',
			'https://chamber.test/events': `<html><head><title>Events</title></head><body>
				<nav><a href="/admin">Admin</a><a href="/">Home</a></nav>
				<main><h1>Chamber Event Calendar</h1><p>${'Upcoming member events. '.repeat(12)}</p>
				<a href="/events/lunch-1874154">Networking Lunch Italia's Corner</a></main></body></html>`,
			'https://chamber.test/events/lunch-1874154': `<html><head><title>Networking Lunch</title></head><body><main>
				<h1>Networking Lunch</h1><p>${'Thursday Sept 24, 11:30 AM at Italia’s Corner, 7400 Ritchie Hwy, Glen Burnie. '.repeat(4)}</p></main></body></html>`
		};
		const fetchFn = vi.fn(async (input: string | URL | Request) => {
			const body = site[String(input)];
			return body === undefined
				? new Response('missing', { status: 404 })
				: new Response(body, {
						status: 200,
						headers: {
							'content-type': String(input).endsWith('.txt')
								? 'text/plain'
								: 'text/html'
						}
					});
		});
		const fetcher = new PoliteWebFetcher({
			userAgent: 'BuildOS-AgentRun/1.0',
			fetchFn: fetchFn as unknown as typeof fetch,
			dnsLookup: async () => [{ address: '93.184.216.34', family: 4 }],
			sleep: async () => undefined
		});
		const questionsSeen: string[][] = [];
		const jev: JevDecider = {
			decide: vi.fn(async (req: { state: unknown; questions: Record<string, unknown> }) => {
				questionsSeen.push(Object.keys(req.questions));
				const state = req.state as { current_page: { url: string } };
				const onEvent = state.current_page.url.endsWith('/lunch-1874154');
				const choice = req.questions.next_link_0 as
					| { criteria: Record<string, string> }
					| undefined;
				const lunchKey = Object.entries(choice?.criteria ?? {}).find(([, d]) =>
					d.includes('Networking Lunch')
				)?.[0];
				return {
					ok: true,
					answers: {
						page_has_answer: { type: 'noul', noul: onEvent ? 0.95 : 0.1 },
						needs_browser: { type: 'noul', noul: 0.02 },
						...(choice
							? {
									next_link_0: {
										type: 'choice',
										choice: lunchKey ?? 'none',
										probabilities: {
											none: 0.05,
											...(lunchKey ? { [lunchKey]: 0.9 } : {})
										},
										confidence: 0.9
									}
								}
							: {})
					},
					receipt: { durationMs: 300, costUsd: 0.0002 },
					rawResponse: {}
				} as never;
			})
		};
		const steps: string[] = [];
		const port = createWorkerWebNavigatePort({ jev, fetcher, tavilyApiKey: null });
		const payload = await port.navigate(
			{
				url: 'https://chamber.test/events',
				goal: 'Date, time and location of the Italia’s Corner lunch'
			},
			{
				onStep: (s) => steps.push(describeWebNavigationStep(s).message),
				usage: { operationType: 'test' }
			}
		);
		expect(payload.outcome).toBe('found');
		expect(payload.answer_page?.url).toBe('https://chamber.test/events/lunch-1874154');
		expect(payload.answer_page?.content).toContain('7400 Ritchie Hwy');
		expect(payload.path.map((p) => p.clicked?.label)).toEqual([
			"Networking Lunch Italia's Corner",
			undefined
		]);
		expect(payload.visited_urls).toEqual(
			expect.arrayContaining([
				'https://chamber.test/events',
				'https://chamber.test/events/lunch-1874154'
			])
		);
		expect(payload.stats).toMatchObject({
			pages_opened: 2,
			decisions: 2,
			escalations: 0,
			cost_usd: 0.0004
		});
		expect(steps[0]).toMatch(/^Opened chamber\.test\/events · \d+ links/);
		expect(steps.at(-1)).toMatch(/^Found it: Networking Lunch · 2 pages/);
		// robots.txt was fetched once; /admin was never requested.
		expect(fetchFn.mock.calls.map(([u]) => String(u))).toEqual([
			'https://chamber.test/robots.txt',
			'https://chamber.test/events',
			'https://chamber.test/events/lunch-1874154'
		]);
	});
});
