// apps/web/src/lib/services/agentic-chat-v2/materialized-context-cache.server.test.ts
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { FASTCHAT_CONTEXT_CACHE_VERSION, buildFastChatContextCacheEntry } from './context-cache';
import { resolveMaterializedFastChatContext } from './materialized-context-cache.server';

const NOW_MS = Date.parse('2026-08-30T16:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const CACHE_KEY = `v2|project|${PROJECT_ID}|none|none`;

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
			.join(',')}}`;
	}
	return JSON.stringify(value);
}

function sha256Json(value: unknown): string {
	return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function sourceClient(tokens: Array<string | null>) {
	return {
		rpc: vi.fn(async () => ({ data: tokens.shift() ?? null, error: null }))
	} as any;
}

function storeClient(row: Record<string, unknown> | null = null) {
	const upsert = vi.fn(async () => ({ error: null }));
	const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
	const builder = {
		select: vi.fn(() => builder),
		eq: vi.fn(() => builder),
		maybeSingle,
		upsert
	};
	return {
		client: { from: vi.fn(() => builder) } as any,
		maybeSingle,
		upsert
	};
}

function freshContext(label = 'fresh') {
	return {
		contextType: 'project' as const,
		entityId: PROJECT_ID,
		projectId: PROJECT_ID,
		projectName: 'Materialized cache project',
		data: { label }
	};
}

function baseParams(params: {
	source: any;
	store: any;
	loadFresh: () => Promise<ReturnType<typeof freshContext>>;
}) {
	return {
		sourceSupabase: params.source,
		storeSupabase: params.store,
		userId: USER_ID,
		contextType: 'project' as const,
		entityId: PROJECT_ID,
		projectId: PROJECT_ID,
		cacheKey: CACHE_KEY,
		loadFresh: params.loadFresh,
		nowMs: NOW_MS
	};
}

describe('materialized fast-chat context cache', () => {
	it('reuses a fresh session snapshot only when its invalidation token matches', async () => {
		const source = sourceClient(['project:v1:1']);
		const store = storeClient();
		const loadFresh = vi.fn(async () => freshContext());
		const sessionCache = buildFastChatContextCacheEntry({
			cacheKey: CACHE_KEY,
			context: freshContext('session'),
			createdAt: new Date(NOW_MS - 1_000).toISOString(),
			invalidationToken: 'project:v1:1'
		});

		const result = await resolveMaterializedFastChatContext({
			...baseParams({ source, store: store.client, loadFresh }),
			sessionCache
		});

		expect(result.cacheSource).toBe('session_cache');
		expect(result.cache.context.data).toEqual({ label: 'session' });
		expect(store.client.from).not.toHaveBeenCalled();
		expect(loadFresh).not.toHaveBeenCalled();
	});

	it('reads a durable snapshot without recomputing and accepts reordered JSON keys', async () => {
		const payload = {
			projectName: 'Materialized cache project',
			data: { z: 1, a: 2 },
			projectId: PROJECT_ID,
			entityId: PROJECT_ID,
			contextType: 'project'
		};
		const source = sourceClient(['project:v1:2']);
		const store = storeClient({
			context_cache_version: FASTCHAT_CONTEXT_CACHE_VERSION,
			invalidation_token: 'project:v1:2',
			context_payload: payload,
			context_payload_sha256: sha256Json(payload),
			expires_at: new Date(NOW_MS + 60_000).toISOString(),
			created_at: new Date(NOW_MS - 30_000).toISOString()
		});
		const loadFresh = vi.fn(async () => freshContext());

		const result = await resolveMaterializedFastChatContext(
			baseParams({ source, store: store.client, loadFresh })
		);

		expect(result.cacheSource).toBe('materialized_cache');
		expect(result.cache.invalidation_token).toBe('project:v1:2');
		expect(result.cache.materialized_at).toBe(new Date(NOW_MS - 30_000).toISOString());
		expect(loadFresh).not.toHaveBeenCalled();
		expect(store.upsert).not.toHaveBeenCalled();
	});

	it('reloads once if the source generation changes while context is being built', async () => {
		const source = sourceClient(['project:v1:3', 'project:v1:4']);
		const store = storeClient();
		const loadFresh = vi
			.fn()
			.mockResolvedValueOnce(freshContext('stale-during-load'))
			.mockResolvedValueOnce(freshContext('current'));

		const result = await resolveMaterializedFastChatContext(
			baseParams({ source, store: store.client, loadFresh })
		);

		expect(result.cacheSource).toBe('fresh_load');
		expect(result.invalidationToken).toBe('project:v1:4');
		expect(result.cache.context.data).toEqual({ label: 'current' });
		expect(loadFresh).toHaveBeenCalledTimes(2);
		expect(store.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				invalidation_token: 'project:v1:4',
				context_payload: expect.objectContaining({ data: { label: 'current' } })
			}),
			{ onConflict: 'user_id,cache_key' }
		);
	});

	it('rejects stale session and durable generations, then replaces the durable row', async () => {
		const stalePayload = freshContext('durable-stale');
		const source = sourceClient(['project:v1:6', 'project:v1:6']);
		const store = storeClient({
			context_cache_version: FASTCHAT_CONTEXT_CACHE_VERSION,
			invalidation_token: 'project:v1:5',
			context_payload: stalePayload,
			context_payload_sha256: sha256Json(stalePayload),
			expires_at: new Date(NOW_MS + 60_000).toISOString(),
			created_at: new Date(NOW_MS - 30_000).toISOString()
		});
		const loadFresh = vi.fn(async () => freshContext('rebuilt'));
		const staleSession = buildFastChatContextCacheEntry({
			cacheKey: CACHE_KEY,
			context: freshContext('session-stale'),
			createdAt: new Date(NOW_MS - 1_000).toISOString(),
			invalidationToken: 'project:v1:5'
		});

		const result = await resolveMaterializedFastChatContext({
			...baseParams({ source, store: store.client, loadFresh }),
			sessionCache: staleSession
		});

		expect(result.cacheSource).toBe('fresh_load');
		expect(result.cache.context.data).toEqual({ label: 'rebuilt' });
		expect(loadFresh).toHaveBeenCalledOnce();
		expect(store.upsert).toHaveBeenCalledOnce();
	});
});
