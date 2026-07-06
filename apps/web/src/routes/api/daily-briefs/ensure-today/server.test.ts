// apps/web/src/routes/api/daily-briefs/ensure-today/server.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/railway-worker-env', () => ({
	PUBLIC_RAILWAY_WORKER_URL: 'https://worker.test',
	PRIVATE_RAILWAY_WORKER_TOKEN: 'worker-token'
}));

import { POST } from './+server';

type QueryResponse = {
	data?: any;
	error?: any;
	count?: number | null;
};

function createQuery(response: QueryResponse) {
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		in: vi.fn(() => query),
		is: vi.fn(() => query),
		contains: vi.fn(() => query),
		order: vi.fn(() => query),
		limit: vi.fn(() => query),
		single: vi.fn().mockResolvedValue(response),
		maybeSingle: vi.fn().mockResolvedValue(response),
		then: (resolve: any, reject: any) => Promise.resolve(response).then(resolve, reject)
	};
	return query;
}

function createSupabase(responses: QueryResponse[]) {
	const queries = responses.map(createQuery);
	return {
		from: vi.fn(() => {
			const query = queries.shift();
			if (!query) throw new Error('Unexpected Supabase query');
			return query;
		})
	};
}

function createEvent(supabase: any) {
	return {
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({
				user: { id: 'user-1', email: 'user@example.com' }
			})
		}
	} as any;
}

function noRows() {
	return { data: null, error: { code: 'PGRST116', message: 'No rows' } };
}

describe('POST /api/daily-briefs/ensure-today', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-06T14:00:00.000Z'));
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it('returns the completed brief without queueing a job', async () => {
		const supabase = createSupabase([
			{ data: { timezone: 'America/New_York' }, error: null },
			{
				data: {
					id: 'brief-1',
					user_id: 'user-1',
					brief_date: '2026-07-06',
					executive_summary: 'Ready brief',
					llm_analysis: null,
					priority_actions: [],
					generation_status: 'completed',
					created_at: '2026-07-06T13:00:00.000Z',
					updated_at: '2026-07-06T13:00:00.000Z'
				},
				error: null
			}
		]);

		const response = await POST(createEvent(supabase));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toMatchObject({
			state: 'completed',
			briefDate: '2026-07-06',
			queued: false,
			brief: { id: 'brief-1', summary_content: 'Ready brief' }
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it('returns an active processing job instead of project checks when generation is already running', async () => {
		const supabase = createSupabase([
			{ data: { timezone: 'America/New_York' }, error: null },
			noRows(),
			{
				data: {
					id: 'job-row-1',
					queue_job_id: 'queue-1',
					status: 'processing',
					scheduled_for: '2026-07-06T14:00:00.000Z',
					created_at: '2026-07-06T13:59:00.000Z',
					processed_at: null
				},
				error: null
			}
		]);

		const response = await POST(createEvent(supabase));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toMatchObject({
			state: 'in_flight',
			briefDate: '2026-07-06',
			queued: false,
			job: { queue_job_id: 'queue-1', status: 'processing' }
		});
		expect(supabase.from).toHaveBeenCalledTimes(3);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('skips when the user has no existing ontology actor', async () => {
		const supabase = createSupabase([
			{ data: { timezone: 'America/New_York' }, error: null },
			noRows(),
			noRows(),
			noRows()
		]);

		const response = await POST(createEvent(supabase));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toMatchObject({
			state: 'skipped_no_actor',
			briefDate: '2026-07-06',
			queued: false
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it('skips when the actor has no visible projects', async () => {
		const supabase = createSupabase([
			{ data: { timezone: 'America/New_York' }, error: null },
			noRows(),
			noRows(),
			{ data: { id: 'actor-1' }, error: null },
			{ data: null, error: null, count: 0 },
			{ data: null, error: null, count: 0 }
		]);

		const response = await POST(createEvent(supabase));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toMatchObject({
			state: 'skipped_no_projects',
			briefDate: '2026-07-06',
			queued: false
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it('queues a non-forced immediate ontology brief when preflight passes', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					success: true,
					jobId: 'queue-1',
					scheduledFor: '2026-07-06T14:00:00.000Z'
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		const supabase = createSupabase([
			{ data: { timezone: 'America/New_York' }, error: null },
			noRows(),
			noRows(),
			{ data: { id: 'actor-1' }, error: null },
			{ data: null, error: null, count: 1 },
			{ data: null, error: null, count: 0 }
		]);

		const response = await POST(createEvent(supabase));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toMatchObject({
			state: 'queued',
			briefDate: '2026-07-06',
			queued: true,
			job: { queue_job_id: 'queue-1', status: 'pending' }
		});

		expect(fetchMock).toHaveBeenCalledWith(
			'https://worker.test/queue/brief',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					Authorization: 'Bearer worker-token'
				})
			})
		);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body).toMatchObject({
			userId: 'user-1',
			briefDate: '2026-07-06',
			timezone: 'America/New_York',
			forceRegenerate: false,
			forceImmediate: true,
			options: { useOntology: true }
		});
	});

	it('posts to the worker when an active pending job exists so the worker can promote dedup hits', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					success: true,
					jobId: 'queue-existing',
					scheduledFor: '2026-07-06T14:00:00.000Z'
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		const supabase = createSupabase([
			{ data: { timezone: 'America/New_York' }, error: null },
			noRows(),
			{
				data: {
					id: 'job-row-1',
					queue_job_id: 'queue-existing',
					status: 'pending',
					scheduled_for: '2026-07-06T20:58:00.000Z',
					created_at: '2026-07-06T13:59:00.000Z',
					processed_at: null
				},
				error: null
			},
			{ data: { id: 'actor-1' }, error: null },
			{ data: null, error: null, count: 1 },
			{ data: null, error: null, count: 0 }
		]);

		const response = await POST(createEvent(supabase));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toMatchObject({
			state: 'queued',
			briefDate: '2026-07-06',
			queued: true,
			job: { queue_job_id: 'queue-existing', status: 'pending' }
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body).toMatchObject({
			userId: 'user-1',
			briefDate: '2026-07-06',
			forceRegenerate: false,
			forceImmediate: true
		});
	});
});
