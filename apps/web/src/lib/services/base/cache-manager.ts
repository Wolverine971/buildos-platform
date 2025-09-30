// apps/web/src/lib/services/base/cache-manager.ts

interface CacheEntry<T> {
	data: T;
	timestamp: number;
	ttl: number;
}

export class CacheManager<T = any> {
	private cache = new Map<string, CacheEntry<T>>();
	private maxSize: number;
	private defaultTTL: number;

	constructor(maxSize = 100, defaultTTL = 5 * 60 * 1000) {
		// 5 minutes default
		this.maxSize = maxSize;
		this.defaultTTL = defaultTTL;
	}

	/**
	 * Get item from cache
	 */
	get(key: string): T | null {
		const entry = this.cache.get(key);

		if (!entry) {
			return null;
		}

		// Check if expired
		if (Date.now() - entry.timestamp > entry.ttl) {
			this.cache.delete(key);
			return null;
		}

		// Move to end (LRU)
		this.cache.delete(key);
		this.cache.set(key, entry);

		return entry.data;
	}

	/**
	 * Set item in cache
	 */
	set(key: string, data: T, ttl = this.defaultTTL): void {
		// Evict oldest if at max size
		if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey) {
				this.cache.delete(firstKey);
			}
		}

		this.cache.set(key, {
			data,
			timestamp: Date.now(),
			ttl
		});
	}

	/**
	 * Delete item from cache
	 */
	delete(key: string): boolean {
		return this.cache.delete(key);
	}

	/**
	 * Clear all cache entries
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Clear expired entries
	 */
	clearExpired(): void {
		const now = Date.now();

		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.timestamp > entry.ttl) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * Get cache size
	 */
	get size(): number {
		return this.cache.size;
	}

	/**
	 * Check if key exists and is not expired
	 */
	has(key: string): boolean {
		const entry = this.cache.get(key);

		if (!entry) {
			return false;
		}

		if (Date.now() - entry.timestamp > entry.ttl) {
			this.cache.delete(key);
			return false;
		}

		return true;
	}

	/**
	 * Get all valid keys
	 */
	keys(): string[] {
		this.clearExpired();
		return Array.from(this.cache.keys());
	}

	/**
	 * Invalidate entries matching pattern
	 */
	invalidatePattern(pattern: string | RegExp): void {
		const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

		for (const key of this.cache.keys()) {
			if (regex.test(key)) {
				this.cache.delete(key);
			}
		}
	}
}
