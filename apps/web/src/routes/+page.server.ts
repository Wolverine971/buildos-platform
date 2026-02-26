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
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

async function hasAnyProjects(
	supabase: Parameters<PageServerLoad>[0]['locals']['supabase'],
	userId: string
): Promise<boolean> {
	try {
		const actorId = await ensureActorId(supabase, userId);

		const { count: memberCount, error: memberError } = await supabase
			.from('onto_project_members')
			.select('id', { count: 'exact', head: true })
			.eq('actor_id', actorId)
			.is('removed_at', null);

		if (!memberError && (memberCount ?? 0) > 0) {
			return true;
		}

		if (memberError) {
			console.warn('[Dashboard] Failed to count project memberships:', memberError);
		}

		const { count: ownedCount, error: ownedError } = await supabase
			.from('onto_projects')
			.select('id', { count: 'exact', head: true })
			.eq('created_by', actorId)
			.is('deleted_at', null);

		if (ownedError) {
			console.warn('[Dashboard] Failed to count owned projects:', ownedError);
			return false;
		}

		return (ownedCount ?? 0) > 0;
	} catch (error) {
		console.warn('[Dashboard] Failed to preflight project visibility:', error);
		return false;
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
		return {
			user: null,
			dashboard: null
		};
	}

	// Skip expensive analytics for users still in onboarding only when they truly
	// have no projects yet. Some existing users can have projects even with
	// completed_onboarding=false and should still see dashboard project data.
	if (!user.completed_onboarding) {
		const hasProjects = await measure('dashboard.preflight.has_projects', () =>
			hasAnyProjects(supabase, user.id)
		);
		if (hasProjects) {
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
	} catch (err) {
		console.error('[Dashboard] Failed to load dashboard analytics:', err);
		return {
			user,
			dashboard: createEmptyUserDashboardAnalytics()
		};
	}
};
