import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

import { GET } from './+server';

function createQuery(result: { data?: unknown[] | null; error?: { message?: string } | null }) {
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		gt: vi.fn(() => query),
		gte: vi.fn(() => query),
		lte: vi.fn(() => query),
		single: vi.fn(async () => ({
			data: result.data?.[0] ?? null,
			error: result.error ?? null
		})),
		then: (onFulfilled: any, onRejected: any) =>
			Promise.resolve({
				data: result.data ?? [],
				error: result.error ?? null
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

function createAdminSupabase(options: { invoiceError?: { message: string } } = {}) {
	const adminSupabase = {
		from: vi.fn((table: string) => {
			if (table === 'invoices') {
				return createQuery({
					data: [{ amount_paid: 1200, amount_refunded: 0, metadata: {} }],
					error: options.invoiceError ?? null
				});
			}
			if (table === 'customer_subscriptions') {
				return createQuery({ data: [], error: null });
			}
			throw new Error(`Unexpected admin table: ${table}`);
		}),
		rpc: vi.fn(async (name: string) => {
			if (name !== 'get_revenue_metrics') {
				return { data: null, error: { message: `Unexpected RPC: ${name}` } };
			}
			return {
				data: [
					{
						current_mrr: 42,
						average_revenue_per_user: 21,
						lifetime_value: 120
					}
				],
				error: null
			};
		})
	};

	return adminSupabase;
}

describe('GET /api/admin/revenue', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('uses service-role reads for revenue data after admin auth', async () => {
		const adminSupabase = createAdminSupabase();
		createAdminSupabaseClientMock.mockReturnValue(adminSupabase);
		const requestSupabase = createRequestSupabase();

		const response = await GET({
			url: new URL('http://localhost/api/admin/revenue?period=month&year=2026&month=7'),
			locals: {
				supabase: requestSupabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(requestSupabase.from).toHaveBeenCalledTimes(1);
		expect(adminSupabase.from).toHaveBeenCalledWith('invoices');
		expect(adminSupabase.from).toHaveBeenCalledWith('customer_subscriptions');
		expect(adminSupabase.rpc).toHaveBeenCalledWith('get_revenue_metrics');
	});

	it('surfaces billing query failures instead of silently returning zeroed revenue', async () => {
		const adminSupabase = createAdminSupabase({ invoiceError: { message: 'RLS denied' } });
		createAdminSupabaseClientMock.mockReturnValue(adminSupabase);

		const response = await GET({
			url: new URL('http://localhost/api/admin/revenue?period=month&year=2026&month=7'),
			locals: {
				supabase: createRequestSupabase(),
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(500);
		expect(payload.success).toBe(false);
	});
});
