// apps/web/src/routes/admin/+page.server.ts
import type { PageServerLoad } from './$types';
import {
	getDashboardAnalytics,
	type AnalyticsTimeframe
} from '$lib/services/admin/dashboard-analytics.service';

export const load: PageServerLoad = async ({ locals, url }) => {
	const timeframeParam = url.searchParams.get('timeframe') as AnalyticsTimeframe | null;
	const timeframe: AnalyticsTimeframe =
		timeframeParam === '7d' || timeframeParam === '90d' ? timeframeParam : '30d';

	try {
		const data = await getDashboardAnalytics(locals.supabase, timeframe);
		return {
			initialDashboard: data,
			defaultTimeframe: timeframe
		};
	} catch (err) {
		console.error('[Admin Page] Failed to preload analytics dashboard', err);
		return {
			initialDashboard: null,
			defaultTimeframe: timeframe,
			loadError: 'Failed to preload analytics'
		};
	}
};
