// apps/web/src/routes/+page.server.ts
/**
 * Main page server load
 *
 * Authenticated users receive dashboard analytics payload.
 * Unauthenticated users receive landing page payload only.
 */

import type { PageServerLoad } from './$types';
import { getUserDashboardAnalytics } from '$lib/services/dashboard/user-dashboard-analytics.service';
import { createEmptyUserDashboardAnalytics } from '$lib/types/dashboard-analytics';

export const load: PageServerLoad = async ({
	locals: { safeGetSession, supabase, serverTiming },
	depends
}) => {
	depends('app:auth');
	depends('dashboard:analytics');

	const measure = <T>(name: string, fn: () => Promise<T> | T) =>
		serverTiming ? serverTiming.measure(name, fn) : fn();

	const { user } = await safeGetSession();

	if (!user) {
		return {
			user: null,
			dashboard: null
		};
	}

	try {
		const dashboard = await measure('dashboard.analytics', () =>
			getUserDashboardAnalytics(supabase, user.id, serverTiming)
		);

		return {
			user,
			dashboard
		};
	} catch (err) {
		console.error('[Dashboard] Failed to load dashboard analytics:', err);
		return {
			user,
			dashboard: createEmptyUserDashboardAnalytics()
		};
	}
};
