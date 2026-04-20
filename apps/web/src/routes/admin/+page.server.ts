// apps/web/src/routes/admin/+page.server.ts
import type { PageServerLoad } from './$types';
import type { AnalyticsTimeframe } from '$lib/services/admin/dashboard-analytics.service';

export const load: PageServerLoad = async ({ url }) => {
	const timeframeParam = url.searchParams.get('timeframe') as AnalyticsTimeframe | null;
	const timeframe: AnalyticsTimeframe =
		timeframeParam === '7d' || timeframeParam === '90d' ? timeframeParam : '30d';

	return {
		initialDashboard: null,
		defaultTimeframe: timeframe
	};
};
