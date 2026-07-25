// apps/web/src/routes/api/activity/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadActivityTimeline = vi.fn();
vi.mock('$lib/server/activity-timeline.service', () => ({
	loadActivityTimeline: (...args: unknown[]) => loadActivityTimeline(...args)
}));

import { GET } from './+server';

const EMPTY_PAGE = { entries: [], nextCursor: null, hasMore: false, degraded: [] };

function makeEvent(query: string, user: { id: string } | null = { id: 'user-1' }) {
	return {
		locals: {
			supabase: { marker: 'supabase' },
			serverTiming: undefined,
			safeGetSession: async () =>
				user ? { session: { user }, user } : { session: null, user: null }
		},
		url: new URL(`http://localhost/api/activity${query}`)
	} as any;
}

async function body(response: Response) {
	return response.json();
}

describe('GET /api/activity', () => {
	beforeEach(() => {
		loadActivityTimeline.mockReset();
		loadActivityTimeline.mockResolvedValue(EMPTY_PAGE);
	});

	it('rejects an unauthenticated request without touching the timeline', async () => {
		const response = await GET(makeEvent('', null));

		expect(response.status).toBe(401);
		expect(loadActivityTimeline).not.toHaveBeenCalled();
	});

	it('returns the timeline page for the signed-in user', async () => {
		const response = await GET(makeEvent(''));

		expect(response.status).toBe(200);
		expect((await body(response)).data).toEqual(EMPTY_PAGE);
		expect(loadActivityTimeline).toHaveBeenCalledWith(
			expect.objectContaining({ userId: 'user-1', before: null, limit: 30, lanes: null })
		);
	});

	it('passes a valid cursor through', async () => {
		await GET(makeEvent('?before=2026-07-20T00%3A00%3A00.000Z'));

		expect(loadActivityTimeline).toHaveBeenCalledWith(
			expect.objectContaining({ before: '2026-07-20T00:00:00.000Z' })
		);
	});

	it('rejects a cursor that is not a timestamp', async () => {
		const response = await GET(makeEvent('?before=yesterday'));

		expect(response.status).toBe(400);
		expect(loadActivityTimeline).not.toHaveBeenCalled();
	});

	it('clamps the limit into range', async () => {
		await GET(makeEvent('?limit=500'));
		expect(loadActivityTimeline).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));

		loadActivityTimeline.mockClear();
		await GET(makeEvent('?limit=0'));
		expect(loadActivityTimeline).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }));

		loadActivityTimeline.mockClear();
		await GET(makeEvent('?limit=abc'));
		expect(loadActivityTimeline).toHaveBeenCalledWith(expect.objectContaining({ limit: 30 }));
	});

	it('parses a comma-separated lane filter', async () => {
		await GET(makeEvent('?lanes=agent,ping'));

		expect(loadActivityTimeline).toHaveBeenCalledWith(
			expect.objectContaining({ lanes: ['agent', 'ping'] })
		);
	});

	it('rejects a lane filter with no valid lanes rather than widening to everything', async () => {
		const response = await GET(makeEvent('?lanes=bogus'));

		expect(response.status).toBe(400);
		expect(loadActivityTimeline).not.toHaveBeenCalled();
	});

	it('returns a 500 instead of throwing when the timeline query fails', async () => {
		loadActivityTimeline.mockRejectedValue(new Error('db down'));

		const response = await GET(makeEvent(''));

		expect(response.status).toBe(500);
	});
});
