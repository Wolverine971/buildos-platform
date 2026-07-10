import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getUserDashboardAnalytics } from '$lib/services/dashboard/user-dashboard-analytics.service';
import { createEmptyUserDashboardAnalytics } from '$lib/types/dashboard-analytics';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

type ProjectVisibilityPreflight = {
	hasProjects: boolean;
	actorId: string | null;
};

async function preflightProjectVisibility(
	supabase: Parameters<PageServerLoad>[0]['locals']['supabase'],
	userId: string
): Promise<ProjectVisibilityPreflight> {
	try {
		const actorId = await ensureActorId(supabase, userId);

		const [memberResult, ownedResult] = await Promise.all([
			supabase
				.from('onto_project_members')
				.select('id', { count: 'exact', head: true })
				.eq('actor_id', actorId)
				.is('removed_at', null),
			supabase
				.from('onto_projects')
				.select('id', { count: 'exact', head: true })
				.eq('created_by', actorId)
				.is('deleted_at', null)
		]);

		if (memberResult.error) {
			console.warn('[Dashboard] Failed to count project memberships:', memberResult.error);
		}
		if (ownedResult.error) {
			console.warn('[Dashboard] Failed to count owned projects:', ownedResult.error);
		}

		if ((memberResult.count ?? 0) > 0) {
			return { hasProjects: true, actorId };
		}
		if (memberResult.error && ownedResult.error) {
			return { hasProjects: false, actorId };
		}
		return { hasProjects: (ownedResult.count ?? 0) > 0, actorId };
	} catch (error) {
		console.warn('[Dashboard] Failed to preflight project visibility:', error);
		return { hasProjects: false, actorId: null };
	}
}

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
