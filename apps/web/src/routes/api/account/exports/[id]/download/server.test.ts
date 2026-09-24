// apps/web/src/routes/api/account/exports/[id]/download/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from './$types';
import { exportRow, fakeUserClient, routeEvent } from '$lib/test-helpers/fake-user-data-exports';

const createSignedUrl = vi.fn();
vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: () => ({
		storage: {
			from: (bucket: string) => ({
				createSignedUrl: (...args: unknown[]) => createSignedUrl(bucket, ...args)
			})
		}
	})
}));
vi.mock('$lib/server/route-error', async () => {
	const { ApiResponse } = await import('$lib/utils/api-response');
	return {
		routeErrorResponse: vi.fn(async () =>
			ApiResponse.error('Could not prepare your download', 500)
		)
	};
});

import { GET } from './+server';

type Event = Parameters<RequestHandler>[0];
const EXPORT_ID = '33333333-3333-4333-8333-333333333333';
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function readyRow(overrides: Parameters<typeof exportRow>[0] = {}) {
	return exportRow({
		id: EXPORT_ID,
		status: 'ready',
		storage_path: `user-1/${EXPORT_ID}.zip`,
		part_count: 1,
		byte_size: 2048,
		completed_at: '2026-09-24T12:00:00.000Z',
		expires_at: inDays(7),
		...overrides
	});
}

function download(
	rows: ReturnType<typeof exportRow>[],
	options: { userId?: string | null; part?: string; id?: string } = {}
) {
	const { client } = fakeUserClient(rows);
	const id = options.id ?? EXPORT_ID;
	const query = options.part === undefined ? '' : `?part=${options.part}`;
	return GET(
		routeEvent(client, {
			userId: options.userId,
			params: { id },
			url: `https://build-os.test/api/account/exports/${id}/download${query}`
		}) as unknown as Event
	);
}

describe('GET /api/account/exports/[id]/download', () => {
	beforeEach(() => {
		createSignedUrl.mockReset();
		createSignedUrl.mockResolvedValue({
			data: { signedUrl: 'https://storage.test/signed?token=t' },
			error: null
		});
	});

	it('requires a session', async () => {
		const response = await download([readyRow()], { userId: null });
		expect(response.status).toBe(401);
		expect(createSignedUrl).not.toHaveBeenCalled();
	});

	it('redirects the owner to a one-hour signed URL for the zip', async () => {
		const response = await download([readyRow()]);

		expect(response.status).toBe(303);
		expect(response.headers.get('location')).toBe('https://storage.test/signed?token=t');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(createSignedUrl).toHaveBeenCalledWith(
			'user-exports',
			`user-1/${EXPORT_ID}.zip`,
			3600,
			{
				download: 'buildos-data-2026-09-24.zip'
			}
		);
	});

	it('signs later parts by their part name', async () => {
		const response = await download([readyRow({ part_count: 3 })], { part: '2' });
		expect(response.status).toBe(303);
		expect(createSignedUrl).toHaveBeenCalledWith(
			'user-exports',
			`user-1/${EXPORT_ID}.part2.zip`,
			3600,
			{ download: 'buildos-data-2026-09-24-part2.zip' }
		);
	});

	it('does not reveal or sign another user’s export', async () => {
		const response = await download([
			readyRow({ user_id: 'user-2', storage_path: `user-2/${EXPORT_ID}.zip` })
		]);
		expect(response.status).toBe(404);
		expect(createSignedUrl).not.toHaveBeenCalled();
	});

	it.each([
		['status expired', { status: 'expired', storage_path: null }],
		['window passed', { expires_at: inDays(-1) }]
	])('answers 410 once the download expired (%s)', async (_label, overrides) => {
		const response = await download([readyRow(overrides)]);
		expect(response.status).toBe(410);
		expect(createSignedUrl).not.toHaveBeenCalled();
	});

	it.each(['queued', 'running', 'failed'])(
		'answers 409 while the export is %s',
		async (status) => {
			const response = await download([
				exportRow({ id: EXPORT_ID, status, expires_at: null, storage_path: null })
			]);
			expect(response.status).toBe(409);
			expect(createSignedUrl).not.toHaveBeenCalled();
		}
	);

	it('rejects parts that do not exist and malformed input', async () => {
		expect((await download([readyRow({ part_count: 2 })], { part: '3' })).status).toBe(404);
		expect((await download([readyRow()], { part: '0' })).status).toBe(400);
		expect((await download([readyRow()], { part: 'x' })).status).toBe(400);
		expect((await download([readyRow()], { id: 'not-a-uuid' })).status).toBe(404);
		expect(createSignedUrl).not.toHaveBeenCalled();
	});

	it('fails closed when signing fails', async () => {
		createSignedUrl.mockResolvedValue({ data: null, error: { message: 'boom' } });
		expect((await download([readyRow()])).status).toBe(500);
	});
});
