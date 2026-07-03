// apps/web/src/routes/admin/+page.server.ts
import type { PageServerLoad } from './$types';
import type {
	AnalyticsTimeframe,
	DashboardAnalyticsPayload
} from '$lib/services/admin/dashboard-analytics.service';

type AdminPageServerData = {
	initialDashboard: DashboardAnalyticsPayload | null;
	defaultTimeframe: AnalyticsTimeframe;
	loadError: string | null;
};

export const load: PageServerLoad = async ({ url }) => {
	const timeframeParam = url.searchParams.get('timeframe') as AnalyticsTimeframe | null;
	const timeframe: AnalyticsTimeframe =
		timeframeParam === '7d' || timeframeParam === '90d' ? timeframeParam : '30d';

	return {
		initialDashboard: null,
		defaultTimeframe: timeframe,
		loadError: null
	} satisfies AdminPageServerData;
};
