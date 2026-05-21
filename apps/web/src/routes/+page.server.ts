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

type PendingProjectInvite = {
	invite_id: string;
	project_id: string | null;
	project_name: string;
	role_key: string | null;
	access: string | null;
	status: string;
	expires_at: string | null;
	created_at: string | null;
	declined_at?: string | null;
	recoverable_until?: string | null;
	can_accept?: boolean | null;
	invited_by_name?: string | null;
	invited_by_email?: string | null;
};

async function hasAnyProjects(
	supabase: Parameters<PageServerLoad>[0]['locals']['supabase'],
	userId: string
): Promise<boolean> {
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

		if ((memberResult.count ?? 0) > 0) return true;
		if (memberResult.error && ownedResult.error) return false;
		return (ownedResult.count ?? 0) > 0;
	} catch (error) {
		console.warn('[Dashboard] Failed to preflight project visibility:', error);
		return false;
	}
}

async function listPendingProjectInvites(
	supabase: Parameters<PageServerLoad>[0]['locals']['supabase']
): Promise<PendingProjectInvite[]> {
	const { data, error } = await supabase.rpc('list_pending_project_invites');

	if (error) {
		console.warn('[Dashboard] Failed to load pending project invites:', error);
		return [];
	}

	return (data ?? []) as unknown as PendingProjectInvite[];
}

export const load: PageServerLoad = async ({
	locals: { safeGetSession, supabase, serverTiming },
	depends
}) => {
	depends('app:auth');
	depends('app:invites');
	depends('dashboard:analytics');

	const measure = <T>(name: string, fn: () => Promise<T> | T) =>
		serverTiming ? serverTiming.measure(name, fn) : fn();

	const { user } = await safeGetSession();

	if (!user) {
		return {
			user: null,
			dashboard: null,
			pendingInvites: []
		};
	}

	const pendingInvites = await measure('dashboard.pending_invites', () =>
		listPendingProjectInvites(supabase)
	);

	// Skip expensive analytics for users still in onboarding only when they truly
	// have no projects yet. Some existing users can have projects even with
	// onboarding_completed_at=null and should still see dashboard project data.
	if (!user.onboarding_completed_at) {
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
					dashboard,
					pendingInvites
				};
			} catch (err) {
				console.error('[Dashboard] Failed to load dashboard analytics:', err);
				return {
					user,
					dashboard: createEmptyUserDashboardAnalytics(),
					pendingInvites
				};
			}
		}

		return {
			user,
			dashboard: createEmptyUserDashboardAnalytics(),
			pendingInvites
		};
	}

	try {
		const dashboard = await measure('dashboard.analytics', () =>
			getUserDashboardAnalytics(supabase, user.id, serverTiming)
		);

		return {
			user,
			dashboard,
			pendingInvites
		};
	} catch (err) {
		console.error('[Dashboard] Failed to load dashboard analytics:', err);
		return {
			user,
			dashboard: createEmptyUserDashboardAnalytics(),
			pendingInvites
		};
	}
};
