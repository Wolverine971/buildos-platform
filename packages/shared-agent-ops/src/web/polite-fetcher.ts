// packages/shared-agent-ops/src/web/polite-fetcher.ts
//
// Crawler etiquette for agent navigation: honor robots.txt (RFC 9309 subset)
// and space requests to one host. One instance should be shared per process so
// concurrent navigations to the same site queue behind each other.
import {
	fetchPublicUrl,
	type FetchPublicUrlOptions,
	type FetchPublicUrlResult
} from './safe-fetch';

export interface RobotsRules {
	allow: string[];
	disallow: string[];
	crawlDelaySeconds?: number;
}

/**
 * Select the group for our product token (e.g. "buildos-agentrun"), else `*`.
 * Consecutive User-agent lines share one group.
 */
export function parseRobotsTxt(body: string, productToken: string): RobotsRules {
	type Group = { agents: string[]; allow: string[]; disallow: string[]; delay?: number };
	const groups: Group[] = [];
	let current: Group | null = null;
	let lastWasAgent = false;
	for (const rawLine of body.split(/\r?\n/)) {
		const line = rawLine.replace(/#.*/, '').trim();
		const match = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
		if (!match) continue;
		const key = match[1]!.toLowerCase();
		const value = match[2]!.trim();
		if (key === 'user-agent') {
			if (!current || !lastWasAgent) {
				current = { agents: [], allow: [], disallow: [] };
				groups.push(current);
			}
			current.agents.push(value.toLowerCase());
			lastWasAgent = true;
			continue;
		}
		lastWasAgent = false;
		if (!current) continue;
		if (key === 'allow' && value) current.allow.push(value);
		else if (key === 'disallow' && value) current.disallow.push(value);
		else if (key === 'crawl-delay') {
			const seconds = Number.parseFloat(value);
			if (Number.isFinite(seconds) && seconds >= 0) current.delay = seconds;
		}
	}
	const token = productToken.toLowerCase();
	const ours = groups.filter((g) => g.agents.some((a) => a !== '*' && token.startsWith(a)));
	const chosen = ours.length ? ours : groups.filter((g) => g.agents.includes('*'));
	const delays = chosen.map((g) => g.delay).filter((d): d is number => d !== undefined);
	return {
		allow: chosen.flatMap((g) => g.allow),
		disallow: chosen.flatMap((g) => g.disallow),
		...(delays.length ? { crawlDelaySeconds: Math.max(...delays) } : {})
	};
}

function robotsPatternMatches(pattern: string, path: string): boolean {
	const anchored = pattern.endsWith('$');
	const body = (anchored ? pattern.slice(0, -1) : pattern)
		.split('*')
		.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
		.join('.*');
	return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path);
}

/** Longest matching rule wins; Allow wins ties. */
export function isAllowedByRobots(rules: RobotsRules, pathWithQuery: string): boolean {
	let bestLength = -1;
	let allowed = true;
	for (const pattern of rules.allow) {
		if (pattern.length >= bestLength && robotsPatternMatches(pattern, pathWithQuery)) {
			bestLength = pattern.length;
			allowed = true;
		}
	}
	for (const pattern of rules.disallow) {
		if (pattern.length > bestLength && robotsPatternMatches(pattern, pathWithQuery)) {
			bestLength = pattern.length;
			allowed = false;
		}
	}
	return allowed;
}

export class RobotsDisallowedError extends Error {
	constructor(readonly url: string) {
		super('robots.txt disallows this URL');
		this.name = 'RobotsDisallowedError';
	}
}

export interface PoliteWebFetcherOptions {
	userAgent: string;
	fetchFn?: typeof fetch;
	/** Injected for tests; production resolves through the SSRF policy's DNS. */
	dnsLookup?: FetchPublicUrlOptions['dnsLookup'];
	timeoutMs?: number;
	maxBytes?: number;
	/** Minimum spacing between requests to one host. Default 1000 ms. */
	minHostSpacingMs?: number;
	/** Upper bound for honoring a site's Crawl-delay. Default 5000 ms. */
	maxHostSpacingMs?: number;
	robotsTtlMs?: number;
	maxCachedHosts?: number;
	now?: () => number;
	sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

type RobotsEntry = { rules: RobotsRules | null; expiresAt: number };

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'));
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			reject(signal?.reason ?? new Error('aborted'));
		};
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

export class PoliteWebFetcher {
	private readonly robots = new Map<string, RobotsEntry>();
	private readonly robotsInFlight = new Map<string, Promise<RobotsRules | null>>();
	private readonly nextSlotAt = new Map<string, number>();
	private readonly productToken: string;

	constructor(private readonly options: PoliteWebFetcherOptions) {
		this.productToken = options.userAgent.split('/')[0]!.trim();
	}

	private now(): number {
		return this.options.now?.() ?? Date.now();
	}

	private remember<V>(map: Map<string, V>, key: string, value: V): void {
		map.delete(key);
		map.set(key, value);
		const max = this.options.maxCachedHosts ?? 500;
		while (map.size > max) map.delete(map.keys().next().value!);
	}

	/** Reserve this host's next request slot, then wait for it. */
	private async waitForHostSlot(url: URL, signal?: AbortSignal): Promise<void> {
		const rules = this.robots.get(url.host)?.rules;
		const min = this.options.minHostSpacingMs ?? 1_000;
		const max = this.options.maxHostSpacingMs ?? 5_000;
		const spacing = Math.min(max, Math.max(min, (rules?.crawlDelaySeconds ?? 0) * 1_000));
		const now = this.now();
		const slot = Math.max(now, this.nextSlotAt.get(url.host) ?? 0);
		this.remember(this.nextSlotAt, url.host, slot + spacing);
		if (slot > now) await (this.options.sleep ?? abortableSleep)(slot - now, signal);
	}

	private request(
		url: string,
		signal?: AbortSignal,
		overrides: Partial<FetchPublicUrlOptions> = {}
	) {
		return fetchPublicUrl(url, {
			fetchFn: this.options.fetchFn,
			...(this.options.dnsLookup ? { dnsLookup: this.options.dnsLookup } : {}),
			userAgent: this.options.userAgent,
			timeoutMs: this.options.timeoutMs ?? 12_000,
			maxBytes: this.options.maxBytes ?? 2_000_000,
			signal,
			...overrides
		});
	}

	private async robotsFor(url: URL, signal?: AbortSignal): Promise<RobotsRules | null> {
		const cached = this.robots.get(url.host);
		if (cached && cached.expiresAt > this.now()) return cached.rules;
		const pending = this.robotsInFlight.get(url.host);
		if (pending) return pending;
		const load = (async () => {
			let rules: RobotsRules | null = null;
			try {
				await this.waitForHostSlot(url, signal);
				const response = await this.request(
					`${url.protocol}//${url.host}/robots.txt`,
					signal,
					{
						timeoutMs: 6_000,
						maxBytes: 500_000
					}
				);
				rules = parseRobotsTxt(response.body, this.productToken);
			} catch (error) {
				if (signal?.aborted) throw error;
				// Missing or unreachable robots.txt means no restrictions (RFC 9309 §2.3.1.3).
				rules = null;
			}
			this.remember(this.robots, url.host, {
				rules,
				expiresAt: this.now() + (this.options.robotsTtlMs ?? 60 * 60 * 1_000)
			});
			return rules;
		})();
		this.robotsInFlight.set(url.host, load);
		try {
			return await load;
		} finally {
			this.robotsInFlight.delete(url.host);
		}
	}

	async isAllowed(inputUrl: string, signal?: AbortSignal): Promise<boolean> {
		const url = new URL(inputUrl);
		const rules = await this.robotsFor(url, signal);
		return !rules || isAllowedByRobots(rules, `${url.pathname}${url.search}`);
	}

	/** Robots already cached for this host? Lets callers filter without new requests. */
	isKnownDisallowed(inputUrl: string): boolean {
		try {
			const url = new URL(inputUrl);
			const rules = this.robots.get(url.host)?.rules;
			return Boolean(rules && !isAllowedByRobots(rules, `${url.pathname}${url.search}`));
		} catch {
			return false;
		}
	}

	async fetch(inputUrl: string, signal?: AbortSignal): Promise<FetchPublicUrlResult> {
		if (!(await this.isAllowed(inputUrl, signal))) throw new RobotsDisallowedError(inputUrl);
		await this.waitForHostSlot(new URL(inputUrl), signal);
		return this.request(inputUrl, signal);
	}
}
