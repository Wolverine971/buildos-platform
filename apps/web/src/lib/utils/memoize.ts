// apps/web/src/lib/utils/memoize.ts
export function memoize<T extends (...args: any[]) => any>(fn: T): T {
	const cache = new Map();

	return ((...args: Parameters<T>): ReturnType<T> => {
		const key = JSON.stringify(args);

		if (cache.has(key)) {
			return cache.get(key);
		}

		const result = fn(...args);
		cache.set(key, result);

		// Limit cache size
		if (cache.size > 100) {
			const firstKey = cache.keys().next().value;
			cache.delete(firstKey);
		}

		return result;
	}) as T;
}
