// apps/web/src/routes/+page.server.ts
/**
 * Main page server load
 *
 * PERFORMANCE OPTIMIZATIONS (Dec 2024):
 * 1. Ontology projects loaded server-side (not client-side on mount)
 * 2. Projects passed to Dashboard component to avoid duplicate client-side fetch
 * 3. Streaming: promise returned to enable progressive rendering
 * 4. Removed /api/dashboard call - not needed for current Dashboard component
 */
import type { PageServerLoad } from './$types';
import type { OntologyProjectSummary } from '$lib/services/ontology/ontology-projects.service';

export const load: PageServerLoad = async ({
	locals: { safeGetSession, supabase },
	depends
}) => {
	depends('app:auth');
	depends('dashboard:projects');

	try {
		const { user } = await safeGetSession();

		if (!user) {
			return {
				user: null,
				projects: null
			};
		}

		// Load ontology projects directly via Supabase (skip HTTP overhead)
		const projectsPromise: Promise<OntologyProjectSummary[]> = (async () => {
			try {
				// Get actor ID first
				const { data: actorId, error: actorError } = await supabase.rpc(
					'ensure_actor_for_user',
					{ p_user_id: user.id }
				);

				if (actorError || !actorId) {
					console.error('[Dashboard] Failed to get actor:', actorError);
					return [];
				}

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
						onto_tasks(count),
						onto_outputs(count),
						onto_goals(count),
						onto_plans(count),
						onto_documents(count)
					`
					)
					.eq('created_by', actorId)
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
					document_count: project.onto_documents?.[0]?.count ?? 0
				}));
			} catch (err) {
				console.error('[Dashboard] Error loading projects:', err);
				return [];
			}
		})();

		return {
			user,
			projects: projectsPromise
		};
	} catch (err) {
		console.error('Error loading dashboard page data:', err);
		return {
			user: null,
			projects: null
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
