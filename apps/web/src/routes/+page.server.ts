// apps/web/src/routes/+page.server.ts
/**
 * Main page server load
 *
 * PERFORMANCE OPTIMIZATIONS (Dec 2024):
 * 1. Ontology projects loaded server-side (not client-side on mount)
 * 2. Projects passed to Dashboard component to avoid duplicate client-side fetch
 * 3. Streaming: promise returned to enable progressive rendering
 *
 * PERFORMANCE OPTIMIZATIONS (Dec 2024 - Skeleton Loading):
 * 5. projectCount returned IMMEDIATELY (no await) for instant skeleton rendering
 * 6. projects streamed in background - hydrates skeletons when ready
 * 7. Zero layout shift - exact number of skeleton cards rendered from start
 */
import type { PageServerLoad } from './$types';
import type { OntologyProjectSummary } from '$lib/services/ontology/ontology-projects.service';
import { fetchProjectSummaries } from '$lib/services/ontology/ontology-projects.service';

export const load: PageServerLoad = async ({
	locals: { safeGetSession, supabase, serverTiming },
	depends
}) => {
	depends('app:auth');
	depends('dashboard:projects');

	const measure = <T>(name: string, fn: () => Promise<T> | T) =>
		serverTiming ? serverTiming.measure(name, fn) : fn();

	try {
		const { user } = await safeGetSession();

		if (!user) {
			return {
				user: null,
				projects: null,
				projectCount: 0
			};
		}

		// Get actor ID first (needed for both queries)
		const { data: actorId, error: actorError } = await measure('db.ensure_actor', () =>
			supabase.rpc('ensure_actor_for_user', {
				p_user_id: user.id
			})
		);

		if (actorError || !actorId) {
			console.error('[Dashboard] Failed to get actor:', actorError);
			return {
				user,
				projects: Promise.resolve([]),
				projectCount: 0
			};
		}

		// FAST: Get project count immediately (estimated count to reduce DB load)
		// Prefer membership count so shared projects are included.
		const { count: memberCount, error: memberCountError } = await measure(
			'db.project_members.count',
			() =>
				supabase
					.from('onto_project_members')
					.select('id', { count: 'estimated', head: true })
					.eq('actor_id', actorId)
					.is('removed_at', null)
		);

		let projectCount = memberCount ?? 0;
		if (memberCountError) {
			console.error('[Dashboard] Failed to get membership count:', memberCountError);
			const { count: fallbackCount, error: countError } = await measure(
				'db.projects.count_fallback',
				() =>
					supabase
						.from('onto_projects')
						.select('*', { count: 'estimated', head: true })
						.eq('created_by', actorId)
						.is('deleted_at', null)
			);
			if (countError) {
				console.error('[Dashboard] Failed to get project count:', countError);
			}
			projectCount = fallbackCount ?? 0;
		}

		// STREAMED: Load full project details in background
		// Skeletons will be hydrated when this resolves
		const projectsPromise: Promise<OntologyProjectSummary[]> = fetchProjectSummaries(
			supabase,
			actorId,
			serverTiming
		).catch((err) => {
			console.error('[Dashboard] Error loading projects:', err);
			return [];
		});

		return {
			user,
			projects: projectsPromise,
			projectCount
		};
	} catch (err) {
		console.error('Error loading dashboard page data:', err);
		return {
			user: null,
			projects: null,
			projectCount: 0
		};
	}
};
