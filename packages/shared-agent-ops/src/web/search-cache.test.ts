import { describe, expect, it, vi } from 'vitest';
import {
	buildWebSearchCacheKey,
	ExpiringSingleFlightCache,
	normalizeWebSearchQuery
} from './search-cache';

describe('web search cache', () => {
	it('normalizes equivalent queries and domain order to one key', () => {
		expect(normalizeWebSearchQuery('  BUILDOS\n  Research  ')).toBe('buildos research');
		expect(
			buildWebSearchCacheKey({
				query: ' BuildOS   Research ',
				searchDepth: 'advanced',
				maxResults: 4,
				includeAnswer: false,
				includeDomains: ['Example.com', 'docs.example.com']
			})
		).toBe(
			buildWebSearchCacheKey({
				query: 'buildos research',
				searchDepth: 'advanced',
				maxResults: 4,
				includeAnswer: false,
				includeDomains: ['docs.example.com', 'example.com']
			})
		);
	});

	it('coalesces concurrent loads and expires completed values', async () => {
		let now = 1_000;
		let release!: (value: string) => void;
		const loader = vi.fn(
			() =>
				new Promise<string>((resolve) => {
					release = resolve;
				})
		);
		const cache = new ExpiringSingleFlightCache<string>({
			ttlMs: 100,
			now: () => now
		});

		const first = cache.getOrLoad('key', loader);
		const shared = cache.getOrLoad('key', loader);
		release('value');

		expect(await first).toEqual({ value: 'value', status: 'miss' });
		expect(await shared).toEqual({ value: 'value', status: 'shared' });
		expect(loader).toHaveBeenCalledTimes(1);
		expect(await cache.getOrLoad('key', loader)).toEqual({ value: 'value', status: 'hit' });

		now += 101;
		const nextLoader = vi.fn(async () => 'next');
		expect(await cache.getOrLoad('key', nextLoader)).toEqual({ value: 'next', status: 'miss' });
	});
});
