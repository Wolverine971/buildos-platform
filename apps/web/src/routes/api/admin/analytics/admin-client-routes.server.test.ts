// apps/web/src/routes/api/admin/analytics/admin-client-routes.server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	createAdminSupabaseClientMock,
	getComprehensiveAnalyticsMock,
	getDashboardAnalyticsMock,
	getDashboardAnalyticsDetailsMock,
	getDashboardAnalyticsSummaryMock
} = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn(),
	getComprehensiveAnalyticsMock: vi.fn(),
	getDashboardAnalyticsMock: vi.fn(),
	getDashboardAnalyticsDetailsMock: vi.fn(),
	getDashboardAnalyticsSummaryMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('$lib/services/admin/dashboard-analytics.service', () => ({
	getComprehensiveAnalytics: getComprehensiveAnalyticsMock,
	getDashboardAnalytics: getDashboardAnalyticsMock,
	getDashboardAnalyticsDetails: getDashboardAnalyticsDetailsMock,
	getDashboardAnalyticsSummary: getDashboardAnalyticsSummaryMock
}));

import { GET as comprehensiveGET } from './comprehensive/+server';
import { GET as dashboardGET } from './dashboard/+server';

function createEvent(url: string) {
	return {
		url: new URL(url),
		locals: {
			supabase: {
				from: vi.fn(() => {
					throw new Error('Request client should not be used for admin analytics reads');
				})
			},
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1', is_admin: true } })
		}
	} as any;
}

describe('admin analytics routes', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getComprehensiveAnalyticsMock.mockResolvedValue({ totals: {} });
		getDashboardAnalyticsMock.mockResolvedValue({ totals: {} });
		getDashboardAnalyticsDetailsMock.mockResolvedValue({ details: {} });
		getDashboardAnalyticsSummaryMock.mockResolvedValue({ summary: {} });
	});

	it('uses the service-role client for dashboard analytics reads', async () => {
		const adminSupabase = { from: vi.fn() };
		createAdminSupabaseClientMock.mockReturnValue(adminSupabase);

		const response = await dashboardGET(
			createEvent('http://localhost/api/admin/analytics/dashboard?timeframe=30d&fresh=1')
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(createAdminSupabaseClientMock).toHaveBeenCalledTimes(1);
		expect(getDashboardAnalyticsMock).toHaveBeenCalledWith(adminSupabase, '30d');
	});

	it('uses the service-role client for comprehensive analytics reads', async () => {
		const adminSupabase = { from: vi.fn() };
		createAdminSupabaseClientMock.mockReturnValue(adminSupabase);

		const response = await comprehensiveGET(
			createEvent('http://localhost/api/admin/analytics/comprehensive?timeframe=90d')
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(createAdminSupabaseClientMock).toHaveBeenCalledTimes(1);
		expect(getComprehensiveAnalyticsMock).toHaveBeenCalledWith(adminSupabase, '90d');
	});
});
