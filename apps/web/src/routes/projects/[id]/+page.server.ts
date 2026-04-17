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
 *    - Server calls get_project_skeleton_with_access RPC (single round-trip that
 *      ensures the actor row, returns counts, and resolves access flags).
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
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { attachAssigneesToTasks, fetchTaskAssigneesMap } from '$lib/server/task-assignment.service';
import {
	attachLastChangedByActorToTasks,
	fetchTaskLastChangedByActorMap
} from '$lib/server/task-relevance.service';

type GoalRow = Database['public']['Tables']['onto_goals']['Row'];
type MilestoneRow = Database['public']['Tables']['onto_milestones']['Row'];

interface ProjectAccessPayload {
	can_edit?: boolean;
	can_admin?: boolean;
	can_invite?: boolean;
	can_view_logs?: boolean;
	is_owner?: boolean;
	is_authenticated?: boolean;
}

interface ProjectSkeletonWithAccessResponse {
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
	task_count?: number;
	document_count?: number;
	goal_count?: number;
	plan_count?: number;
	milestone_count?: number;
	risk_count?: number;
	image_count?: number;
	access?: ProjectAccessPayload;
}

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

function normalizeAccess(
	access: ProjectAccessPayload | null | undefined,
	isAuthenticated: boolean
): ProjectSkeletonData['access'] {
	return {
		canEdit: Boolean(access?.can_edit),
		canAdmin: Boolean(access?.can_admin),
		canInvite: Boolean(access?.can_invite),
		canViewLogs: Boolean(access?.can_view_logs),
		isOwner: Boolean(access?.is_owner),
		isAuthenticated: Boolean(access?.is_authenticated ?? isAuthenticated)
	};
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const { id } = params;

	if (!id) {
		throw error(400, 'Project ID required');
	}
	if (!isValidUUID(id)) {
		throw error(400, 'Invalid project ID');
	}

	const supabase = locals.supabase;
	const measure = <T>(name: string, fn: () => Promise<T> | T) =>
		locals.serverTiming ? locals.serverTiming.measure(name, fn) : fn();

	// Session is still needed for the fallback path.
	const { user } = await locals.safeGetSession();
	const isAuthenticated = Boolean(user);

	// Single round-trip: ensures actor, resolves read access, returns skeleton + access.
	const { data: bundleRaw, error: bundleError } = await measure(
		'db.project_skeleton_with_access',
		() =>
			supabase.rpc('get_project_skeleton_with_access', {
				p_project_id: id
			})
	);

	if (bundleError) {
		console.error('[Project Page] Skeleton+access RPC error:', bundleError);
		// Fall back to full fetch so the page still loads if the RPC misbehaves.
		let fallbackActorId: string | null = null;
		if (user) {
			try {
				fallbackActorId = await measure('db.ensure_actor', () =>
					ensureActorId(supabase, user.id)
				);
			} catch (err) {
				console.error('[Project Page] Failed to get actor ID for fallback:', err);
				throw error(500, 'Failed to resolve user');
			}
		}
		const fallbackData = await measure('db.project_full_fallback', () =>
			loadFullData(id, supabase, fallbackActorId)
		);
		return {
			...fallbackData,
			access: normalizeAccess(null, isAuthenticated)
		};
	}

	const bundle = bundleRaw as ProjectSkeletonWithAccessResponse | null;

	if (!bundle) {
		throw error(404, 'Project not found');
	}

	return {
		skeleton: true,
		projectId: id,
		project: {
			id: bundle.id,
			name: bundle.name,
			description: bundle.description,
			icon_svg: bundle.icon_svg ?? null,
			icon_concept: bundle.icon_concept ?? null,
			icon_generated_at: bundle.icon_generated_at ?? null,
			icon_generation_source:
				(bundle.icon_generation_source as 'auto' | 'manual' | null | undefined) ?? null,
			icon_generation_prompt: bundle.icon_generation_prompt ?? null,
			state_key: bundle.state_key,
			type_key: bundle.type_key,
			next_step_short: bundle.next_step_short,
			next_step_long: bundle.next_step_long,
			next_step_source: bundle.next_step_source,
			next_step_updated_at: bundle.next_step_updated_at
		},
		counts: {
			task_count: bundle.task_count ?? 0,
			document_count: bundle.document_count ?? 0,
			goal_count: bundle.goal_count ?? 0,
			plan_count: bundle.plan_count ?? 0,
			milestone_count: bundle.milestone_count ?? 0,
			risk_count: bundle.risk_count ?? 0,
			image_count: bundle.image_count ?? 0
		},
		access: normalizeAccess(bundle.access, isAuthenticated)
	} satisfies ProjectSkeletonData;
};

/**
 * Fallback: Load full data if the skeleton+access RPC fails.
 * This maintains backward compatibility.
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
	const taskIds = rawTasks.map((task) => task.id);
	const goals = (data.goals || []) as GoalRow[];
	const milestones = (data.milestones || []) as MilestoneRow[];

	// Run independent post-RPC fetches in parallel: milestone decoration, task
	// assignees, and task last-changed-by actors.
	const [milestoneDecorateResult, assigneeMapResult, lastChangedByActorMapResult] =
		await Promise.all([
			decorateMilestonesWithGoals(supabase, goals, milestones),
			rawTasks.length > 0
				? fetchTaskAssigneesMap({ supabase, taskIds }).catch((assigneeError) => {
						console.warn(
							'[Project Page] Failed to enrich task assignees in fallback load:',
							assigneeError
						);
						return null;
					})
				: Promise.resolve(null),
			rawTasks.length > 0
				? fetchTaskLastChangedByActorMap({ supabase, projectId: id, taskIds }).catch(
						(relevanceError) => {
							console.warn(
								'[Project Page] Failed to enrich task relevance actors in fallback load:',
								relevanceError
							);
							return null;
						}
					)
				: Promise.resolve(null)
		]);

	let enrichedTasks: Array<{ id: string } & Record<string, unknown>> = rawTasks;
	if (assigneeMapResult) {
		enrichedTasks = attachAssigneesToTasks(rawTasks, assigneeMapResult);
	}
	if (lastChangedByActorMapResult) {
		enrichedTasks = attachLastChangedByActorToTasks(enrichedTasks, lastChangedByActorMapResult);
	}
	data.tasks = enrichedTasks;

	const { milestones: decoratedMilestones } = milestoneDecorateResult;

	// Return full data (legacy format for backward compatibility)
	return {
		skeleton: false,
		projectId: id,
		...data,
		goals,
		milestones: decoratedMilestones
	};
}
