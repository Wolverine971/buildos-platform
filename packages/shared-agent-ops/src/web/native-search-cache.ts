// packages/shared-agent-ops/src/web/native-search-cache.ts
import { createHash, randomUUID } from 'node:crypto';
import {
	buildWebSearchCacheKey,
	ExpiringSingleFlightCache,
	type ExpiringCacheResult,
	type WebSearchCacheKeyInput
} from './search-cache';
import {
	NATIVE_SEARCH_DISCOVERY_CACHE_VERSION,
	TAVILY_DISCOVERY_ADAPTER_VERSION,
	parseNativeSearchDiscoveryResult,
	type NativeSearchDiscoveryResult
} from './native-search-discovery';

export interface NativeSearchDurableCacheClaim<T> {
	state: 'owner' | 'hit' | 'wait';
	value?: T;
}

export interface NativeSearchDurableCacheStore<T> {
	probe: (cacheKeyHash: string) => Promise<boolean>;
	claim: (cacheKeyHash: string, ownerToken: string) => Promise<NativeSearchDurableCacheClaim<T>>;
	complete: (
		cacheKeyHash: string,
		ownerToken: string,
		value: T,
		ttlMs: number
	) => Promise<boolean>;
	release: (cacheKeyHash: string, ownerToken: string) => Promise<boolean>;
	invalidate: (cacheKeyHash: string) => Promise<boolean>;
}

export interface LayeredNativeSearchCacheOptions<T> {
	ttlMs: number;
	maxEntries?: number;
	durableStore?: NativeSearchDurableCacheStore<T>;
	leaseWaitTimeoutMs?: number;
	pollIntervalMs?: number;
	now?: () => number;
	createOwnerToken?: () => string;
	wait?: (delayMs: number) => Promise<void>;
	onDurableError?: (error: unknown) => void;
}

export interface LayeredNativeSearchCacheLoadOptions<T> {
	durableStore?: NativeSearchDurableCacheStore<T>;
}

interface LayeredLoadResult<T> extends ExpiringCacheResult<T> {}

const DEFAULT_LEASE_WAIT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 150;

function waitFor(delayMs: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function hashNativeSearchCacheKey(cacheKey: string): string {
	return createHash('sha256').update(cacheKey).digest('hex');
}

/**
 * L1 process cache in front of an optional database-backed single-flight
 * store. Store failures fail open to discovery so search remains available;
 * provider/loader failures are never cached and release the owner lease.
 */
export class LayeredNativeSearchCache<T> {
	private readonly local: ExpiringSingleFlightCache<LayeredLoadResult<T>>;
	private readonly ttlMs: number;
	private readonly durableStore?: NativeSearchDurableCacheStore<T>;
	private readonly leaseWaitTimeoutMs: number;
	private readonly pollIntervalMs: number;
	private readonly now: () => number;
	private readonly createOwnerToken: () => string;
	private readonly wait: (delayMs: number) => Promise<void>;
	private readonly onDurableError?: (error: unknown) => void;

	constructor(options: LayeredNativeSearchCacheOptions<T>) {
		this.ttlMs = Math.max(1, Math.floor(options.ttlMs));
		this.durableStore = options.durableStore;
		this.leaseWaitTimeoutMs = Math.max(
			1,
			Math.floor(options.leaseWaitTimeoutMs ?? DEFAULT_LEASE_WAIT_TIMEOUT_MS)
		);
		this.pollIntervalMs = Math.max(
			1,
			Math.floor(options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS)
		);
		this.now = options.now ?? Date.now;
		this.createOwnerToken = options.createOwnerToken ?? randomUUID;
		this.wait = options.wait ?? waitFor;
		this.onDurableError = options.onDurableError;
		this.local = new ExpiringSingleFlightCache<LayeredLoadResult<T>>({
			ttlMs: this.ttlMs,
			maxEntries: options.maxEntries,
			now: this.now
		});
	}

	async mayAvoidDispatch(
		cacheKey: string,
		options: LayeredNativeSearchCacheLoadOptions<T> = {}
	): Promise<boolean> {
		if (this.local.has(cacheKey)) return true;
		const durableStore = options.durableStore ?? this.durableStore;
		if (!durableStore) return false;
		try {
			return await durableStore.probe(hashNativeSearchCacheKey(cacheKey));
		} catch (error) {
			this.onDurableError?.(error);
			return false;
		}
	}

	async getOrLoad(
		cacheKey: string,
		loader: () => Promise<T>,
		options: LayeredNativeSearchCacheLoadOptions<T> = {}
	): Promise<ExpiringCacheResult<T>> {
		const durableStore = options.durableStore ?? this.durableStore;
		const local = await this.local.getOrLoad(cacheKey, () =>
			this.loadThroughDurableCache(cacheKey, loader, durableStore)
		);
		if (local.status === 'miss') return local.value;
		return { value: local.value.value, status: local.status };
	}

	clear(): void {
		this.local.clear();
	}

	private async loadThroughDurableCache(
		cacheKey: string,
		loader: () => Promise<T>,
		durableStore?: NativeSearchDurableCacheStore<T>
	): Promise<LayeredLoadResult<T>> {
		if (!durableStore) return { value: await loader(), status: 'miss' };
		const cacheKeyHash = hashNativeSearchCacheKey(cacheKey);
		const ownerToken = this.createOwnerToken();
		const waitDeadline = this.now() + this.leaseWaitTimeoutMs;
		let waited = false;

		while (this.now() < waitDeadline) {
			let claim: NativeSearchDurableCacheClaim<T>;
			try {
				claim = await durableStore.claim(cacheKeyHash, ownerToken);
			} catch (error) {
				this.onDurableError?.(error);
				return { value: await loader(), status: 'miss' };
			}

			if (claim.state === 'hit' && claim.value !== undefined) {
				return { value: claim.value, status: waited ? 'shared' : 'hit' };
			}
			if (claim.state === 'owner') {
				try {
					const value = await loader();
					try {
						await durableStore.complete(cacheKeyHash, ownerToken, value, this.ttlMs);
					} catch (error) {
						this.onDurableError?.(error);
						try {
							await durableStore.release(cacheKeyHash, ownerToken);
						} catch (releaseError) {
							this.onDurableError?.(releaseError);
						}
					}
					return { value, status: 'miss' };
				} catch (error) {
					try {
						await durableStore.release(cacheKeyHash, ownerToken);
					} catch (releaseError) {
						this.onDurableError?.(releaseError);
					}
					throw error;
				}
			}

			waited = true;
			await this.wait(this.pollIntervalMs);
		}

		// A succession of healthy owners can keep the key occupied longer than
		// this caller's bounded wait. Fail open rather than hanging the tool.
		return { value: await loader(), status: 'miss' };
	}
}

export interface NativeSearchCacheRpcResult {
	data: unknown;
	error: { message: string } | null;
}

export interface NativeSearchCacheRpcClient {
	rpc: (
		functionName: string,
		args: Record<string, unknown>
	) => PromiseLike<NativeSearchCacheRpcResult>;
}

export interface SupabaseNativeSearchCacheStoreOptions<T> {
	adapterVersion: string;
	responseVersion: string;
	parseValue: (value: unknown) => T;
	metadataForValue?: (value: T) => {
		provider?: string;
		providerRequestId?: string;
		providerCredits?: number;
	};
	leaseSeconds?: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

async function callRpc(
	client: NativeSearchCacheRpcClient,
	functionName: string,
	args: Record<string, unknown>
): Promise<unknown> {
	const { data, error } = await client.rpc(functionName, args);
	if (error) throw new Error(`${functionName} failed: ${error.message}`);
	return data;
}

export function createSupabaseNativeSearchCacheStore<T>(
	client: NativeSearchCacheRpcClient,
	options: SupabaseNativeSearchCacheStoreOptions<T>
): NativeSearchDurableCacheStore<T> {
	const leaseSeconds = Math.max(5, Math.min(Math.floor(options.leaseSeconds ?? 45), 120));
	return {
		probe: async (cacheKeyHash) =>
			Boolean(
				await callRpc(client, 'probe_native_search_cache', {
					p_cache_key: cacheKeyHash,
					p_adapter_version: options.adapterVersion,
					p_response_version: options.responseVersion
				})
			),
		claim: async (cacheKeyHash, ownerToken) => {
			const value = asRecord(
				await callRpc(client, 'claim_native_search_cache', {
					p_cache_key: cacheKeyHash,
					p_adapter_version: options.adapterVersion,
					p_response_version: options.responseVersion,
					p_owner_token: ownerToken,
					p_lease_seconds: leaseSeconds
				})
			);
			const state = value?.state;
			if (state === 'owner' || state === 'wait') return { state };
			if (state === 'hit') {
				try {
					return { state, value: options.parseValue(value?.response) };
				} catch (error) {
					await callRpc(client, 'invalidate_native_search_cache', {
						p_cache_key: cacheKeyHash
					});
					throw error;
				}
			}
			throw new Error('claim_native_search_cache returned an invalid state');
		},
		complete: async (cacheKeyHash, ownerToken, value, ttlMs) => {
			const metadata = options.metadataForValue?.(value);
			return Boolean(
				await callRpc(client, 'complete_native_search_cache', {
					p_cache_key: cacheKeyHash,
					p_owner_token: ownerToken,
					p_response: value,
					p_ttl_seconds: Math.max(1, Math.ceil(ttlMs / 1_000)),
					p_provider: metadata?.provider,
					p_provider_request_id: metadata?.providerRequestId,
					p_provider_credits: metadata?.providerCredits
				})
			);
		},
		release: async (cacheKeyHash, ownerToken) =>
			Boolean(
				await callRpc(client, 'release_native_search_cache', {
					p_cache_key: cacheKeyHash,
					p_owner_token: ownerToken
				})
			),
		invalidate: async (cacheKeyHash) =>
			Boolean(
				await callRpc(client, 'invalidate_native_search_cache', {
					p_cache_key: cacheKeyHash
				})
			)
	};
}

export interface NativeSearchDiscoveryCacheEntry {
	discovery: NativeSearchDiscoveryResult;
	fetchedAt: string;
}

export function createNativeSearchDiscoveryCacheEntry(
	discovery: NativeSearchDiscoveryResult,
	fetchedAt: string
): NativeSearchDiscoveryCacheEntry {
	return { discovery, fetchedAt };
}

function parseNativeSearchDiscoveryCacheEntry(value: unknown): NativeSearchDiscoveryCacheEntry {
	const entry = asRecord(value);
	const fetchedAt = typeof entry?.fetchedAt === 'string' ? entry.fetchedAt : '';
	if (!fetchedAt || !Number.isFinite(Date.parse(fetchedAt))) {
		throw new Error('Native search cache returned an invalid fetch timestamp');
	}
	return {
		discovery: parseNativeSearchDiscoveryResult(
			entry?.discovery,
			TAVILY_DISCOVERY_ADAPTER_VERSION
		),
		fetchedAt
	};
}

export function createSupabaseNativeSearchDiscoveryCacheStore(
	client: NativeSearchCacheRpcClient
): NativeSearchDurableCacheStore<NativeSearchDiscoveryCacheEntry> {
	return createSupabaseNativeSearchCacheStore(client, {
		adapterVersion: TAVILY_DISCOVERY_ADAPTER_VERSION,
		responseVersion: NATIVE_SEARCH_DISCOVERY_CACHE_VERSION,
		parseValue: parseNativeSearchDiscoveryCacheEntry,
		metadataForValue: (value) => ({
			provider: value.discovery.diagnostics.provider,
			providerRequestId: value.discovery.diagnostics.providerRequestId,
			providerCredits: value.discovery.diagnostics.usage?.credits
		})
	});
}

export function buildNativeSearchDiscoveryCacheKey(input: WebSearchCacheKeyInput): string {
	return buildWebSearchCacheKey({
		...input,
		adapterVersion: TAVILY_DISCOVERY_ADAPTER_VERSION,
		responseVersion: NATIVE_SEARCH_DISCOVERY_CACHE_VERSION
	});
}
