import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getUserDashboardAnalytics } from '$lib/services/dashboard/user-dashboard-analytics.service';
import { createEmptyUserDashboardAnalytics } from '$lib/types/dashboard-analytics';
import { preflightProjectVisibility } from '$lib/server/project-visibility';

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
		throw redirect(303, '/auth/login?redirect=%2Fdashboard');
	}

	// Skip expensive analytics for users still in onboarding only when they truly
	// have no projects yet. Some existing users can have projects even with
	// onboarding_completed_at=null and should still see dashboard project data.
	if (!user.onboarding_completed_at) {
		const projectVisibility = await measure('dashboard.preflight.has_projects', () =>
			preflightProjectVisibility(supabase, user.id)
		);
		if (projectVisibility.hasProjects) {
			try {
				const dashboard = await measure('dashboard.analytics', () =>
					getUserDashboardAnalytics(
						supabase,
						user.id,
						serverTiming,
						projectVisibility.actorId
					)
				);

				return {
					user,
					dashboard
				};
			} catch (error) {
				console.error('[Dashboard] Failed to load dashboard analytics:', error);
				return {
					user,
					dashboard: createEmptyUserDashboardAnalytics()
				};
			}
		}

		return {
			user,
			dashboard: createEmptyUserDashboardAnalytics()
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
	} catch (error) {
		console.error('[Dashboard] Failed to load dashboard analytics:', error);
		return {
			user,
			dashboard: createEmptyUserDashboardAnalytics()
		};
	}
};
