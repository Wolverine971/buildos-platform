// apps/web/src/routes/api/queue-jobs/[id]/server.test.ts
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from './$types';
import { DELETE } from './+server';

function createEvent(job: { user_id: string; status: string } | null) {
	const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input));
		expect(url.searchParams.get('queue_job_id')).toBe('eq.queue-1');
		expect(url.searchParams.get('user_id')).toBe('eq.user-1');
		const owned = job?.user_id === 'user-1';
		if (init?.method === 'PATCH') {
			expect(url.searchParams.get('status')).toBe('eq.pending');
			const updated = owned && job.status === 'pending';
			if (updated) Object.assign(job, JSON.parse(String(init.body)));
			if (!new Headers(init.headers).get('prefer')?.includes('return=representation')) {
				return new Response(null, { status: 204 });
			}
			if (!updated) {
				return Response.json(
					{ code: 'PGRST116', details: 'The result contains 0 rows', message: 'No rows' },
					{ status: 406 }
				);
			}
			return Response.json({ id: 'row-1' });
		}
		return Response.json(owned ? [{ id: 'row-1', status: job.status }] : []);
	});
	const supabase = createClient('https://supabase.test', 'test-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { fetch }
	});
	const event = {
		params: { id: 'queue-1' },
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
		}
	} as unknown as Parameters<RequestHandler>[0];
	return { event, fetch };
}

describe('DELETE /api/queue-jobs/[id]', () => {
	it('confirms cancellation only after updating an owned pending job', async () => {
		const job = { user_id: 'user-1', status: 'pending' };
		const { event, fetch } = createEvent(job);

		const response = await DELETE(event);

		expect(response.status).toBe(200);
		expect(job.status).toBe('cancelled');
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it.each(['processing', 'completed', 'cancelled', 'failed'])(
		'returns a conflict when the job is already %s at the conditional update',
		async (status) => {
			const job = { user_id: 'user-1', status };
			const { event } = createEvent(job);

			const response = await DELETE(event);

			expect(response.status).toBe(409);
			expect((await response.json()).success).toBe(false);
			expect(job.status).toBe(status);
		}
	);

	it.each([null, { user_id: 'user-2', status: 'pending' }])(
		'returns not found for a missing or another user’s job: %j',
		async (job) => {
			const { event } = createEvent(job);
			const response = await DELETE(event);
			expect(response.status).toBe(404);
			if (job) expect(job.status).toBe('pending');
		}
	);

	it('does not reach the database without authentication', async () => {
		const { event, fetch } = createEvent(null);
		vi.mocked(event.locals.safeGetSession).mockResolvedValue({ session: null, user: null });
		expect((await DELETE(event)).status).toBe(401);
		expect(fetch).not.toHaveBeenCalled();
	});
});
