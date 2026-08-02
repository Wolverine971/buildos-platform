// apps/web/src/lib/services/agentic-chat/tools/core/executors/external-executor.test.ts
import { describe, expect, it, vi } from 'vitest';
import { ExternalExecutor } from './external-executor';

describe('ExternalExecutor page cache revalidation', () => {
	it('serves stored markdown after a stale entry receives HTTP 304', async () => {
		const cachedRow = {
			id: 'visit-1',
			url: 'https://93.184.216.34/research',
			final_url: 'https://93.184.216.34/research',
			status_code: 200,
			content_type: 'text/html',
			title: 'Cached title',
			markdown: '# Cached evidence\n\nStill current.',
			bytes: 123,
			visit_count: 4,
			etag: '"cached-v1"',
			last_modified: 'Fri, 31 Jul 2026 12:00:00 GMT',
			last_fetched_at: '2026-07-31T12:00:00.000Z'
		};
		const updates: Array<Record<string, unknown>> = [];
		const admin = {
			from: vi.fn(() => {
				const chain: Record<string, any> = {};
				chain.select = vi.fn(() => chain);
				chain.eq = vi.fn(() => chain);
				chain.maybeSingle = vi.fn(async () => ({ data: cachedRow, error: null }));
				chain.update = vi.fn((value: Record<string, unknown>) => {
					updates.push(value);
					return {
						eq: vi.fn(async () => ({ error: null }))
					};
				});
				return chain;
			})
		};
		const fetchFn = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			expect(headers.get('if-none-match')).toBe('"cached-v1"');
			expect(headers.get('if-modified-since')).toBe('Fri, 31 Jul 2026 12:00:00 GMT');
			return new Response(null, { status: 304, headers: { etag: '"cached-v1"' } });
		});
		const executor = new ExternalExecutor({
			supabase: {} as never,
			userId: 'user-1',
			fetchFn: fetchFn as typeof fetch,
			getActorId: async () => 'actor-1',
			getAdminSupabase: () => admin as never,
			getAuthHeaders: async () => ({})
		});

		const result = await executor.webVisit({
			url: cachedRow.url,
			output_format: 'markdown',
			persist: true
		});

		expect(result.content).toContain('Cached evidence');
		expect(result.info).toMatchObject({
			cache_hit: true,
			cache_revalidated: true,
			cache_stale: false
		});
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(updates[0]).toMatchObject({
			visit_count: 5,
			etag: '"cached-v1"'
		});
	});
});
