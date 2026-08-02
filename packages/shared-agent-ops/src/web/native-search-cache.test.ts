// packages/shared-agent-ops/src/web/native-search-cache.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	LayeredNativeSearchCache,
	buildNativeSearchDiscoveryCacheKey,
	createNativeSearchDiscoveryCacheEntry,
	createSupabaseNativeSearchDiscoveryCacheStore,
	hashNativeSearchCacheKey,
	type NativeSearchCacheRpcClient,
	type NativeSearchDurableCacheClaim,
	type NativeSearchDurableCacheStore
} from './native-search-cache';
import type { NativeSearchDiscoveryResult } from './native-search-discovery';

class MemoryDurableStore<T> implements NativeSearchDurableCacheStore<T> {
	ownerToken?: string;
	value?: T;
	completeCalls = 0;
	releaseCalls = 0;

	async probe(): Promise<boolean> {
		return this.value !== undefined;
	}

	async claim(
		_cacheKeyHash: string,
		ownerToken: string
	): Promise<NativeSearchDurableCacheClaim<T>> {
		if (this.value !== undefined) return { state: 'hit', value: this.value };
		if (!this.ownerToken || this.ownerToken === ownerToken) {
			this.ownerToken = ownerToken;
			return { state: 'owner' };
		}
		return { state: 'wait' };
	}

	async complete(_cacheKeyHash: string, ownerToken: string, value: T): Promise<boolean> {
		this.completeCalls += 1;
		if (this.ownerToken !== ownerToken) return false;
		this.ownerToken = undefined;
		this.value = value;
		return true;
	}

	async release(_cacheKeyHash: string, ownerToken: string): Promise<boolean> {
		this.releaseCalls += 1;
		if (this.ownerToken !== ownerToken) return false;
		this.ownerToken = undefined;
		return true;
	}

	async invalidate(): Promise<boolean> {
		this.ownerToken = undefined;
		this.value = undefined;
		return true;
	}
}

function discovery(query = 'buildos'): NativeSearchDiscoveryResult {
	return {
		query,
		results: [{ title: 'BuildOS', url: 'https://example.com/', snippet: 'Evidence' }],
		diagnostics: {
			provider: 'tavily',
			adapterVersion: 'tavily-v1',
			providerRequestId: 'request-1',
			usage: { credits: 2 }
		}
	};
}

describe('LayeredNativeSearchCache', () => {
	it('hashes the versioned normalized key without storing the plaintext query as the durable key', () => {
		const key = buildNativeSearchDiscoveryCacheKey({
			query: ' Private Project Research ',
			searchDepth: 'advanced',
			maxResults: 4,
			includeAnswer: false
		});
		const hash = hashNativeSearchCacheKey(key);

		expect(key).toContain('native-search-discovery-v1');
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(hash).not.toContain('private');
		expect(hashNativeSearchCacheKey(key)).toBe(hash);
	});

	it('uses a durable hit without invoking discovery and then serves it from L1', async () => {
		const store = new MemoryDurableStore<string>();
		store.value = 'durable';
		const loader = vi.fn(async () => 'provider');
		const cache = new LayeredNativeSearchCache<string>({ ttlMs: 1_000, durableStore: store });

		expect(await cache.getOrLoad('key', loader)).toEqual({ value: 'durable', status: 'hit' });
		expect(await cache.getOrLoad('key', loader)).toEqual({ value: 'durable', status: 'hit' });
		expect(await cache.mayAvoidDispatch('key')).toBe(true);
		expect(loader).not.toHaveBeenCalled();
	});

	it('coalesces provider discovery across two process-local cache instances', async () => {
		const store = new MemoryDurableStore<string>();
		let releaseLoader!: (value: string) => void;
		const loader = vi.fn(
			() =>
				new Promise<string>((resolve) => {
					releaseLoader = resolve;
				})
		);
		const options = {
			ttlMs: 1_000,
			durableStore: store,
			pollIntervalMs: 1,
			leaseWaitTimeoutMs: 1_000
		};
		const firstCache = new LayeredNativeSearchCache<string>({
			...options,
			createOwnerToken: () => 'owner-1'
		});
		const secondCache = new LayeredNativeSearchCache<string>({
			...options,
			createOwnerToken: () => 'owner-2'
		});

		const first = firstCache.getOrLoad('key', loader);
		await vi.waitFor(() => expect(store.ownerToken).toBe('owner-1'));
		const second = secondCache.getOrLoad('key', loader);
		releaseLoader('provider');

		expect(await first).toEqual({ value: 'provider', status: 'miss' });
		expect(await second).toEqual({ value: 'provider', status: 'shared' });
		expect(loader).toHaveBeenCalledTimes(1);
		expect(store.completeCalls).toBe(1);
	});

	it('releases the durable owner claim when provider discovery fails', async () => {
		const store = new MemoryDurableStore<string>();
		const cache = new LayeredNativeSearchCache<string>({
			ttlMs: 1_000,
			durableStore: store,
			createOwnerToken: () => 'owner-1'
		});

		await expect(
			cache.getOrLoad('key', async () => {
				throw new Error('provider failed');
			})
		).rejects.toThrow('provider failed');
		expect(store.ownerToken).toBeUndefined();
		expect(store.releaseCalls).toBe(1);
	});

	it('fails open to discovery when the durable store is unavailable', async () => {
		const onDurableError = vi.fn();
		const store: NativeSearchDurableCacheStore<string> = {
			probe: vi.fn(async () => {
				throw new Error('database unavailable');
			}),
			claim: vi.fn(async () => {
				throw new Error('database unavailable');
			}),
			complete: vi.fn(),
			release: vi.fn(),
			invalidate: vi.fn()
		};
		const cache = new LayeredNativeSearchCache<string>({
			ttlMs: 1_000,
			durableStore: store,
			onDurableError
		});

		expect(await cache.mayAvoidDispatch('key')).toBe(false);
		expect(await cache.getOrLoad('key', async () => 'provider')).toEqual({
			value: 'provider',
			status: 'miss'
		});
		expect(onDurableError).toHaveBeenCalledTimes(2);
	});
});

describe('Supabase native search cache store', () => {
	it('validates a stored discovery hit and records provider provenance on completion', async () => {
		const entry = createNativeSearchDiscoveryCacheEntry(
			discovery(),
			'2026-08-02T12:00:00.000Z'
		);
		const calls: Array<{ functionName: string; args: Record<string, unknown> }> = [];
		const rpcClient: NativeSearchCacheRpcClient = {
			rpc: async (functionName, args) => {
				calls.push({ functionName, args });
				if (functionName === 'claim_native_search_cache') {
					return { data: { state: 'hit', response: entry }, error: null };
				}
				return { data: true, error: null };
			}
		};
		const store = createSupabaseNativeSearchDiscoveryCacheStore(rpcClient);

		expect(await store.claim('a'.repeat(64), 'owner-1')).toEqual({
			state: 'hit',
			value: entry
		});
		expect(await store.complete('a'.repeat(64), 'owner-1', entry, 5_001)).toBe(true);
		expect(calls[0]).toMatchObject({
			functionName: 'claim_native_search_cache',
			args: {
				p_adapter_version: 'tavily-v1',
				p_response_version: 'native-search-discovery-v1'
			}
		});
		expect(calls[1]).toMatchObject({
			functionName: 'complete_native_search_cache',
			args: {
				p_ttl_seconds: 6,
				p_provider: 'tavily',
				p_provider_request_id: 'request-1',
				p_provider_credits: 2
			}
		});
	});

	it('rejects malformed stored discovery payloads', async () => {
		const rpcClient: NativeSearchCacheRpcClient = {
			// A malformed hit is invalidated before the error is surfaced.
			rpc: async () => ({
				data: {
					state: 'hit',
					response: {
						fetchedAt: '2026-08-02T12:00:00.000Z',
						discovery: { query: 'x', results: [], diagnostics: {} }
					}
				},
				error: null
			})
		};
		const store = createSupabaseNativeSearchDiscoveryCacheStore(rpcClient);

		await expect(store.claim('a'.repeat(64), 'owner-1')).rejects.toThrow(
			'invalid discovery payload'
		);
	});
});
