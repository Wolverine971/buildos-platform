// apps/web/src/routes/api/push/devices/server.test.ts
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { RequestEvent } from './$types';

const mocks = vi.hoisted(() => ({
	adminUpsert: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: () => ({
		from: (table: string) => {
			if (table !== 'push_subscriptions') {
				throw new Error(`unexpected admin table ${table}`);
			}
			return {
				upsert: (row: unknown, options: unknown) => {
					mocks.adminUpsert(row, options);
					return {
						select: () => ({
							single: async () => ({ data: { id: 'sub-1' }, error: null })
						})
					};
				}
			};
		}
	})
}));

import { DELETE, GET, POST } from './+server';

const TOKEN = 'ExponentPushToken[abcDEF123_-xyz]';
const USER_ID = 'user-1';

interface UserScopedMock {
	from: Mock<(table: string) => unknown>;
	preferencesUpsert: Mock<(row: Record<string, unknown>, options: unknown) => void>;
	subscriptionsUpsert: Mock<(rows: unknown, options: unknown) => void>;
	deviceUpdate: Mock<(patch: unknown) => void>;
	deviceUpdateFilters: Array<[string, unknown]>;
	deviceSelect: Mock<(columns: string) => void>;
	deviceSelectFilters: Array<[string, unknown]>;
	deviceRows: unknown[];
	updatedRows: unknown[];
}

function createUserScopedSupabase(): UserScopedMock {
	const mock: UserScopedMock = {
		from: vi.fn(),
		preferencesUpsert: vi.fn(),
		subscriptionsUpsert: vi.fn(),
		deviceUpdate: vi.fn(),
		deviceUpdateFilters: [],
		deviceSelect: vi.fn(),
		deviceSelectFilters: [],
		deviceRows: [],
		updatedRows: []
	};

	mock.from.mockImplementation((table: string) => {
		if (table === 'user_notification_preferences') {
			return {
				upsert: (row: Record<string, unknown>, options: unknown) => {
					mock.preferencesUpsert(row, options);
					return {
						select: () => ({
							single: async () => ({
								data: { user_id: row.user_id, push_enabled: row.push_enabled },
								error: null
							})
						})
					};
				}
			};
		}
		if (table === 'notification_subscriptions') {
			return {
				upsert: async (rows: unknown, options: unknown) => {
					mock.subscriptionsUpsert(rows, options);
					return { error: null };
				}
			};
		}
		if (table === 'push_subscriptions') {
			return {
				update: (patch: unknown) => {
					mock.deviceUpdate(patch);
					const chain = {
						eq: (column: string, value: unknown) => {
							mock.deviceUpdateFilters.push([column, value]);
							return chain;
						},
						select: async () => ({ data: mock.updatedRows, error: null })
					};
					return chain;
				},
				select: (columns: string) => {
					mock.deviceSelect(columns);
					const chain = {
						eq: (column: string, value: unknown) => {
							mock.deviceSelectFilters.push([column, value]);
							return chain;
						},
						order: async () => ({ data: mock.deviceRows, error: null })
					};
					return chain;
				}
			};
		}
		throw new Error(`unexpected table ${table}`);
	});

	return mock;
}

function createEvent(
	body: unknown,
	options: { user?: { id: string } | null; headers?: Record<string, string> } = {}
) {
	const supabase = createUserScopedSupabase();
	const user =
		options.user === undefined ? { id: USER_ID, email: 'u@example.com' } : options.user;
	const event = {
		request: new Request('http://localhost/api/push/devices', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
			body: body === undefined ? undefined : JSON.stringify(body)
		}),
		locals: {
			supabase,
			safeGetSession: vi.fn().mockResolvedValue({ user })
		}
	} as unknown as RequestEvent;
	return { event, supabase };
}

beforeEach(() => {
	mocks.adminUpsert.mockClear();
});

describe('POST /api/push/devices', () => {
	it('returns 401 when not signed in', async () => {
		const { event } = createEvent({ token: TOKEN, platform: 'ios' }, { user: null });
		const response = await POST(event);
		expect(response.status).toBe(401);
		expect(mocks.adminUpsert).not.toHaveBeenCalled();
	});

	it.each([
		[
			'web push endpoint as token',
			{ token: 'https://fcm.googleapis.com/fcm/send/abc', platform: 'ios' }
		],
		['unknown platform', { token: TOKEN, platform: 'web' }],
		['missing platform', { token: TOKEN }],
		['device_name too long', { token: TOKEN, platform: 'ios', device_name: 'x'.repeat(121) }],
		['app_version too long', { token: TOKEN, platform: 'android', app_version: 'v'.repeat(41) }]
	])('rejects %s with 400', async (_label, body) => {
		const { event } = createEvent(body);
		const response = await POST(event);
		expect(response.status).toBe(400);
		expect(mocks.adminUpsert).not.toHaveBeenCalled();
	});

	it('rejects a non-JSON body with 400', async () => {
		const { event } = createEvent(undefined);
		const response = await POST(event);
		expect(response.status).toBe(400);
	});

	it('reassigns the token to the verified user as an expo row and enables push', async () => {
		const { event, supabase } = createEvent(
			{ token: TOKEN, platform: 'ios', device_name: "DJ's iPhone", app_version: '1.0.0' },
			{ headers: { 'user-agent': 'BuildOS/1.0 CFNetwork' } }
		);

		const response = await POST(event);
		const json = await response.json();

		expect(response.status).toBe(201);
		expect(json.data).toEqual({ subscription_id: 'sub-1' });

		expect(mocks.adminUpsert).toHaveBeenCalledTimes(1);
		const [row, options] = mocks.adminUpsert.mock.calls[0]!;
		expect(row).toEqual({
			user_id: USER_ID,
			endpoint: TOKEN,
			provider: 'expo',
			platform: 'ios',
			device_name: "DJ's iPhone",
			app_version: '1.0.0',
			p256dh_key: null,
			auth_key: null,
			is_active: true,
			user_agent: 'BuildOS/1.0 CFNetwork',
			last_used_at: null
		});
		expect(options).toEqual({ onConflict: 'endpoint' });

		// push_enabled flips on for the user (same row a browser subscribe writes)...
		expect(supabase.preferencesUpsert).toHaveBeenCalledTimes(1);
		const [prefRow, prefOptions] = supabase.preferencesUpsert.mock.calls[0]!;
		expect(prefRow).toMatchObject({ user_id: USER_ID, push_enabled: true });
		expect(prefOptions).toEqual({ onConflict: 'user_id' });

		// ...and the brief subscriptions exist without overwriting an existing opt-out.
		expect(supabase.subscriptionsUpsert).toHaveBeenCalledTimes(1);
		const [subRows, subOptions] = supabase.subscriptionsUpsert.mock.calls[0]!;
		expect(subRows).toEqual([
			expect.objectContaining({
				user_id: USER_ID,
				event_type: 'brief.completed',
				is_active: true
			}),
			expect.objectContaining({
				user_id: USER_ID,
				event_type: 'brief.failed',
				is_active: true
			})
		]);
		expect(subOptions).toEqual({ onConflict: 'user_id,event_type', ignoreDuplicates: true });
	});

	it('stores null device metadata when the app sends none', async () => {
		const { event } = createEvent({ token: TOKEN, platform: 'android' });

		const response = await POST(event);

		expect(response.status).toBe(201);
		expect(mocks.adminUpsert.mock.calls[0]![0]).toMatchObject({
			platform: 'android',
			device_name: null,
			app_version: null,
			user_agent: null
		});
	});
});

describe('DELETE /api/push/devices', () => {
	it('returns 401 when not signed in', async () => {
		const { event, supabase } = createEvent({ token: TOKEN }, { user: null });
		const response = await DELETE(event);
		expect(response.status).toBe(401);
		expect(supabase.deviceUpdate).not.toHaveBeenCalled();
	});

	it('rejects a missing token with 400', async () => {
		const { event } = createEvent({});
		expect((await DELETE(event)).status).toBe(400);
	});

	it("deactivates only the signed-in user's row for that token", async () => {
		const { event, supabase } = createEvent({ token: TOKEN });
		supabase.updatedRows = [{ id: 'sub-1' }];

		const response = await DELETE(event);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.data).toEqual({ removed: true });
		expect(supabase.deviceUpdate).toHaveBeenCalledWith({ is_active: false });
		expect(supabase.deviceUpdateFilters).toEqual([
			['endpoint', TOKEN],
			['user_id', USER_ID]
		]);
	});

	it('reports removed:false when no row matched', async () => {
		const { event, supabase } = createEvent({ token: TOKEN });
		supabase.updatedRows = [];

		const json = await (await DELETE(event)).json();

		expect(json.data).toEqual({ removed: false });
	});
});

describe('GET /api/push/devices', () => {
	it('returns 401 when not signed in', async () => {
		const { event } = createEvent(undefined, { user: null });
		expect((await GET(event)).status).toBe(401);
	});

	it('lists active devices with a hint instead of the token', async () => {
		const { event, supabase } = createEvent(undefined);
		supabase.deviceRows = [
			{
				id: 'sub-1',
				provider: 'expo',
				platform: 'ios',
				device_name: "DJ's iPhone",
				app_version: '1.0.0',
				created_at: '2026-10-28T12:00:00.000Z',
				last_used_at: null,
				endpoint: TOKEN
			},
			{
				id: 'sub-2',
				provider: 'web_push',
				platform: 'web',
				device_name: null,
				app_version: null,
				created_at: '2026-10-01T12:00:00.000Z',
				last_used_at: '2026-10-27T06:00:00.000Z',
				endpoint: 'https://fcm.googleapis.com/fcm/send/abcdef123456'
			}
		];

		const response = await GET(event);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(supabase.deviceSelectFilters).toEqual([
			['user_id', USER_ID],
			['is_active', true]
		]);
		expect(json.data.devices).toEqual([
			{
				id: 'sub-1',
				provider: 'expo',
				platform: 'ios',
				device_name: "DJ's iPhone",
				app_version: '1.0.0',
				created_at: '2026-10-28T12:00:00.000Z',
				last_used_at: null,
				endpoint_hint: '3_-xyz'
			},
			{
				id: 'sub-2',
				provider: 'web_push',
				platform: 'web',
				device_name: null,
				app_version: null,
				created_at: '2026-10-01T12:00:00.000Z',
				last_used_at: '2026-10-27T06:00:00.000Z',
				endpoint_hint: '123456'
			}
		]);
		expect(JSON.stringify(json)).not.toContain(TOKEN);
		expect(JSON.stringify(json)).not.toContain('fcm.googleapis.com');
	});
});
