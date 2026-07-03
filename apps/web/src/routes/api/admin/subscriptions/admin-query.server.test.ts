import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock, getSubscriptionOverviewMock } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn(),
	getSubscriptionOverviewMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('$lib/services/admin/dashboard-analytics.service', () => ({
	getSubscriptionOverview: getSubscriptionOverviewMock
}));

import { GET as overviewGET } from './overview/+server';
import { GET as usersGET } from './users/+server';

function createQuery(result: { data?: unknown[] | null; error?: unknown; count?: number | null }) {
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		in: vi.fn(() => query),
		not: vi.fn(() => query),
		or: vi.fn(() => query),
		range: vi.fn(() => query),
		order: vi.fn(() => query),
		single: vi.fn(async () => ({
			data: result.data?.[0] ?? null,
			error: result.error ?? null
		})),
		then: (onFulfilled: any, onRejected: any) =>
			Promise.resolve({
				data: result.data ?? [],
				error: result.error ?? null,
				count: result.count ?? result.data?.length ?? 0
			}).then(onFulfilled, onRejected)
	};

	return query;
}

function createRequestSupabase() {
	return {
		from: vi.fn((table: string) => {
			if (table !== 'users') {
				throw new Error(`Request client should not query ${table}`);
			}
			return createQuery({ data: [{ is_admin: true }], error: null });
		})
	};
}

function createAdminSupabase(resultsByTable: Record<string, { data: unknown[]; count?: number }>) {
	const queriesByTable = new Map<string, any[]>();
	const adminSupabase = {
		from: vi.fn((table: string) => {
			const result = resultsByTable[table] ?? { data: [] };
			const query = createQuery({ data: result.data, error: null, count: result.count });
			queriesByTable.set(table, [...(queriesByTable.get(table) ?? []), query]);
			return query;
		}),
		queriesByTable
	};

	return adminSupabase;
}

describe('admin subscription query routes', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('filters subscription users by status before applying pagination', async () => {
		const adminSupabase = createAdminSupabase({
			customer_subscriptions: {
				data: [{ user_id: 'user-2', status: 'active' }]
			},
			users: {
				data: [
					{
						id: 'user-2',
						email: 'active@example.com',
						name: 'Active User',
						payment_methods: [],
						billing_accounts: [],
						customer_subscriptions: [{ id: 'sub-1', status: 'active' }]
					}
				],
				count: 1
			}
		});
		createAdminSupabaseClientMock.mockReturnValue(adminSupabase);
		const requestSupabase = createRequestSupabase();

		const response = await usersGET({
			url: new URL('http://localhost/api/admin/subscriptions/users?status=active&page=1&limit=1'),
			locals: {
				supabase: requestSupabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
			}
		} as any);
		const payload = await response.json();
		const usersQuery = adminSupabase.queriesByTable.get('users')?.[0];

		expect(response.status).toBe(200);
		expect(payload.data.users).toHaveLength(1);
		expect(payload.data.pagination).toMatchObject({ total: 1, totalPages: 1 });
		expect(requestSupabase.from).toHaveBeenCalledTimes(1);
		expect(adminSupabase.from).toHaveBeenCalledWith('customer_subscriptions');
		expect(adminSupabase.from).toHaveBeenCalledWith('users');
		expect(usersQuery.in).toHaveBeenCalledWith('id', ['user-2']);
		expect(usersQuery.range).toHaveBeenCalledWith(0, 0);
	});

	it('filters unsubscribed users before applying pagination', async () => {
		const adminSupabase = createAdminSupabase({
			customer_subscriptions: {
				data: [{ user_id: 'subscribed-user', status: 'active' }]
			},
			users: {
				data: [
					{
						id: 'free-user',
						email: 'free@example.com',
						name: 'Free User',
						payment_methods: [],
						billing_accounts: [],
						customer_subscriptions: []
					}
				],
				count: 1
			}
		});
		createAdminSupabaseClientMock.mockReturnValue(adminSupabase);

		const response = await usersGET({
			url: new URL('http://localhost/api/admin/subscriptions/users?status=none&page=1&limit=10'),
			locals: {
				supabase: createRequestSupabase(),
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
			}
		} as any);
		const payload = await response.json();
		const usersQuery = adminSupabase.queriesByTable.get('users')?.[0];

		expect(response.status).toBe(200);
		expect(payload.data.users[0]).toMatchObject({ id: 'free-user' });
		expect(payload.data.pagination).toMatchObject({ total: 1, totalPages: 1 });
		expect(usersQuery.not).toHaveBeenCalledWith('id', 'in', '(subscribed-user)');
		expect(usersQuery.range).toHaveBeenCalledWith(0, 9);
	});

	it('uses service-role reads for subscription overview after admin auth', async () => {
		const adminSupabase = { from: vi.fn(), rpc: vi.fn() };
		createAdminSupabaseClientMock.mockReturnValue(adminSupabase);
		getSubscriptionOverviewMock.mockResolvedValue({ overview: { active_subscriptions: 1 } });
		const requestSupabase = createRequestSupabase();

		const response = await overviewGET({
			locals: {
				supabase: requestSupabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(requestSupabase.from).toHaveBeenCalledTimes(1);
		expect(getSubscriptionOverviewMock).toHaveBeenCalledWith(adminSupabase);
	});
});
