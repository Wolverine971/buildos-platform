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
import { loadBlogPosts } from '$lib/utils/blog';

const FEATURED_GUIDE_SLUGS = [
	'how-buildos-works',
	'first-project-setup',
	'daily-brief-guide'
] as const;

async function loadFeaturedBlogPosts() {
	const order = new Map<string, number>(FEATURED_GUIDE_SLUGS.map((slug, index) => [slug, index]));
	const allPosts = await loadBlogPosts();

	return allPosts
		.filter((post) => order.has(post.slug))
		.sort((left, right) => (order.get(left.slug) ?? 99) - (order.get(right.slug) ?? 99));
}

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
			dashboard: null,
			featuredBlogPosts: await measure('landing.featured_guides', loadFeaturedBlogPosts)
		};
	}

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
