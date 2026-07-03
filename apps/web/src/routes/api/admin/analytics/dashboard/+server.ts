// apps/web/src/routes/api/admin/analytics/dashboard/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	getDashboardAnalytics,
	getDashboardAnalyticsDetails,
	getDashboardAnalyticsSummary,
	type AnalyticsTimeframe,
	type DashboardAnalyticsPartialPayload,
	type DashboardAnalyticsPayload
} from '$lib/services/admin/dashboard-analytics.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

const DASHBOARD_CACHE_TTL_MS = 30_000;
type DashboardAnalyticsScope = 'full' | 'summary' | 'details';

type DashboardCacheEntry = {
	expiresAt: number;
	data?: DashboardAnalyticsPayload | DashboardAnalyticsPartialPayload;
	promise?: Promise<DashboardAnalyticsPayload | DashboardAnalyticsPartialPayload>;
};

const dashboardCache = new Map<string, DashboardCacheEntry>();

function getCacheKey(timeframe: AnalyticsTimeframe, scope: DashboardAnalyticsScope) {
	return `${scope}:${timeframe}`;
}

function loadDashboardAnalyticsScope(
	supabase: Parameters<typeof getDashboardAnalytics>[0],
	timeframe: AnalyticsTimeframe,
	scope: DashboardAnalyticsScope
) {
	if (scope === 'summary') {
		return getDashboardAnalyticsSummary(supabase, timeframe);
	}
	if (scope === 'details') {
		return getDashboardAnalyticsDetails(supabase, timeframe);
	}
	return getDashboardAnalytics(supabase, timeframe);
}

async function getCachedDashboardAnalytics(
	supabase: Parameters<typeof getDashboardAnalytics>[0],
	timeframe: AnalyticsTimeframe,
	scope: DashboardAnalyticsScope,
	bypassCache: boolean
) {
	const now = Date.now();
	const cacheKey = getCacheKey(timeframe, scope);
	const cached = dashboardCache.get(cacheKey);

	if (!bypassCache) {
		if (cached?.data && cached.expiresAt > now) {
			return cached.data;
		}
		if (cached?.promise) {
			return cached.promise;
		}
	}

	const promise = loadDashboardAnalyticsScope(supabase, timeframe, scope)
		.then((data) => {
			dashboardCache.set(cacheKey, {
				data,
				expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS
			});
			return data;
		})
		.catch((err) => {
			if (dashboardCache.get(cacheKey)?.promise === promise) {
				dashboardCache.delete(cacheKey);
			}
			throw err;
		});

	dashboardCache.set(cacheKey, {
		promise,
		expiresAt: now + DASHBOARD_CACHE_TTL_MS
	});

	return promise;
}

export const GET: RequestHandler = async ({ url, locals: { safeGetSession } }) => {
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
	const scopeParam = url.searchParams.get('scope');
	const scope: DashboardAnalyticsScope =
		scopeParam === 'summary' || scopeParam === 'details' ? scopeParam : 'full';
	const bypassCache = url.searchParams.get('fresh') === '1';

	try {
		const adminSupabase = createAdminSupabaseClient();
		const data = await getCachedDashboardAnalytics(
			adminSupabase,
			timeframe,
			scope,
			bypassCache
		);
		return ApiResponse.success(
			data,
			undefined,
			bypassCache
				? {
						public: false,
						maxAge: 0,
						mustRevalidate: true
					}
				: {
						public: false,
						maxAge: 15,
						staleWhileRevalidate: 30
					}
		);
	} catch (err) {
		console.error('[Admin Analytics] Failed to build dashboard payload:', err);
		return ApiResponse.internalError(err, 'Failed to load analytics dashboard data');
	}
};
