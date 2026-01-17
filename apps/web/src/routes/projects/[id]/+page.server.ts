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
		isAuthenticated: boolean;
	};
	project: {
		id: string;
		name: string;
		description: string | null;
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
	};
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const { id } = params;

	if (!id) {
		throw error(400, 'Project ID required');
	}

	const supabase = locals.supabase;

	// Get user session (optional for public projects)
	const { user } = await locals.safeGetSession();

	// Get actor ID for the user
	let actorId: string | null = null;
	if (user) {
		try {
			actorId = await ensureActorId(supabase, user.id);
		} catch (err) {
			console.error('[Project Page] Failed to get actor ID:', err);
			throw error(500, 'Failed to resolve user');
		}
	}

	let canEdit = false;
	let canAdmin = false;
	let canViewLogs = false;

	if (user && actorId) {
		const [writeResult, adminResult, memberResult] = await Promise.all([
			supabase.rpc('current_actor_has_project_access', {
				p_project_id: id,
				p_required_access: 'write'
			}),
			supabase.rpc('current_actor_has_project_access', {
				p_project_id: id,
				p_required_access: 'admin'
			}),
			supabase
				.from('onto_project_members')
				.select('id', { head: true })
				.eq('project_id', id)
				.eq('actor_id', actorId)
				.is('removed_at', null)
		]);

		if (writeResult.error) {
			console.warn('[Project Page] Failed to check write access:', writeResult.error);
		}
		if (adminResult.error) {
			console.warn('[Project Page] Failed to check admin access:', adminResult.error);
		}
		if (memberResult.error) {
			console.warn('[Project Page] Failed to check membership:', memberResult.error);
		}

		canEdit = Boolean(writeResult.data);
		canAdmin = Boolean(adminResult.data);
		canViewLogs = canAdmin || Boolean(memberResult.data);
	}

	const access = {
		canEdit,
		canAdmin,
		canInvite: canAdmin,
		canViewLogs,
		isAuthenticated: Boolean(user)
	};

	// Check if we have warm navigation data from the URL state
	// This is passed via sessionStorage by the source page
	// We can't access sessionStorage server-side, so we use the skeleton RPC
	// The client will check sessionStorage on mount for warm data

	// COLD LOAD: Fetch skeleton data from RPC
	// This is fast (~50ms) - just project metadata and counts
	const { data: skeletonData, error: skeletonError } = await supabase.rpc(
		'get_project_skeleton',
		{
			p_project_id: id,
			p_actor_id: actorId
		}
	);

	if (skeletonError) {
		console.error('[Project Page] Skeleton RPC error:', skeletonError);
		// Fall back to full fetch if skeleton fails
		const fallbackData = await loadFullData(id, supabase, actorId);
		return { ...fallbackData, access };
	}

	if (!skeletonData) {
		throw error(404, 'Project not found');
	}

	// Return skeleton data for instant rendering
	// Client will hydrate full data after mount
	return {
		skeleton: true,
		projectId: id,
		project: {
			id: skeletonData.id,
			name: skeletonData.name,
			description: skeletonData.description,
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
			risk_count: skeletonData.risk_count ?? 0
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
	const { data, error: rpcError } = await supabase.rpc('get_project_full', {
		p_project_id: id,
		p_actor_id: actorId
	});

	if (rpcError) {
		console.error('[Project Page] Full RPC error:', rpcError);
		throw error(500, 'Failed to load project');
	}

	if (!data) {
		throw error(404, 'Project not found');
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
