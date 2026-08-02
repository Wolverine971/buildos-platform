// packages/shared-agent-ops/src/web/search-cache.ts
export type ExpiringCacheStatus = 'miss' | 'hit' | 'shared';

export interface ExpiringSingleFlightCacheOptions {
	ttlMs: number;
	maxEntries?: number;
	now?: () => number;
}

export interface ExpiringCacheResult<T> {
	value: T;
	status: ExpiringCacheStatus;
}

interface CacheEntry<T> {
	value: T;
	expiresAt: number;
}

/**
 * Small process-local TTL cache that also coalesces identical concurrent work.
 * It is intentionally bounded; distributed caching belongs at the orchestration
 * layer once search runs across multiple worker/server instances.
 */
export class ExpiringSingleFlightCache<T> {
	private readonly cache = new Map<string, CacheEntry<T>>();
	private readonly inFlight = new Map<string, Promise<T>>();
	private readonly ttlMs: number;
	private readonly maxEntries: number;
	private readonly now: () => number;

	constructor(options: ExpiringSingleFlightCacheOptions) {
		this.ttlMs = Math.max(1, Math.floor(options.ttlMs));
		this.maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 500));
		this.now = options.now ?? Date.now;
	}

	has(key: string): boolean {
		this.pruneExpired();
		return this.cache.has(key) || this.inFlight.has(key);
	}

	hasCached(key: string): boolean {
		this.pruneExpired();
		return this.cache.has(key);
	}

	async getOrLoad(key: string, loader: () => Promise<T>): Promise<ExpiringCacheResult<T>> {
		this.pruneExpired();
		const cached = this.cache.get(key);
		if (cached) {
			// Refresh insertion order so eviction behaves like a small LRU.
			this.cache.delete(key);
			this.cache.set(key, cached);
			return { value: cached.value, status: 'hit' };
		}

		const pending = this.inFlight.get(key);
		if (pending) {
			return { value: await pending, status: 'shared' };
		}

		const load = loader()
			.then((value) => {
				this.cache.set(key, { value, expiresAt: this.now() + this.ttlMs });
				this.evictOverflow();
				return value;
			})
			.finally(() => {
				this.inFlight.delete(key);
			});
		this.inFlight.set(key, load);
		return { value: await load, status: 'miss' };
	}

	clear(): void {
		this.cache.clear();
		this.inFlight.clear();
	}

	private pruneExpired(): void {
		const now = this.now();
		for (const [key, entry] of this.cache) {
			if (entry.expiresAt <= now) this.cache.delete(key);
		}
	}

	private evictOverflow(): void {
		while (this.cache.size > this.maxEntries) {
			const oldestKey = this.cache.keys().next().value as string | undefined;
			if (!oldestKey) return;
			this.cache.delete(oldestKey);
		}
	}
}

export interface WebSearchCacheKeyInput {
	query: string;
	searchDepth: 'basic' | 'advanced';
	maxResults: number;
	includeAnswer: boolean;
	includeDomains?: string[];
	excludeDomains?: string[];
	adapterVersion?: string;
	responseVersion?: string;
}

export function normalizeWebSearchQuery(query: string): string {
	return query.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function normalizeDomains(domains?: string[]): string[] {
	return [
		...new Set((domains ?? []).map((domain) => domain.trim().toLowerCase()).filter(Boolean))
	].sort();
}

export function buildWebSearchCacheKey(input: WebSearchCacheKeyInput): string {
	return JSON.stringify([
		input.adapterVersion ?? null,
		input.responseVersion ?? null,
		normalizeWebSearchQuery(input.query),
		input.searchDepth,
		input.maxResults,
		input.includeAnswer,
		normalizeDomains(input.includeDomains),
		normalizeDomains(input.excludeDomains)
	]);
}
