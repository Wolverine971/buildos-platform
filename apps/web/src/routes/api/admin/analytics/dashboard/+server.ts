// apps/web/src/routes/api/admin/analytics/dashboard/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	getDashboardAnalytics,
	type AnalyticsTimeframe,
	type DashboardAnalyticsPayload
} from '$lib/services/admin/dashboard-analytics.service';

const DASHBOARD_CACHE_TTL_MS = 30_000;

type DashboardCacheEntry = {
	expiresAt: number;
	data?: DashboardAnalyticsPayload;
	promise?: Promise<DashboardAnalyticsPayload>;
};

const dashboardCache = new Map<AnalyticsTimeframe, DashboardCacheEntry>();

async function getCachedDashboardAnalytics(
	supabase: Parameters<typeof getDashboardAnalytics>[0],
	timeframe: AnalyticsTimeframe,
	bypassCache: boolean
) {
	const now = Date.now();
	const cached = dashboardCache.get(timeframe);

	if (!bypassCache) {
		if (cached?.data && cached.expiresAt > now) {
			return cached.data;
		}
		if (cached?.promise) {
			return cached.promise;
		}
	}

	const promise = getDashboardAnalytics(supabase, timeframe)
		.then((data) => {
			dashboardCache.set(timeframe, {
				data,
				expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS
			});
			return data;
		})
		.catch((err) => {
			if (dashboardCache.get(timeframe)?.promise === promise) {
				dashboardCache.delete(timeframe);
			}
			throw err;
		});

	dashboardCache.set(timeframe, {
		promise,
		expiresAt: now + DASHBOARD_CACHE_TTL_MS
	});

	return promise;
}

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const timeframeParam = url.searchParams.get('timeframe') as AnalyticsTimeframe | null;
	const timeframe: AnalyticsTimeframe =
		timeframeParam === '7d' || timeframeParam === '90d' ? timeframeParam : '30d';
	const bypassCache = url.searchParams.get('fresh') === '1';

	try {
		const data = await getCachedDashboardAnalytics(supabase, timeframe, bypassCache);
		return ApiResponse.success(data, undefined, {
			public: false,
			maxAge: 15,
			staleWhileRevalidate: 30
		});
	} catch (err) {
		console.error('[Admin Analytics] Failed to build dashboard payload:', err);
		return ApiResponse.internalError(err, 'Failed to load analytics dashboard data');
	}
};
