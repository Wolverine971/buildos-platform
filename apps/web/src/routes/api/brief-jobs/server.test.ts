// apps/web/src/routes/api/brief-jobs/server.test.ts
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from './$types';
import { GET } from './+server';

function createEvent(query: string) {
	const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json([]));
	const supabase = createClient('https://supabase.test', 'test-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { fetch }
	});
	return {
		fetch,
		event: {
			url: new URL(`https://buildos.test/api/brief-jobs${query}`),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as unknown as Parameters<RequestHandler>[0]
	};
}

describe('GET /api/brief-jobs pagination', () => {
	it.each([
		['', 20, 0],
		['?limit=oops&offset=oops', 20, 0],
		['?limit=-1&offset=-5', 20, 0],
		['?limit=0', 20, 0],
		['?limit=9999', 100, 0],
		['?limit=10&offset=20', 10, 20]
	])('uses a valid bounded range for %s', async (query, limit, offset) => {
		const { event, fetch } = createEvent(query);
		const response = await GET(event);
		expect(response.status).toBe(200);
		expect((await response.json()).data).toMatchObject({ limit, offset, hasMore: false });
		const requestUrl = new URL(String(fetch.mock.calls[0]?.[0]));
		expect(requestUrl.searchParams.get('limit')).toBe(String(limit));
		expect(requestUrl.searchParams.get('offset')).toBe(String(offset));
		expect(requestUrl.searchParams.get('user_id')).toBe('eq.user-1');
	});

	it.each(['9007199254740991', '9'.repeat(400)])(
		'rejects offsets that cannot produce a safe integer range: %s',
		async (offset) => {
			const { event, fetch } = createEvent(`?offset=${offset}`);
			expect((await GET(event)).status).toBe(400);
			expect(fetch).not.toHaveBeenCalled();
		}
	);
});
