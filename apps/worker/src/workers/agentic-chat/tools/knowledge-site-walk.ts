// apps/worker/src/workers/agentic-chat/tools/knowledge-site-walk.ts
//
// Guided search: walking a site (DJ, 2026-11-22).
//
// A search result is one page. The people who run a company are usually one click further in
// (Team, About, Leadership, Contact), on a page the search never returned. So an outside hop
// walks the site: code opens a page (free, polite: robots.txt and spacing per host) and lists
// its links; the decision model (Jev) answers typed questions about it: does this page
// already hold what is wanted, and which link gets closer. Code follows only links copied
// from the page, and only ones that stay on the same site.
//
// What Jev decides here is where to click next, over a page's own links. It does not decide
// which search results get read: every page a walk opens is handed to the reading model on
// top of everything the searches returned. A walk only ever adds pages.
//
// The loop itself is the one behind `web_navigate` (measured on 20 real sites,
// docs/research/web-navigation-2026-09-22: link picks nearly always right, 0.3 s a decision).
import type { JevDecider, JevUsageContext } from '@buildos/smart-llm';
import {
	type NavigatorDecision,
	type NavigatorDecisionRequest,
	type NavigatorPage,
	navigateWeb
} from '@buildos/shared-agent-ops/web/navigation';
import {
	WEB_NAVIGATE_MAX_GOAL_CHARS,
	createJevPageDecider,
	createPoliteWebPageLoader,
	sharedPoliteWebFetcher
} from './web-navigate';

export const KNOWLEDGE_SITE_WALK_OPERATION = 'knowledge_explore_site_walk';
/**
 * A link is followed only when the decision model gives it at least this much. Its right
 * clicks measured 36–99%; below this it is guessing, and a guess costs a second of the hop.
 */
export const SITE_WALK_MIN_LINK_PROBABILITY = 0.15;
/** After its time is up a walk gets this long to finish the page it is on, then is cut off. */
const SITE_WALK_GRACE_MS = 2_500;

export interface SiteWalkPage {
	/** Final address after redirects. */
	url: string;
	requestedUrl: string;
	title: string | null;
	text: string;
	/** How likely the page holds what was wanted; null when it was opened but never judged. */
	answer: number | null;
}

export interface SiteWalkResult {
	/** Every page opened, in the order opened (the start page first). */
	pages: SiteWalkPage[];
	decisions: number;
	costUsd: number;
}

export interface SiteWalkInput {
	startUrl: string;
	/** What is wanted, in plain words. */
	goal: string;
	maxPages: number;
	timeBudgetMs: number;
	signal?: AbortSignal;
	usage: Omit<JevUsageContext, 'operationType'>;
}

export type KnowledgeSiteWalker = (input: SiteWalkInput) => Promise<SiteWalkResult>;

export function createKnowledgeSiteWalker(options: {
	jev: JevDecider;
	/** Opens one page and lists its links. Injectable for tests. */
	loadPage?: (url: string, signal?: AbortSignal) => Promise<NavigatorPage>;
	/** Judges one page. Injectable for tests; production asks the decision model. */
	decide?: (
		request: NavigatorDecisionRequest,
		signal?: AbortSignal
	) => Promise<NavigatorDecision>;
}): KnowledgeSiteWalker {
	const loadPage = options.loadPage ?? createPoliteWebPageLoader(sharedPoliteWebFetcher());
	return async (input) => {
		const opened = new Map<string, SiteWalkPage>();
		let decisions = 0;
		let costUsd = 0;
		const decide =
			options.decide ??
			createJevPageDecider(options.jev, {
				...input.usage,
				operationType: KNOWLEDGE_SITE_WALK_OPERATION
			});

		const controller = new AbortController();
		const onAbort = () => controller.abort();
		input.signal?.addEventListener('abort', onAbort, { once: true });
		if (input.signal?.aborted) controller.abort();
		const timer = setTimeout(
			() => controller.abort(),
			Math.max(0, input.timeBudgetMs) + SITE_WALK_GRACE_MS
		);
		try {
			await navigateWeb({
				startUrl: input.startUrl,
				goal: input.goal.replace(/\s+/g, ' ').trim().slice(0, WEB_NAVIGATE_MAX_GOAL_CHARS),
				maxPages: input.maxPages,
				timeBudgetMs: input.timeBudgetMs,
				minLinkProbability: SITE_WALK_MIN_LINK_PROBABILITY,
				signal: controller.signal,
				// No paid browser tier: a site a plain fetch cannot read is left to what the
				// searches returned.
				loadPage: async (url, signal) => {
					const page = await loadPage(url, signal);
					opened.set(page.url, {
						url: page.url,
						requestedUrl: page.requestedUrl,
						title: page.title ?? null,
						text: page.text,
						answer: null
					});
					// Only links that stay on this site are ever offered, so only they can be
					// followed.
					return { ...page, links: page.links.filter((link) => link.sameSite) };
				},
				decide: async (request, signal) => {
					const decision = await decide(request, signal);
					decisions++;
					costUsd += decision.costUsd;
					const page = opened.get(request.page.url);
					if (page) page.answer = decision.answerProbability;
					return decision;
				}
			});
		} catch (error) {
			// The turn was stopped: that is the caller's to handle. Out of time, or a page
			// would not load: keep what was opened.
			if (input.signal?.aborted) throw error;
		} finally {
			clearTimeout(timer);
			input.signal?.removeEventListener('abort', onAbort);
		}
		return { pages: [...opened.values()], decisions, costUsd };
	};
}
