// apps/web/src/routes/api/admin/chat/admin-client-routes.server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	createAdminSupabaseClientMock,
	getAdminChatDashboardAnalyticsMock,
	getAdminLlmUsageStatsMock
} = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn(),
	getAdminChatDashboardAnalyticsMock: vi.fn(),
	getAdminLlmUsageStatsMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('$lib/server/admin-chat-dashboard-analytics', () => ({
	getAdminChatDashboardAnalytics: getAdminChatDashboardAnalyticsMock
}));

vi.mock('$lib/server/admin-llm-usage-analytics', () => ({
	getAdminLlmUsageStats: getAdminLlmUsageStatsMock
}));

import { GET as agentsGET } from './agents/+server';
import { GET as costsGET } from './costs/+server';
import { GET as dashboardGET } from './dashboard/+server';
import { GET as domainsGET } from './domains/+server';
import { GET as exportGET } from './export/+server';
import { GET as timingGET } from './timing/+server';
import { GET as toolsGET } from './tools/+server';

function createQuery(result: { data?: unknown[] | null; error?: unknown; count?: number | null }) {
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		gt: vi.fn(() => query),
		gte: vi.fn(() => query),
		lte: vi.fn(() => query),
		not: vi.fn(() => query),
		or: vi.fn(() => query),
		is: vi.fn(() => query),
		in: vi.fn(() => query),
		order: vi.fn(() => query),
		range: vi.fn(() => query),
		single: vi.fn(async () => ({
			data: result.data?.[0] ?? null,
			error: result.error ?? null
		})),
		then: (onFulfilled: any, onRejected: any) =>
			Promise.resolve({
				data: result.data ?? [],
				error: result.error ?? null,
				count: result.count ?? 0
			}).then(onFulfilled, onRejected)
	};

	return query;
}

function createRequestSupabase() {
	return {
		from: vi.fn((table: string) => {
			if (table !== 'admin_users') {
				throw new Error(`Request client should not query ${table}`);
			}
			return createQuery({ data: [{ user_id: 'admin-1' }], error: null });
		})
	};
}

function createAdminSupabase() {
	const queriesByTable = new Map<string, any[]>();
	const adminSupabase = {
		from: vi.fn((table: string) => {
			const query = createQuery({ data: [], error: null, count: 0 });
			queriesByTable.set(table, [...(queriesByTable.get(table) ?? []), query]);
			return query;
		}),
		queriesByTable
	};

	return adminSupabase;
}

function createEvent(url: string) {
	return {
		url: new URL(url),
		locals: {
			supabase: createRequestSupabase(),
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
		}
	} as any;
}

describe('admin chat telemetry routes', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getAdminChatDashboardAnalyticsMock.mockResolvedValue({ kpis: {} });
		getAdminLlmUsageStatsMock.mockResolvedValue({ overview: {} });
	});

	it.each([
		['dashboard', dashboardGET, 'http://localhost/api/admin/chat/dashboard?timeframe=7d'],
		['agents', agentsGET, 'http://localhost/api/admin/chat/agents?timeframe=7d'],
		['costs', costsGET, 'http://localhost/api/admin/chat/costs?timeframe=7d'],
		['domains', domainsGET, 'http://localhost/api/admin/chat/domains?timeframe=7d'],
		['tools', toolsGET, 'http://localhost/api/admin/chat/tools?timeframe=7d'],
		['timing', timingGET, 'http://localhost/api/admin/chat/timing?timeframe=7d'],
		['export', exportGET, 'http://localhost/api/admin/chat/export?timeframe=7d&format=json']
	])('uses service-role reads for %s after admin auth', async (name, handler, url) => {
		const adminSupabase = createAdminSupabase();
		createAdminSupabaseClientMock.mockReturnValue(adminSupabase);
		const event = createEvent(url);

		const response = await handler(event);

		expect(response.status).toBe(200);
		expect(event.locals.supabase.from).toHaveBeenCalledTimes(1);
		expect(event.locals.supabase.from).toHaveBeenCalledWith('admin_users');
		expect(createAdminSupabaseClientMock).toHaveBeenCalledTimes(1);
		if (name === 'dashboard' || name === 'agents') {
			expect(getAdminChatDashboardAnalyticsMock).toHaveBeenCalledWith(adminSupabase, '7d');
		} else {
			expect(adminSupabase.from).toHaveBeenCalled();
		}
	});
});
