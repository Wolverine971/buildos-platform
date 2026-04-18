// apps/web/src/routes/api/onto/projects/[id]/full/+server.ts
/**
 * GET /api/onto/projects/[id]/full
 * OPTIMIZED: Fetch project with all related entities using single RPC
 *
 * This endpoint uses the get_project_full() database function which
 * fetches core project data in a single database round-trip, replacing
 * 13+ separate queries. Server-side enrichment adds task metadata, events,
 * and lightweight public-page counts before returning to the browser.
 *
 * Performance improvement: ~100-300ms faster than the standard endpoint
 *
 * Note: FSM transitions removed - using simple enum states now (see FSM_SIMPLIFICATION_COMPLETE.md)
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../shared/error-logging';
import type { Database } from '@buildos/shared-types';
import {
	decorateMilestonesWithGoals,
	type GoalMilestoneEdge
} from '$lib/server/milestone-decorators';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { sanitizeProjectForClient } from '$lib/utils/project-props-sanitizer';
import { attachAssigneesToTasks, type TaskAssignee } from '$lib/server/task-assignment.service';
import { attachLastChangedByActorToTasks } from '$lib/server/task-relevance.service';
import { OntoEventSyncService } from '$lib/services/ontology/onto-event-sync.service';

// Type for the RPC response
interface ProjectFullData {
	project: Record<string, unknown>;
	goals: unknown[];
	requirements: unknown[];
	plans: unknown[];
	tasks: unknown[];
	documents: unknown[];
	images: unknown[];
	sources: unknown[];
	milestones: unknown[];
	risks: unknown[];
	metrics: unknown[];
	context_document: unknown | null;
	goal_milestone_edges?: GoalMilestoneEdge[] | null;
	task_assignees?: Record<string, TaskAssignee[]> | null;
	task_last_changed_by?: Record<string, string> | null;
}

function buildTaskAssigneesMap(
	rawAssignees: Record<string, TaskAssignee[]> | null | undefined
): Map<string, TaskAssignee[]> {
	const map = new Map<string, TaskAssignee[]>();
	if (!rawAssignees) return map;
	for (const [taskId, assignees] of Object.entries(rawAssignees)) {
		if (Array.isArray(assignees) && assignees.length > 0) {
			map.set(taskId, assignees);
		}
	}
	return map;
}

function buildLastChangedByActorMap(
	rawMap: Record<string, string> | null | undefined
): Map<string, string> {
	const map = new Map<string, string>();
	if (!rawMap) return map;
	for (const [taskId, actorId] of Object.entries(rawMap)) {
		if (typeof actorId === 'string' && actorId.length > 0) {
			map.set(taskId, actorId);
		}
	}
	return map;
}

type MilestoneRow = Database['public']['Tables']['onto_milestones']['Row'];
type GoalRow = Database['public']['Tables']['onto_goals']['Row'];
type PublicPageCounts = {
	total: number;
	live: number;
};

async function fetchPublicPageCounts(
	supabase: App.Locals['supabase'],
	projectId: string
): Promise<PublicPageCounts> {
	const [totalResult, liveResult] = await Promise.all([
		(supabase as any)
			.from('onto_public_pages')
			.select('id', { count: 'exact', head: true })
			.eq('project_id', projectId)
			.is('deleted_at', null),
		(supabase as any)
			.from('onto_public_pages')
			.select('id', { count: 'exact', head: true })
			.eq('project_id', projectId)
			.eq('public_status', 'live')
			.is('deleted_at', null)
	]);

	if (totalResult.error) {
		throw totalResult.error;
	}
	if (liveResult.error) {
		throw liveResult.error;
	}

	return {
		total: totalResult.count ?? 0,
		live: liveResult.count ?? 0
	};
}

const extractErrorMessage = (error: unknown): string => {
	if (!error) return 'Unknown error';
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	if (typeof error === 'object') {
		const err = error as Record<string, unknown>;
		const message = typeof err.message === 'string' ? err.message : null;
		if (message) return message;
		const errorDescription =
			typeof err.error_description === 'string' ? err.error_description : null;
		if (errorDescription) return errorDescription;
		const errorMessage = typeof err.error === 'string' ? err.error : null;
		if (errorMessage) return errorMessage;
		const details = typeof err.details === 'string' ? err.details : null;
		if (details) return details;
		const hint = typeof err.hint === 'string' ? err.hint : null;
		if (hint) return hint;
		try {
			return JSON.stringify(err);
		} catch {
			return String(error);
		}
	}
	return String(error);
};

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const { user } = await locals.safeGetSession();

		const { id } = params;

		if (!id) {
			return ApiResponse.badRequest('Project ID required');
		}
		if (!isValidUUID(id)) {
			return ApiResponse.badRequest('Invalid project ID');
		}

		const supabase = locals.supabase;
		let actorId: string | null = null;

		// Get actor ID for authorization check
		if (user) {
			const { data, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
				p_user_id: user.id
			});

			if (actorError || !data) {
				console.error('[Project Full API] Failed to get actor:', actorError);
				await logOntologyApiError({
					supabase,
					error: actorError || new Error('Failed to resolve user actor'),
					endpoint: `/api/onto/projects/${id}/full`,
					method: 'GET',
					userId: user.id,
					projectId: id,
					entityType: 'project',
					operation: 'project_actor_resolve'
				});
				return ApiResponse.internalError(
					actorError || new Error('Failed to resolve user actor'),
					'Failed to resolve user actor'
				);
			}

			actorId = data as string;
		}

		// OPTIMIZED: Single RPC call for all project data
		// Note: actorId can be null for anonymous access to public projects
		const { data, error } = (await supabase.rpc('get_project_full', {
			p_project_id: id,
			p_actor_id: actorId!
		})) as { data: ProjectFullData | null; error: unknown };

		if (error) {
			console.error('[Project Full API] RPC error:', error);
			await logOntologyApiError({
				supabase,
				error,
				endpoint: `/api/onto/projects/${id}/full`,
				method: 'GET',
				userId: user?.id,
				projectId: id,
				entityType: 'project',
				operation: 'project_full_get'
			});
			const errorMessage = extractErrorMessage(error);
			return ApiResponse.error(`Failed to fetch project: ${errorMessage}`, 500);
		}

		if (!data) {
			return ApiResponse.notFound('Project');
		}

		const goals = (data.goals || []) as GoalRow[];
		const milestones = (data.milestones || []) as MilestoneRow[];
		const rawTasks = (data.tasks || []) as Array<{ id: string } & Record<string, unknown>>;
		const goalMilestoneEdges = (data.goal_milestone_edges ?? []) as GoalMilestoneEdge[];
		// Task assignees and last-changed-by actor maps are now baked into the
		// RPC response (migration 20260501000002), eliminating two extra DB
		// round-trips on the project page hot path.
		const assigneeMap = buildTaskAssigneesMap(data.task_assignees);
		const lastChangedByActorMap = buildLastChangedByActorMap(data.task_last_changed_by);

		const eventService = new OntoEventSyncService(supabase);

		// Run remaining independent post-RPC fetches in parallel: milestone/goal
		// decoration (edges already supplied by RPC), events, and public-page
		// counts.
		const [milestoneDecorateResult, eventsResult, publicPageCountsResult] = await Promise.all([
			decorateMilestonesWithGoals(supabase, goals, milestones, goalMilestoneEdges),
			eventService
				.listProjectEvents(
					id,
					{
						includeDeleted: false
					},
					user?.id ?? null
				)
				.catch((eventsError) => {
					console.warn('[Project Full API] Failed to load project events:', eventsError);
					return [];
				}),
			fetchPublicPageCounts(supabase, id).catch((countsError) => {
				console.warn('[Project Full API] Failed to load public-page counts:', countsError);
				return { total: 0, live: 0 } satisfies PublicPageCounts;
			})
		]);

		const { milestones: decoratedMilestones } = milestoneDecorateResult;

		const sanitizedProject = sanitizeProjectForClient(data.project as Record<string, unknown>);

		let tasksWithAssignees = attachAssigneesToTasks(rawTasks, assigneeMap);
		tasksWithAssignees = attachLastChangedByActorToTasks(
			tasksWithAssignees,
			lastChangedByActorMap
		);

		return ApiResponse.success({
			project: sanitizedProject,
			current_actor_id: actorId,
			goals,
			requirements: data.requirements || [],
			plans: data.plans || [],
			tasks: tasksWithAssignees,
			documents: data.documents || [],
			images: data.images || [],
			sources: data.sources || [],
			milestones: decoratedMilestones,
			risks: data.risks || [],
			metrics: data.metrics || [],
			context_document: data.context_document,
			events: eventsResult,
			public_page_counts: publicPageCountsResult
		});
	} catch (err) {
		console.error('[Project Full API] Unexpected error:', err);
		await logOntologyApiError({
			supabase: locals.supabase,
			error: err,
			endpoint: `/api/onto/projects/${params.id ?? ''}/full`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: params.id,
			entityType: 'project',
			operation: 'project_full_get'
		});
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
