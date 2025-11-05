// apps/web/src/lib/utils/lru-cache.ts
/**
 * Least Recently Used (LRU) Cache implementation
 * Automatically evicts least recently used items when size limit is reached
 */

export interface CacheOptions {
	maxSize?: number;
	ttl?: number; // Time to live in milliseconds
	onEvict?: (key: string, value: any) => void;
}

export class LRUCache<T = any> {
	private cache: Map<string, { value: T; expiry?: number }>;
	private maxSize: number;
	private ttl?: number;
	private onEvict?: (key: string, value: T) => void;

	constructor(options: CacheOptions = {}) {
		this.cache = new Map();
		this.maxSize = options.maxSize || 100;
		this.ttl = options.ttl;
		this.onEvict = options.onEvict;
	}

	/**
	 * Get a value from the cache
	 * Moves the item to the end (most recently used)
	 */
	get(key: string): T | undefined {
		const item = this.cache.get(key);

		if (!item) {
			return undefined;
		}

		// Check if expired
		if (item.expiry && item.expiry < Date.now()) {
			this.cache.delete(key);
			return undefined;
		}

		// Move to end (most recently used)
		this.cache.delete(key);
		this.cache.set(key, item);

		return item.value;
	}

	/**
	 * Set a value in the cache
	 * Evicts least recently used item if size limit reached
	 */
	set(key: string, value: T): void {
		// Remove existing item if present
		if (this.cache.has(key)) {
			this.cache.delete(key);
		}

		// Evict oldest item if at capacity
		if (this.cache.size >= this.maxSize) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== undefined) {
				const evicted = this.cache.get(firstKey);
				this.cache.delete(firstKey);

				if (this.onEvict && evicted) {
					this.onEvict(firstKey, evicted.value);
				}
			}
		}

		// Add new item
		const item: { value: T; expiry?: number } = { value };

		if (this.ttl) {
			item.expiry = Date.now() + this.ttl;
		}

		this.cache.set(key, item);
	}

	/**
	 * Check if a key exists in the cache
	 */
	has(key: string): boolean {
		const item = this.cache.get(key);

		if (!item) {
			return false;
		}

		// Check expiry
		if (item.expiry && item.expiry < Date.now()) {
			this.cache.delete(key);
			return false;
		}

		return true;
	}

	/**
	 * Delete a key from the cache
	 */
	delete(key: string): boolean {
		return this.cache.delete(key);
	}

	/**
	 * Clear all items from the cache
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Get the current size of the cache
	 */
	get size(): number {
		this.cleanExpired();
		return this.cache.size;
	}

	/**
	 * Get all keys in the cache
	 */
	keys(): string[] {
		this.cleanExpired();
		return Array.from(this.cache.keys());
	}

	/**
	 * Get all values in the cache
	 */
	values(): T[] {
		this.cleanExpired();
		return Array.from(this.cache.values()).map((item) => item.value);
	}

	/**
	 * Clean up expired items
	 */
	private cleanExpired(): void {
		if (!this.ttl) return;

		const now = Date.now();
		for (const [key, item] of this.cache.entries()) {
			if (item.expiry && item.expiry < now) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * Get cache statistics
	 */
	getStats() {
		return {
			size: this.size,
			maxSize: this.maxSize,
			utilization: Math.round((this.size / this.maxSize) * 100)
		};
	}
}

/**
 * Create a cached version of an async function
 */
export function createCachedFunction<TArgs extends any[], TResult>(
	fn: (...args: TArgs) => Promise<TResult>,
	options: CacheOptions & { keyGenerator?: (...args: TArgs) => string } = {}
): (...args: TArgs) => Promise<TResult> {
	const cache = new LRUCache<TResult>(options);
	const keyGenerator = options.keyGenerator || ((...args) => JSON.stringify(args));

	return async (...args: TArgs): Promise<TResult> => {
		const key = keyGenerator(...args);

		// Check cache
		const cached = cache.get(key);
		if (cached !== undefined) {
			return cached;
		}

		// Call function and cache result
		const result = await fn(...args);
		cache.set(key, result);

		return result;
	};
}

/**
 * Singleton cache instances for common use cases
 */
export const caches = {
	// API response cache (5 minute TTL)
	api: new LRUCache<any>({
		maxSize: 100,
		ttl: 5 * 60 * 1000
	}),

	// User data cache (10 minute TTL)
	userData: new LRUCache<any>({
		maxSize: 50,
		ttl: 10 * 60 * 1000
	}),

	// Project data cache (5 minute TTL)
	projectData: new LRUCache<any>({
		maxSize: 200,
		ttl: 5 * 60 * 1000
	}),

	// Computed values cache (no TTL)
	computed: new LRUCache<any>({
		maxSize: 500
	})
};
