// apps/web/src/routes/api/account/exports/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from './$types';
import { exportRow, fakeUserClient, routeEvent } from '$lib/test-helpers/fake-user-data-exports';

vi.mock('$lib/server/route-error', async () => {
	const { ApiResponse } = await import('$lib/utils/api-response');
	return {
		routeErrorResponse: vi.fn(
			async (_event: unknown, _error: unknown, options: { message?: string }) =>
				ApiResponse.error(options.message ?? 'Internal server error', 500)
		)
	};
});

import { GET, POST } from './+server';

type Event = Parameters<RequestHandler>[0];
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const EXPORT_ID = '22222222-2222-4222-8222-222222222222';

describe('GET /api/account/exports', () => {
	it('requires a session and touches nothing without one', async () => {
		const { client, rpcCalls } = fakeUserClient([]);
		const response = await GET(routeEvent(client, { userId: null }) as unknown as Event);
		expect(response.status).toBe(401);
		expect(rpcCalls).toEqual([]);
	});

	it('returns only the caller’s latest export and what is left of the daily limit', async () => {
		const { client } = fakeUserClient([
			exportRow({ id: 'a', status: 'expired', requested_at: hoursAgo(30) }),
			exportRow({
				id: 'b',
				status: 'failed',
				requested_at: hoursAgo(5),
				error_code: 'upload_failed'
			}),
			exportRow({
				id: 'c',
				status: 'ready',
				requested_at: hoursAgo(3),
				storage_path: `user-1/c.zip`,
				part_count: 2,
				byte_size: 1024,
				expires_at: new Date(Date.now() + 86_400_000).toISOString()
			}),
			exportRow({
				id: 'other',
				user_id: 'user-2',
				status: 'queued',
				requested_at: hoursAgo(0)
			})
		]);

		const response = await GET(routeEvent(client) as unknown as Event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.data.export.id).toBe('c');
		expect(body.data.export.status).toBe('ready');
		expect(body.data.export.downloadPaths).toEqual([
			'/api/account/exports/c/download?part=1',
			'/api/account/exports/c/download?part=2'
		]);
		// One non-failed request in the last 24 hours: 2 of 3 left.
		expect(body.data.remainingToday).toBe(2);
	});

	it('reports an export whose worker died as failed instead of busy', async () => {
		const { client } = fakeUserClient([
			exportRow({ status: 'running', requested_at: hoursAgo(3) })
		]);
		const body = await (await GET(routeEvent(client) as unknown as Event)).json();
		expect(body.data.export.status).toBe('failed');
		expect(body.data.export.errorCode).toBe('stale');
	});
});

describe('POST /api/account/exports', () => {
	let rows: ReturnType<typeof exportRow>[];
	beforeEach(() => {
		rows = [];
	});

	it('requires a session and never calls the request function without one', async () => {
		const { client, rpcCalls } = fakeUserClient(rows);
		const response = await POST(routeEvent(client, { userId: null }) as unknown as Event);
		expect(response.status).toBe(401);
		expect(rpcCalls).toEqual([]);
	});

	it('creates an export through request_user_data_export', async () => {
		rows.push(exportRow({ id: EXPORT_ID }));
		const { client, rpcCalls } = fakeUserClient(rows, () => ({
			data: { outcome: 'created', export_id: EXPORT_ID },
			error: null
		}));

		const response = await POST(routeEvent(client) as unknown as Event);
		const body = await response.json();

		expect(rpcCalls).toEqual(['request_user_data_export']);
		expect(response.status).toBe(201);
		expect(body.data.export).toMatchObject({
			id: EXPORT_ID,
			status: 'queued',
			downloadPaths: []
		});
	});

	it('returns the export already in progress instead of starting a second one', async () => {
		rows.push(exportRow({ id: EXPORT_ID, status: 'running', started_at: hoursAgo(0) }));
		const { client } = fakeUserClient(rows, () => ({
			data: { outcome: 'active', export_id: EXPORT_ID },
			error: null
		}));

		const response = await POST(routeEvent(client) as unknown as Event);
		expect(response.status).toBe(200);
		expect((await response.json()).data.export.status).toBe('running');
	});

	it('answers 429 with the next allowed time once the daily limit is used', async () => {
		const nextAllowedAt = new Date(Date.now() + 3_600_000).toISOString();
		const { client } = fakeUserClient(rows, () => ({
			data: { outcome: 'rate_limited', export_id: null, next_allowed_at: nextAllowedAt },
			error: null
		}));

		const response = await POST(routeEvent(client) as unknown as Event);
		const body = await response.json();
		expect(response.status).toBe(429);
		expect(body.code).toBe('RATE_LIMITED');
		expect(body.details).toEqual({ nextAllowedAt });
	});

	it('refuses an account that is being deleted', async () => {
		const { client } = fakeUserClient(rows, () => ({
			data: { outcome: 'account_deletion_pending', export_id: null },
			error: null
		}));
		const response = await POST(routeEvent(client) as unknown as Event);
		expect(response.status).toBe(409);
		expect(rows).toEqual([]);
	});

	it('fails closed when the request function errors', async () => {
		const { client } = fakeUserClient(rows, () => ({
			data: null,
			error: { code: '42501', message: 'permission denied' }
		}));
		const response = await POST(routeEvent(client) as unknown as Event);
		expect(response.status).toBe(500);
	});
});
