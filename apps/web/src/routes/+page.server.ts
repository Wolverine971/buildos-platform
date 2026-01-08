// apps/web/src/routes/+page.server.ts
/**
 * Main page server load
 *
 * PERFORMANCE OPTIMIZATIONS (Dec 2024):
 * 1. Ontology projects loaded server-side (not client-side on mount)
 * 2. Projects passed to Dashboard component to avoid duplicate client-side fetch
 * 3. Streaming: promise returned to enable progressive rendering
 * 4. Removed /api/dashboard call - not needed for current Dashboard component
 *
 * PERFORMANCE OPTIMIZATIONS (Dec 2024 - Skeleton Loading):
 * 5. projectCount returned IMMEDIATELY (no await) for instant skeleton rendering
 * 6. projects streamed in background - hydrates skeletons when ready
 * 7. Zero layout shift - exact number of skeleton cards rendered from start
 */
import type { PageServerLoad } from './$types';
import type { OntologyProjectSummary } from '$lib/services/ontology/ontology-projects.service';

export const load: PageServerLoad = async ({ locals: { safeGetSession, supabase }, depends }) => {
	depends('app:auth');
	depends('dashboard:projects');

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
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorId) {
			console.error('[Dashboard] Failed to get actor:', actorError);
			return {
				user,
				projects: Promise.resolve([]),
				projectCount: 0
			};
		}

		// FAST: Get project count immediately (estimated count to reduce DB load)
		// This enables instant skeleton card rendering
		const { count: projectCount, error: countError } = await supabase
			.from('onto_projects')
			.select('*', { count: 'estimated', head: true })
			.eq('created_by', actorId)
			.is('deleted_at', null);

		if (countError) {
			console.error('[Dashboard] Failed to get project count:', countError);
		}

		// STREAMED: Load full project details in background
		// Skeletons will be hydrated when this resolves
		const projectsPromise: Promise<OntologyProjectSummary[]> = (async () => {
			try {
				// Fetch project summaries with counts
				const { data, error } = await supabase
					.from('onto_projects')
					.select(
						`
						id,
						name,
						description,
						type_key,
						state_key,
						props,
						facet_context,
						facet_scale,
						facet_stage,
						created_at,
						updated_at,
						next_step_short,
						next_step_long,
						next_step_source,
						next_step_updated_at,
						onto_tasks(count),
						onto_outputs(count),
						onto_goals(count),
						onto_plans(count),
						onto_documents(count)
					`
					)
					.eq('created_by', actorId)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false });

				if (error) {
					console.error('[Dashboard] Failed to fetch projects:', error);
					return [];
				}

				// Transform to summary format
				return (data ?? []).map((project: any) => ({
					id: project.id,
					name: project.name,
					description: project.description ?? null,
					type_key: project.type_key,
					state_key: project.state_key,
					props: project.props,
					facet_context: project.facet_context ?? null,
					facet_scale: project.facet_scale ?? null,
					facet_stage: project.facet_stage ?? null,
					created_at: project.created_at,
					updated_at: project.updated_at,
					task_count: project.onto_tasks?.[0]?.count ?? 0,
					output_count: project.onto_outputs?.[0]?.count ?? 0,
					goal_count: project.onto_goals?.[0]?.count ?? 0,
					plan_count: project.onto_plans?.[0]?.count ?? 0,
					document_count: project.onto_documents?.[0]?.count ?? 0,
					next_step_short: project.next_step_short ?? null,
					next_step_long: project.next_step_long ?? null,
					next_step_source: project.next_step_source ?? null,
					next_step_updated_at: project.next_step_updated_at ?? null
				}));
			} catch (err) {
				console.error('[Dashboard] Error loading projects:', err);
				return [];
			}
		})();

		return {
			user,
			projects: projectsPromise,
			projectCount: projectCount ?? 0
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

/*
 * COMMENTED OUT: Old dashboard data fetch (kept for potential future use)
 * This was fetching task data, calendar status, daily briefs etc.
 * Currently the Dashboard component only needs ontology projects.
 *
 * To re-enable, uncomment and add back to the return object:
 *
 * import type { DashboardData } from '$lib/services/dashboardData.service';
 *
 * const timezone =
 *   ((user as any).user_metadata?.timezone as string | undefined) ||
 *   request.headers.get('x-timezone') ||
 *   request.headers.get('time-zone') ||
 *   'UTC';
 *
 * const dashboardDataPromise: Promise<DashboardData> = fetch(
 *   `/api/dashboard?timezone=${encodeURIComponent(timezone)}`
 * )
 *   .then(async (response) => {
 *     if (!response.ok) {
 *       throw new Error(`Failed to load dashboard data (${response.status})`);
 *     }
 *     const payload = await response.json();
 *     if (!payload.success) {
 *       throw new Error(payload.error || 'Failed to load dashboard data');
 *     }
 *     return payload.data as DashboardData;
 *   })
 *   .catch((err) => {
 *     console.error('[Dashboard] Failed to load initial data', err);
 *     throw err;
 *   });
 *
 * return {
 *   user,
 *   dashboardData: dashboardDataPromise,
 *   dashboardTimezone: timezone,
 *   projects: projectsPromise
 * };
 */
