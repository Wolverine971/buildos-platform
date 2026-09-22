// packages/shared-agent-ops/src/web/web-navigator.ts
//
// Goal-directed link navigation. Code loads pages and follows links; an
// injected decider (Jev in production) judges each page: does it already answer
// the goal, which of its links gets closer, does it need a real browser, and
// which passages matter. Every candidate URL is copied verbatim from a loaded
// page, so no model ever authors a URL. Search is best-first: a weak branch is
// abandoned for the next most probable unvisited link.
//
// Measured on 20 real tasks (docs/research/web-navigation-2026-09-22): Jev
// decisions p50 0.30 s vs 2.9 s for a generative model, equal accuracy once the
// best page seen is returned when no page clears the answer threshold.
import type { PageLink } from './page-reader';

export interface NavigatorPage {
	requestedUrl: string;
	/** Final URL after redirects. */
	url: string;
	title?: string;
	text: string;
	links: PageLink[];
	source: 'fetch' | 'tavily_extract';
	fetchMs: number;
	/** Paid escalation cost, when source is not a plain fetch. */
	costUsd?: number;
}

export type NavigatorLoadFailureReason =
	| 'robots'
	| 'blocked'
	| 'not_found'
	| 'network'
	| 'unsupported';

export class NavigatorLoadError extends Error {
	constructor(
		readonly reason: NavigatorLoadFailureReason,
		message: string,
		readonly status?: number
	) {
		super(message);
		this.name = 'NavigatorLoadError';
	}
}

export interface NavigatorDecision {
	/** Probability the page text itself states everything the goal asks for. */
	answerProbability: number;
	/** Probability the main content is missing (needs JavaScript, login, or a bot check). */
	needsBrowserProbability?: number;
	/** Candidate links, best first. Never includes "none". */
	links: { url: string; probability: number }[];
	/** Relevance of each passage from splitNavigatorPassages(page.text). */
	passageRelevance?: number[];
	latencyMs: number;
	costUsd: number;
}

export interface NavigatorDecisionRequest {
	goal: string;
	page: NavigatorPage;
	passages: string[];
	visited: { url: string; title?: string }[];
}

export type WebNavigationStep =
	| {
			kind: 'opened';
			page: number;
			url: string;
			title?: string;
			source: NavigatorPage['source'];
			links: number;
			ms: number;
	  }
	| {
			kind: 'load_failed';
			page: number;
			url: string;
			reason: NavigatorLoadFailureReason;
			detail: string;
	  }
	| { kind: 'escalating'; page: number; url: string; provider: 'tavily_extract'; why: string }
	| {
			kind: 'decided';
			page: number;
			url: string;
			answer: number;
			needsBrowser?: number;
			next?: { label: string; url: string; probability: number };
			alternatives: { label: string; probability: number }[];
			ms: number;
	  }
	| { kind: 'backtracking'; page: number; url: string; label: string; probability: number }
	| { kind: 'decision_failed'; page: number; url: string; detail: string }
	| {
			kind: 'finished';
			outcome: WebNavigationOutcome;
			url?: string;
			title?: string;
			answer?: number;
			pages: number;
			ms: number;
	  };

export type WebNavigationOutcome = 'found' | 'best_guess' | 'not_found';

export interface WebNavigationTrailEntry {
	url: string;
	requested_url: string;
	title?: string;
	source: NavigatorPage['source'];
	answer_probability?: number;
	needs_browser_probability?: number;
	chose?: { label: string; url: string; probability: number };
	link_count: number;
	fetch_ms: number;
	decision_ms?: number;
	error?: string;
}

export interface WebNavigationResult {
	outcome: WebNavigationOutcome;
	goal: string;
	start_url: string;
	page?: {
		url: string;
		title?: string;
		source: NavigatorPage['source'];
		answer_probability: number;
		/** Goal-relevant passages first (in page order), bounded by excerptChars. */
		excerpt: string;
		truncated: boolean;
	};
	trail: WebNavigationTrailEntry[];
	failures: { url: string; reason: NavigatorLoadFailureReason; detail: string }[];
	/** URLs of pages that actually loaded (requested and final), for the caller's capability ledger. */
	visited_urls: string[];
	pages_loaded: number;
	decisions: number;
	escalations: number;
	decision_ms: number;
	fetch_ms: number;
	elapsed_ms: number;
	decision_cost_usd: number;
	escalation_cost_usd: number;
}

export interface NavigateWebInput {
	startUrl: string;
	goal: string;
	maxPages: number;
	signal?: AbortSignal;
	loadPage(url: string, signal?: AbortSignal): Promise<NavigatorPage>;
	/** Paid fallback for pages a plain fetch cannot read. */
	renderPage?(url: string, signal?: AbortSignal): Promise<NavigatorPage>;
	decide(request: NavigatorDecisionRequest, signal?: AbortSignal): Promise<NavigatorDecision>;
	onStep?(step: WebNavigationStep): void;
	answerThreshold?: number;
	needsBrowserThreshold?: number;
	minLinkProbability?: number;
	/** Below this, the best page seen is not offered as a guess. */
	bestGuessFloor?: number;
	maxEscalations?: number;
	excerptChars?: number;
	/**
	 * Stop opening pages after this long and return the best page so far, so a
	 * slow site ends in a partial answer instead of the caller's hard timeout.
	 * Default 40 s (web tools get 60 s; one more fetch + decision fits after it).
	 */
	timeBudgetMs?: number;
	/** Skip a paid render when less than this remains of the budget. Default 15 s. */
	minRenderBudgetMs?: number;
	now?: () => number;
}

export const NAVIGATOR_PASSAGE_CHARS = 4_000;
export const NAVIGATOR_MAX_PASSAGES = 5;
const MIN_READABLE_CHARS = 200;
const MIN_PASSAGE_RELEVANCE = 0.2;

/** Stable passage split shared by the decider (questions) and the excerpt. */
export function splitNavigatorPassages(
	text: string,
	size = NAVIGATOR_PASSAGE_CHARS,
	max = NAVIGATOR_MAX_PASSAGES
): string[] {
	const passages: string[] = [];
	let rest = text.trim();
	while (rest && passages.length < max) {
		if (rest.length <= size) {
			passages.push(rest);
			break;
		}
		// Prefer a paragraph or line boundary in the last quarter of the window.
		const window = rest.slice(0, size);
		const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'));
		const end = cut > size * 0.75 ? cut : size;
		passages.push(rest.slice(0, end).trim());
		rest = rest.slice(end).trim();
	}
	return passages;
}

export function buildNavigatorExcerpt(
	text: string,
	relevance: readonly number[] | undefined,
	maxChars: number
): { excerpt: string; truncated: boolean } {
	const passages = splitNavigatorPassages(text);
	const covered = passages.reduce((sum, p) => sum + p.length, 0);
	if (!relevance || relevance.length !== passages.length) {
		const excerpt = text.slice(0, maxChars).trim();
		return { excerpt, truncated: text.trim().length > excerpt.length };
	}
	// Most relevant passages win the budget, then are shown in page order.
	const ranked = passages
		.map((passage, index) => ({ passage, index, score: relevance[index] ?? 0 }))
		.sort((a, b) => b.score - a.score || a.index - b.index);
	const chosen: typeof ranked = [];
	let used = 0;
	for (const item of ranked) {
		if (used >= maxChars) break;
		// Once something relevant is in, don't pad with passages judged irrelevant.
		if (chosen.length > 0 && item.score < MIN_PASSAGE_RELEVANCE) break;
		const take = item.passage.slice(0, maxChars - used);
		chosen.push({ ...item, passage: take });
		used += take.length;
	}
	chosen.sort((a, b) => a.index - b.index);
	const excerpt = chosen
		.map((c, i) =>
			i > 0 && c.index !== chosen[i - 1]!.index + 1 ? `…\n\n${c.passage}` : c.passage
		)
		.join('\n\n');
	return { excerpt, truncated: used < text.trim().length || covered < text.trim().length };
}

function describeLink(link: PageLink | undefined, url: string): string {
	return (
		link?.label ||
		(() => {
			try {
				const parsed = new URL(url);
				return `${parsed.hostname}${parsed.pathname}`;
			} catch {
				return url;
			}
		})()
	);
}

export async function navigateWeb(input: NavigateWebInput): Promise<WebNavigationResult> {
	const now = input.now ?? Date.now;
	const started = now();
	const answerThreshold = input.answerThreshold ?? 0.5;
	const needsBrowserThreshold = input.needsBrowserThreshold ?? 0.6;
	const minLinkProbability = input.minLinkProbability ?? 0.05;
	const bestGuessFloor = input.bestGuessFloor ?? 0.15;
	const maxEscalations = input.maxEscalations ?? 2;
	const maxPages = Math.max(1, Math.floor(input.maxPages));
	const emit = (step: WebNavigationStep) => {
		try {
			input.onStep?.(step);
		} catch {
			/* Progress reporting never changes navigation. */
		}
	};

	const visited = new Set<string>();
	const loaded = new Set<string>();
	const frontier: { url: string; label: string; probability: number }[] = [];
	const trail: WebNavigationTrailEntry[] = [];
	const failures: WebNavigationResult['failures'] = [];
	const decided: { page: NavigatorPage; decision: NavigatorDecision }[] = [];
	let found: { page: NavigatorPage; decision: NavigatorDecision } | null = null;
	let pagesLoaded = 0;
	let escalations = 0;
	let decisionMs = 0;
	let fetchMs = 0;
	let decisionCost = 0;
	let escalationCost = 0;
	let next: { url: string; label: string; probability: number } | null = {
		url: input.startUrl,
		label: 'start',
		probability: 1
	};
	let expected: string | null = input.startUrl;

	const timeBudgetMs = input.timeBudgetMs ?? 40_000;
	const minRenderBudgetMs = input.minRenderBudgetMs ?? 15_000;
	const remainingMs = () => timeBudgetMs - (now() - started);
	const escalate = async (
		url: string,
		pageNumber: number,
		why: string
	): Promise<NavigatorPage | null> => {
		if (!input.renderPage || escalations >= maxEscalations || remainingMs() < minRenderBudgetMs)
			return null;
		escalations += 1;
		emit({ kind: 'escalating', page: pageNumber, url, provider: 'tavily_extract', why });
		try {
			const rendered = await input.renderPage(url, input.signal);
			escalationCost += rendered.costUsd ?? 0;
			return rendered;
		} catch (error) {
			if (input.signal?.aborted) throw error;
			const detail = error instanceof Error ? error.message : String(error);
			failures.push({ url, reason: 'blocked', detail: `render failed: ${detail}` });
			emit({
				kind: 'load_failed',
				page: pageNumber,
				url,
				reason: 'blocked',
				detail: `render failed: ${detail}`
			});
			return null;
		}
	};

	while (next && pagesLoaded < maxPages && remainingMs() > 0) {
		input.signal?.throwIfAborted();
		const target: { url: string; label: string; probability: number } = next;
		next = null;
		visited.add(target.url);
		// Any page other than the one just chosen (including after a dead end) is a backtrack.
		if (pagesLoaded > 0 && target.url !== expected) {
			emit({
				kind: 'backtracking',
				page: pagesLoaded + 1,
				url: target.url,
				label: target.label,
				probability: target.probability
			});
		}
		pagesLoaded += 1;
		const pageNumber = pagesLoaded;
		let page: NavigatorPage | null = null;
		try {
			page = await input.loadPage(target.url, input.signal);
			fetchMs += page.fetchMs;
		} catch (error) {
			if (input.signal?.aborted) throw error;
			const reason = error instanceof NavigatorLoadError ? error.reason : 'network';
			const detail = error instanceof Error ? error.message : String(error);
			failures.push({ url: target.url, reason, detail });
			emit({ kind: 'load_failed', page: pageNumber, url: target.url, reason, detail });
			// Robots refusals are honored; missing pages are not worth paying for.
			if (reason === 'blocked' || reason === 'network') {
				page = await escalate(
					target.url,
					pageNumber,
					reason === 'blocked' ? 'site blocked a plain fetch' : 'fetch failed'
				);
			}
		}
		if (page && page.source === 'fetch' && page.text.length < MIN_READABLE_CHARS) {
			page =
				(await escalate(page.url, pageNumber, 'page had almost no readable text')) ?? page;
		}
		if (page) {
			visited.add(page.url);
			visited.add(page.requestedUrl);
			loaded.add(page.url);
			loaded.add(page.requestedUrl);
			emit({
				kind: 'opened',
				page: pageNumber,
				url: page.url,
				...(page.title ? { title: page.title } : {}),
				source: page.source,
				links: page.links.length,
				ms: page.fetchMs
			});
			let decision: NavigatorDecision | null = null;
			const decide = async (current: NavigatorPage) => {
				const result = await input.decide(
					{
						goal: input.goal,
						page: current,
						passages: splitNavigatorPassages(current.text),
						visited: trail.map((entry) => ({
							url: entry.url,
							...(entry.title ? { title: entry.title } : {})
						}))
					},
					input.signal
				);
				decisionMs += result.latencyMs;
				decisionCost += result.costUsd;
				return result;
			};
			try {
				decision = await decide(page);
				if (
					page.source === 'fetch' &&
					(decision.needsBrowserProbability ?? 0) >= needsBrowserThreshold &&
					decision.answerProbability < answerThreshold
				) {
					const rendered = await escalate(
						page.url,
						pageNumber,
						'main content needs a browser'
					);
					if (rendered) {
						page = rendered;
						visited.add(page.url);
						loaded.add(page.url);
						emit({
							kind: 'opened',
							page: pageNumber,
							url: page.url,
							...(page.title ? { title: page.title } : {}),
							source: page.source,
							links: page.links.length,
							ms: page.fetchMs
						});
						decision = await decide(page);
					}
				}
			} catch (error) {
				if (input.signal?.aborted) throw error;
				const detail = error instanceof Error ? error.message : String(error);
				emit({ kind: 'decision_failed', page: pageNumber, url: page.url, detail });
				trail.push({
					url: page.url,
					requested_url: page.requestedUrl,
					...(page.title ? { title: page.title } : {}),
					source: page.source,
					link_count: page.links.length,
					fetch_ms: page.fetchMs,
					error: `decision failed: ${detail}`
				});
				break;
			}
			const byUrl = new Map(page.links.map((link) => [link.url, link]));
			const candidates = decision.links.filter(
				(l) =>
					l.probability >= minLinkProbability && !visited.has(l.url) && byUrl.has(l.url)
			);
			const top = candidates[0];
			emit({
				kind: 'decided',
				page: pageNumber,
				url: page.url,
				answer: decision.answerProbability,
				...(decision.needsBrowserProbability === undefined
					? {}
					: { needsBrowser: decision.needsBrowserProbability }),
				...(top && decision.answerProbability < answerThreshold
					? {
							next: {
								label: describeLink(byUrl.get(top.url), top.url),
								url: top.url,
								probability: top.probability
							}
						}
					: {}),
				alternatives: candidates.slice(1, 3).map((l) => ({
					label: describeLink(byUrl.get(l.url), l.url),
					probability: l.probability
				})),
				ms: decision.latencyMs
			});
			trail.push({
				url: page.url,
				requested_url: page.requestedUrl,
				...(page.title ? { title: page.title } : {}),
				source: page.source,
				answer_probability: decision.answerProbability,
				...(decision.needsBrowserProbability === undefined
					? {}
					: { needs_browser_probability: decision.needsBrowserProbability }),
				...(top && decision.answerProbability < answerThreshold
					? {
							chose: {
								label: describeLink(byUrl.get(top.url), top.url),
								url: top.url,
								probability: top.probability
							}
						}
					: {}),
				link_count: page.links.length,
				fetch_ms: page.fetchMs,
				decision_ms: decision.latencyMs
			});
			decided.push({ page, decision });
			if (decision.answerProbability >= answerThreshold) {
				found = { page, decision };
				break;
			}
			for (const link of candidates) {
				if (!frontier.some((f) => f.url === link.url)) {
					frontier.push({
						url: link.url,
						label: describeLink(byUrl.get(link.url), link.url),
						probability: link.probability
					});
				} else {
					const existing = frontier.find((f) => f.url === link.url)!;
					existing.probability = Math.max(existing.probability, link.probability);
				}
			}
			expected = top?.url ?? null;
		} else {
			trail.push({
				url: target.url,
				requested_url: target.url,
				source: 'fetch',
				link_count: 0,
				fetch_ms: 0,
				error: failures.at(-1)?.detail ?? 'load failed'
			});
			expected = null;
		}
		frontier.sort((a, b) => b.probability - a.probability);
		while (frontier.length && visited.has(frontier[0]!.url)) frontier.shift();
		next = frontier.shift() ?? null;
	}

	const best =
		found ??
		decided.reduce<{ page: NavigatorPage; decision: NavigatorDecision } | null>(
			(acc, item) =>
				!acc || item.decision.answerProbability > acc.decision.answerProbability
					? item
					: acc,
			null
		);
	const outcome: WebNavigationOutcome = found
		? 'found'
		: best && best.decision.answerProbability >= bestGuessFloor
			? 'best_guess'
			: 'not_found';
	const chosen = outcome === 'not_found' ? null : best;
	const excerpt = chosen
		? buildNavigatorExcerpt(
				chosen.page.text,
				chosen.decision.passageRelevance,
				input.excerptChars ?? 6_000
			)
		: null;
	const elapsed = now() - started;
	emit({
		kind: 'finished',
		outcome,
		...(chosen ? { url: chosen.page.url, answer: chosen.decision.answerProbability } : {}),
		...(chosen?.page.title ? { title: chosen.page.title } : {}),
		pages: pagesLoaded,
		ms: elapsed
	});
	return {
		outcome,
		goal: input.goal,
		start_url: input.startUrl,
		...(chosen && excerpt
			? {
					page: {
						url: chosen.page.url,
						...(chosen.page.title ? { title: chosen.page.title } : {}),
						source: chosen.page.source,
						answer_probability: chosen.decision.answerProbability,
						excerpt: excerpt.excerpt,
						truncated: excerpt.truncated
					}
				}
			: {}),
		trail,
		failures,
		visited_urls: [...loaded],
		pages_loaded: pagesLoaded,
		decisions: decided.length,
		escalations,
		decision_ms: decisionMs,
		fetch_ms: fetchMs,
		elapsed_ms: elapsed,
		decision_cost_usd: decisionCost,
		escalation_cost_usd: escalationCost
	};
}
