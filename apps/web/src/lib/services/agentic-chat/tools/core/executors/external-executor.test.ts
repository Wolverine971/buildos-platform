// apps/web/src/lib/services/agentic-chat/tools/core/executors/external-executor.test.ts
import { describe, expect, it, vi } from 'vitest';
import { hashNativeSearchPageContent } from '@buildos/shared-agent-ops/web/native-search';
import { ExternalExecutor } from './external-executor';

describe('ExternalExecutor page cache revalidation', () => {
	it('serves stored markdown after a stale entry receives HTTP 304', async () => {
		const cachedMarkdown = '# Cached evidence\n\nStill current.';
		const contentHash = hashNativeSearchPageContent(cachedMarkdown);
		const cachedRow = {
			id: '10000000-0000-4000-8000-000000000001',
			url: 'https://93.184.216.34/research',
			final_url: 'https://93.184.216.34/research',
			status_code: 200,
			content_type: 'text/html',
			title: 'Cached title',
			markdown: cachedMarkdown,
			content_hash: contentHash,
			bytes: 123,
			visit_count: 4,
			etag: '"cached-v1"',
			last_modified: 'Fri, 31 Jul 2026 12:00:00 GMT',
			last_fetched_at: '2026-07-31T12:00:00.000Z'
		};
		const updates: Array<Record<string, unknown>> = [];
		const rpc = vi.fn(async () => ({
			data: {
				page_visit_id: cachedRow.id,
				page_version_id: '20000000-0000-4000-8000-000000000001',
				version_number: 1,
				content_hash: contentHash,
				content_length: Array.from(cachedMarkdown).length,
				content_format: 'markdown',
				fetched_at: cachedRow.last_fetched_at,
				extraction_method: 'static',
				extraction_version: 'legacy-web-page-visit-v1',
				chunks: [
					{
						id: '30000000-0000-4000-8000-000000000001',
						chunk_index: 0,
						start_offset: 0,
						end_offset: Array.from(cachedMarkdown).length,
						selector: `char:0-${Array.from(cachedMarkdown).length}`,
						content_hash: contentHash
					}
				]
			},
			error: null
		}));
		const admin = {
			rpc,
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
		expect(result).toMatchObject({
			visit_id: cachedRow.id,
			page_version_id: '20000000-0000-4000-8000-000000000001',
			page_version_number: 1,
			content_hash: contentHash,
			evidence_chunks: [
				{
					id: '30000000-0000-4000-8000-000000000001',
					selector: `char:0-${Array.from(cachedMarkdown).length}`
				}
			]
		});
		expect(result.info).toMatchObject({
			cache_hit: true,
			cache_revalidated: true,
			cache_stale: false
		});
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(rpc).toHaveBeenCalledWith('get_current_web_page_evidence', {
			p_web_page_visit_id: cachedRow.id
		});
		expect(updates[0]).toMatchObject({
			visit_count: 5,
			etag: '"cached-v1"'
		});
	});

	it('never reads or writes the global cache for signed URLs', async () => {
		const admin = { from: vi.fn() };
		const fetchFn = vi.fn(
			async () =>
				new Response('<html><body><main>Private evidence</main></body></html>', {
					status: 200,
					headers: { 'content-type': 'text/html' }
				})
		);
		const executor = new ExternalExecutor({
			supabase: {} as never,
			userId: 'user-1',
			fetchFn: fetchFn as typeof fetch,
			getActorId: async () => 'actor-1',
			getAdminSupabase: () => admin as never,
			getAuthHeaders: async () => ({})
		});

		const result = await executor.webVisit({
			url: 'https://93.184.216.34/private?token=test-signature',
			output_format: 'markdown',
			persist: true
		});

		expect(result.content).toContain('Private evidence');
		expect(result.stored).toBe(false);
		expect(result.info).toMatchObject({ cache_hit: false });
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(admin.from).not.toHaveBeenCalled();
	});

	it('ignores legacy cache rows whose stored redirect URL is credential-bearing', async () => {
		const chain: Record<string, any> = {};
		chain.select = vi.fn(() => chain);
		chain.eq = vi.fn(() => chain);
		chain.maybeSingle = vi.fn(async () => ({
			data: {
				id: 'legacy-private-visit',
				url: 'https://93.184.216.34/research',
				final_url: 'https://93.184.216.34/private?client_secret=test-secret',
				markdown: '# Cached private evidence',
				last_fetched_at: '2099-01-01T00:00:00.000Z'
			},
			error: null
		}));
		const admin = { from: vi.fn(() => chain) };
		const fetchFn = vi.fn(async (input: string | URL | Request) => {
			if (String(input).endsWith('/research')) {
				return new Response(null, {
					status: 302,
					headers: {
						location: 'https://93.184.216.34/private?client_secret=test-secret'
					}
				});
			}
			return new Response('<html><body><main>Fresh private evidence</main></body></html>', {
				status: 200,
				headers: { 'content-type': 'text/html' }
			});
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
			url: 'https://93.184.216.34/research',
			output_format: 'markdown',
			persist: true
		});

		expect(result.content).toContain('Fresh private evidence');
		expect(result.content).not.toContain('Cached private evidence');
		expect(result.stored).toBe(false);
		expect(fetchFn).toHaveBeenCalledTimes(2);
		expect(admin.from).toHaveBeenCalledTimes(1);
	});
});
