// apps/web/src/routes/sitemap-public-pages.xml/server.test.ts
import { describe, expect, it, vi } from 'vitest';

function createSupabaseResult(data: unknown[] | null, error: unknown = null) {
	const calls: Array<[string, ...unknown[]]> = [];
	const query = {
		select(value: string) {
			calls.push(['select', value]);
			return this;
		},
		eq(column: string, value: unknown) {
			calls.push(['eq', column, value]);
			return this;
		},
		is(column: string, value: unknown) {
			calls.push(['is', column, value]);
			return this;
		},
		order(column: string, options: unknown) {
			calls.push(['order', column, options]);
			return this;
		},
		async range(from: number, to: number) {
			calls.push(['range', from, to]);
			return { data, error };
		}
	};

	return { calls, query };
}

describe('public pages sitemap route', () => {
	it('queries only indexable public pages and returns cached XML', async () => {
		const result = createSupabaseResult([
			{
				slug: 'dj-wayne-alpha',
				slug_prefix: 'dj-wayne',
				slug_base: 'alpha',
				published_at: '2026-07-01T00:00:00.000Z',
				last_live_sync_at: '2026-07-10T00:00:00.000Z',
				updated_at: '2026-07-09T00:00:00.000Z'
			}
		]);
		const supabase = { from: vi.fn(() => result.query) };
		const { GET } = await import('./+server');

		const response = await GET({ locals: { supabase } } as any);
		const xml = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8');
		expect(response.headers.get('cache-control')).toContain('s-maxage=3600');
		expect(xml).toContain('https://build-os.com/p/dj-wayne/alpha');
		expect(xml).toContain('https://build-os.com/p/dj-wayne');
		expect(result.calls).toEqual(
			expect.arrayContaining([
				['eq', 'status', 'published'],
				['eq', 'public_status', 'live'],
				['eq', 'visibility', 'public'],
				['eq', 'noindex', false],
				['is', 'deleted_at', null],
				['range', 0, 999]
			])
		);
	});

	it('returns a retryable error instead of a misleading empty sitemap', async () => {
		const result = createSupabaseResult(null, { message: 'database unavailable' });
		const supabase = { from: vi.fn(() => result.query) };
		const { GET } = await import('./+server');

		const response = await GET({ locals: { supabase } } as any);

		expect(response.status).toBe(503);
		expect(response.headers.get('retry-after')).toBe('300');
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
});
