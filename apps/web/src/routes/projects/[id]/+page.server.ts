// apps/web/src/routes/projects/[id]/+page.server.ts
/**
 * Project Detail - Skeleton-First Loading
 *
 * This page uses a skeleton-first loading strategy for instant perceived performance:
 *
 * 1. WARM NAVIGATION (from /projects or homepage):
 *    - Navigation store contains project summary with counts
 *    - Server returns skeleton flag immediately (no blocking fetch)
 *    - Client renders skeleton with counts, then hydrates via /api/onto/projects/[id]/full
 *
 * 2. COLD LOAD (direct URL, refresh, external link):
 *    - No navigation store data available
 *    - Server calls get_project_skeleton RPC (fast - just metadata + counts)
 *    - Client renders skeleton, then hydrates via /api/onto/projects/[id]/full
 *
 * Performance Targets:
 * - Time to first paint: <100ms (skeleton visible immediately)
 * - Time to interactive: <500ms (full data hydrated)
 * - Layout shift (CLS): 0 (skeleton matches final dimensions)
 *
 * Documentation:
 * - Performance Spec: /apps/web/docs/technical/performance/PROJECT_PAGE_INSTANT_LOAD.md
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Data Models: /apps/web/docs/features/ontology/DATA_MODELS.md
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import type { Database } from '@buildos/shared-types';
import { decorateMilestonesWithGoals } from '$lib/server/milestone-decorators';
import { sanitizeProjectForClient } from '$lib/utils/project-props-sanitizer';
import { attachAssigneesToTasks, fetchTaskAssigneesMap } from '$lib/server/task-assignment.service';
import {
	attachLastChangedByActorToTasks,
	fetchTaskLastChangedByActorMap
} from '$lib/server/task-relevance.service';

type GoalRow = Database['public']['Tables']['onto_goals']['Row'];
type MilestoneRow = Database['public']['Tables']['onto_milestones']['Row'];

/**
 * Skeleton data structure - minimal data for instant rendering
 */
export interface ProjectSkeletonData {
	skeleton: true;
	projectId: string;
	access: {
		canEdit: boolean;
		canAdmin: boolean;
		canInvite: boolean;
		canViewLogs: boolean;
		isOwner: boolean;
		isAuthenticated: boolean;
	};
	project: {
		id: string;
		name: string;
		description: string | null;
		icon_svg: string | null;
		icon_concept: string | null;
		icon_generated_at: string | null;
		icon_generation_source: 'auto' | 'manual' | null;
		icon_generation_prompt: string | null;
		state_key: string;
		type_key?: string;
		next_step_short: string | null;
		next_step_long: string | null;
		next_step_source: 'ai' | 'user' | null;
		next_step_updated_at: string | null;
	};
	counts: {
		task_count: number;
		document_count: number;
		goal_count: number;
		plan_count: number;
		milestone_count: number;
		risk_count: number;
		image_count: number;
	};
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const { id } = params;

	if (!id) {
		throw error(400, 'Project ID required');
	}

	const supabase = locals.supabase;
	const measure = <T>(name: string, fn: () => Promise<T> | T) =>
		locals.serverTiming ? locals.serverTiming.measure(name, fn) : fn();

	// Get user session (optional for public projects)
	const { user } = await locals.safeGetSession();

	// Get actor ID for the user
	let actorId: string | null = null;
	if (user) {
		try {
			actorId = await measure('db.ensure_actor', () => ensureActorId(supabase, user.id));
		} catch (err) {
			console.error('[Project Page] Failed to get actor ID:', err);
			throw error(500, 'Failed to resolve user');
		}
	}

	const resolveAccess = async () =>
		measure('db.project_access.resolve', async () => {
			let canEdit = false;
			let canAdmin = false;
			let canInvite = false;
			let canViewLogs = false;
			let isOwner = false;

			if (user && actorId) {
				const [writeResult, adminResult, ownerResult] = await measure(
					'db.project_access.core',
					() =>
						Promise.all([
							supabase.rpc('current_actor_has_project_access', {
								p_project_id: id,
								p_required_access: 'write'
							}),
							supabase.rpc('current_actor_has_project_access', {
								p_project_id: id,
								p_required_access: 'admin'
							}),
							supabase
								.from('onto_projects')
								.select('id', { head: true, count: 'exact' })
								.eq('id', id)
								.eq('created_by', actorId)
								.is('deleted_at', null)
						])
				);

				if (writeResult.error) {
					console.warn('[Project Page] Failed to check write access:', writeResult.error);
				}
				if (adminResult.error) {
					console.warn('[Project Page] Failed to check admin access:', adminResult.error);
				}
				if (ownerResult.error) {
					console.warn('[Project Page] Failed to check ownership:', ownerResult.error);
				}

				canEdit = Boolean(writeResult.data);
				canAdmin = Boolean(adminResult.data);
				isOwner = (ownerResult.count ?? 0) > 0;
				canInvite = canEdit;

				if (canAdmin) {
					canViewLogs = true;
				} else {
					const { count: memberCount, error: memberError } = await measure(
						'db.project_access.member',
						() =>
							supabase
								.from('onto_project_members')
								.select('id', { head: true, count: 'exact' })
								.eq('project_id', id)
								.eq('actor_id', actorId)
								.is('removed_at', null)
					);

					if (memberError) {
						console.warn('[Project Page] Failed to check membership:', memberError);
					}
					canViewLogs = (memberCount ?? 0) > 0;
				}
			}

			return {
				canEdit,
				canAdmin,
				canInvite,
				canViewLogs,
				isOwner,
				isAuthenticated: Boolean(user)
			};
		});

	// Check if we have warm navigation data from the URL state
	// This is passed via sessionStorage by the source page
	// We can't access sessionStorage server-side, so we use the skeleton RPC
	// The client will check sessionStorage on mount for warm data

	// COLD LOAD: Fetch skeleton data from RPC
	// This is fast (~50ms) - just project metadata and counts
	const { data: skeletonRaw, error: skeletonError } = await measure('db.project_skeleton', () =>
		supabase.rpc('get_project_skeleton', {
			p_project_id: id,
			p_actor_id: actorId
		})
	);
	const skeletonData = skeletonRaw as Record<string, any> | null;

	if (skeletonError) {
		console.error('[Project Page] Skeleton RPC error:', skeletonError);
		// Fall back to full fetch if skeleton fails
		const [fallbackData, access] = await Promise.all([
			measure('db.project_full_fallback', () => loadFullData(id, supabase, actorId)),
			resolveAccess()
		]);
		return { ...fallbackData, access };
	}

	if (!skeletonData) {
		throw error(404, 'Project not found');
	}

	const access = await resolveAccess();

	// Return skeleton data for instant rendering
	// Client will hydrate full data after mount
	return {
		skeleton: true,
		projectId: id,
		project: {
			id: skeletonData.id,
			name: skeletonData.name,
			description: skeletonData.description,
			icon_svg: skeletonData.icon_svg ?? null,
			icon_concept: skeletonData.icon_concept ?? null,
			icon_generated_at: skeletonData.icon_generated_at ?? null,
			icon_generation_source:
				(skeletonData.icon_generation_source as 'auto' | 'manual' | null | undefined) ??
				null,
			icon_generation_prompt: skeletonData.icon_generation_prompt ?? null,
			state_key: skeletonData.state_key,
			type_key: skeletonData.type_key,
			next_step_short: skeletonData.next_step_short,
			next_step_long: skeletonData.next_step_long,
			next_step_source: skeletonData.next_step_source,
			next_step_updated_at: skeletonData.next_step_updated_at
		},
		counts: {
			task_count: skeletonData.task_count ?? 0,
			document_count: skeletonData.document_count ?? 0,
			goal_count: skeletonData.goal_count ?? 0,
			plan_count: skeletonData.plan_count ?? 0,
			milestone_count: skeletonData.milestone_count ?? 0,
			risk_count: skeletonData.risk_count ?? 0,
			image_count: skeletonData.image_count ?? 0
		},
		access
	} satisfies ProjectSkeletonData;
};

/**
 * Fallback: Load full data if skeleton RPC fails
 * This maintains backward compatibility
 */
async function loadFullData(
	id: string,
	supabase: App.Locals['supabase'],
	actorId: string | null
): Promise<any> {
	const { data: rawData, error: rpcError } = await supabase.rpc('get_project_full', {
		p_project_id: id,
		p_actor_id: actorId!
	});

	if (rpcError) {
		console.error('[Project Page] Full RPC error:', rpcError);
		throw error(500, 'Failed to load project');
	}

	if (!rawData) {
		throw error(404, 'Project not found');
	}

	const data = rawData as Record<string, any>;
	if (data.project && typeof data.project === 'object') {
		data.project = sanitizeProjectForClient(data.project as Record<string, unknown>);
	}
	const rawTasks = (data.tasks || []) as Array<{ id: string } & Record<string, unknown>>;
	if (rawTasks.length > 0) {
		const taskIds = rawTasks.map((task) => task.id);
		try {
			const assigneeMap = await fetchTaskAssigneesMap({
				supabase,
				taskIds
			});
			data.tasks = attachAssigneesToTasks(rawTasks, assigneeMap);
		} catch (assigneeError) {
			console.warn(
				'[Project Page] Failed to enrich task assignees in fallback load:',
				assigneeError
			);
		}

		try {
			const lastChangedByActorMap = await fetchTaskLastChangedByActorMap({
				supabase,
				projectId: id,
				taskIds
			});
			data.tasks = attachLastChangedByActorToTasks(
				(data.tasks || rawTasks) as Array<{ id: string } & Record<string, unknown>>,
				lastChangedByActorMap
			);
		} catch (relevanceError) {
			console.warn(
				'[Project Page] Failed to enrich task relevance actors in fallback load:',
				relevanceError
			);
		}
	}
	const goals = (data.goals || []) as GoalRow[];
	const milestones = (data.milestones || []) as MilestoneRow[];
	const { milestones: decoratedMilestones } = await decorateMilestonesWithGoals(
		supabase,
		goals,
		milestones
	);

	// Return full data (legacy format for backward compatibility)
	return {
		skeleton: false,
		projectId: id,
		...data,
		goals,
		milestones: decoratedMilestones
	};
}
