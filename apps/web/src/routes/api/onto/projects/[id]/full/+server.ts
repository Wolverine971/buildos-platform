// apps/web/src/routes/api/onto/projects/[id]/full/+server.ts
/**
 * GET /api/onto/projects/[id]/full
 * OPTIMIZED: Fetch project with all related entities using single RPC
 *
 * By default this endpoint uses get_project_full() for the classic project
 * page contract. The v2 page can request ?profile=v2-initial to use a lean
 * RPC that skips collections not rendered during initial hydration.
 *
 * Performance improvement: ~100-300ms faster than the standard endpoint
 *
 * Note: FSM transitions removed - using simple enum states now (see FSM_SIMPLIFICATION_COMPLETE.md)
 */

import type { RequestHandler } from './$types';
import { performance } from 'node:perf_hooks';
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
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import type { Task } from '$lib/types/onto';
import type { ProjectTasksCoverage } from '$lib/types/project-full-data';
import { buildInitialProjectTaskWindow } from '$lib/server/project-task-window';
import {
	createCompleteProjectTasksCoverage,
	selectProjectPulseTasks
} from '$lib/utils/project-task-board';
import {
	arrayLength,
	extractErrorMessage,
	fetchContextDocumentByTypeKey,
	fetchPublicPageCounts,
	loadInitialProjectEventWindow,
	resolveProfile,
	shouldSampleProjectFullPerf,
	type ProjectEventWindowResult,
	type PublicPageCounts
} from '$lib/server/project-full-api-helpers';

// Type for the RPC response
interface ProjectFullData {
	project: Record<string, unknown>;
	current_actor_id?: string | null;
	goals?: unknown[];
	requirements?: unknown[];
	plans?: unknown[];
	tasks?: unknown[];
	pulse_tasks?: unknown[];
	tasks_coverage?: ProjectTasksCoverage;
	documents?: unknown[];
	images?: unknown[];
	sources?: unknown[];
	milestones?: unknown[];
	risks?: unknown[];
	metrics?: unknown[];
	context_document?: unknown | null;
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

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const requestStartedAt = performance.now();
	const samplePerformance = shouldSampleProjectFullPerf();
	let rpcDurationMs = 0;
	let postRpcDurationMs = 0;
	try {
		const { id } = params;
		const profile = resolveProfile(url);
		const isV2InitialProfile = profile === 'v2-initial';

		if (!id) {
			return ApiResponse.badRequest('Project ID required');
		}
		if (!isValidUUID(id)) {
			return ApiResponse.badRequest('Invalid project ID');
		}

		const supabase = locals.supabase;
		const measure = <T>(name: string, fn: () => Promise<T> | T) =>
			locals.serverTiming ? locals.serverTiming.measure(name, fn) : fn();
		let actorId: string | null = null;
		let userId: string;

		if (isV2InitialProfile) {
			const { user } = await locals.safeGetSession();
			if (!user) {
				return ApiResponse.unauthorized('Authentication required');
			}
			userId = user.id;
		} else {
			const access = await requireProjectMemberAccess({
				locals,
				projectId: id,
				requiredAccess: 'read'
			});
			if (!access.ok) return access.response;
			actorId = access.actorId;
			userId = access.userId;
		}

		// OPTIMIZED: Single RPC call for project data. Classic keeps the full
		// historical contract; v2 uses a narrower initial-render payload.
		const rpcName = isV2InitialProfile ? 'get_project_full_v2_initial' : 'get_project_full';
		const rpcStartedAt = performance.now();
		const { data, error } = (await measure(`db.${rpcName}`, () =>
			(supabase as any).rpc(rpcName, {
				p_project_id: id,
				p_actor_id: actorId
			})
		)) as { data: ProjectFullData | null; error: unknown };
		rpcDurationMs = performance.now() - rpcStartedAt;

		if (error) {
			console.error('[Project Full API] RPC error:', error);
			await logOntologyApiError({
				supabase,
				error,
				endpoint: `/api/onto/projects/${id}/full`,
				method: 'GET',
				userId,
				projectId: id,
				entityType: 'project',
				operation: isV2InitialProfile ? 'project_full_v2_initial_get' : 'project_full_get'
			});
			const errorMessage = extractErrorMessage(error);
			return ApiResponse.error(`Failed to fetch project: ${errorMessage}`, 500);
		}

		if (!data) {
			return ApiResponse.notFound('Project');
		}

		if (isV2InitialProfile) {
			actorId =
				typeof data.current_actor_id === 'string' && data.current_actor_id.length > 0
					? data.current_actor_id
					: null;
		}

		const goals = (data.goals || []) as GoalRow[];
		const milestones = (data.milestones || []) as MilestoneRow[];
		const rawTasks = (data.tasks || []) as Task[];
		const taskWindow = isV2InitialProfile
			? data.tasks_coverage
				? { tasks: rawTasks, coverage: data.tasks_coverage }
				: buildInitialProjectTaskWindow(rawTasks)
			: { tasks: rawTasks, coverage: createCompleteProjectTasksCoverage(rawTasks) };
		const pulseTasks = isV2InitialProfile
			? Array.isArray(data.pulse_tasks)
				? (data.pulse_tasks as Task[])
				: selectProjectPulseTasks(rawTasks)
			: rawTasks;
		const goalMilestoneEdges = (data.goal_milestone_edges ?? []) as GoalMilestoneEdge[];
		// Task assignees and last-changed-by actor maps are now baked into the
		// RPC response (migration 20260501000002), eliminating two extra DB
		// round-trips on the project page hot path.
		const assigneeMap = buildTaskAssigneesMap(data.task_assignees);
		const lastChangedByActorMap = buildLastChangedByActorMap(data.task_last_changed_by);

		const eventService = new OntoEventSyncService(supabase);
		const eventsPromise: Promise<ProjectEventWindowResult> = isV2InitialProfile
			? loadInitialProjectEventWindow(eventService, id, userId)
			: eventService
					.listProjectEvents(
						id,
						{
							includeDeleted: false
						},
						userId
					)
					.then((events) => ({
						events,
						coverage: {
							scope: 'all',
							complete: true,
							returned: events.length
						}
					}));
		const contextDocumentPromise =
			data.context_document !== null && data.context_document !== undefined
				? Promise.resolve(data.context_document)
				: fetchContextDocumentByTypeKey(supabase, id, {
						includeContent: !isV2InitialProfile
					}).catch((contextError) => {
						console.warn(
							'[Project Full API] Failed to load context document fallback:',
							contextError
						);
						return null;
					});

		// Run remaining independent post-RPC fetches in parallel. Public-page
		// counts are omitted from the v2 initial profile because that page does
		// not render them during hydration.
		const postRpcStartedAt = performance.now();
		const [
			milestoneDecorateResult,
			eventWindowResult,
			publicPageCountsResult,
			contextDocument
		] = await measure('project_full.post_rpc', () =>
			Promise.all([
				decorateMilestonesWithGoals(supabase, goals, milestones, goalMilestoneEdges),
				eventsPromise.catch((eventsError) => {
					console.warn('[Project Full API] Failed to load project events:', eventsError);
					return {
						events: [],
						coverage: {
							scope: isV2InitialProfile ? 'initial-window' : 'all',
							complete: false,
							returned: 0
						}
					} satisfies ProjectEventWindowResult;
				}),
				isV2InitialProfile
					? Promise.resolve(null)
					: fetchPublicPageCounts(supabase, id).catch((countsError) => {
							console.warn(
								'[Project Full API] Failed to load public-page counts:',
								countsError
							);
							return { total: 0, live: 0 } satisfies PublicPageCounts;
						}),
				contextDocumentPromise
			])
		);
		postRpcDurationMs = performance.now() - postRpcStartedAt;

		const { milestones: decoratedMilestones } = milestoneDecorateResult;

		const sanitizedProject = sanitizeProjectForClient(data.project as Record<string, unknown>);

		let tasksWithAssignees = attachAssigneesToTasks(taskWindow.tasks, assigneeMap);
		tasksWithAssignees = attachLastChangedByActorToTasks(
			tasksWithAssignees,
			lastChangedByActorMap
		);

		const payload: Record<string, unknown> = {
			project: sanitizedProject,
			current_actor_id: actorId,
			goals,
			plans: data.plans || [],
			tasks: tasksWithAssignees,
			tasks_coverage: taskWindow.coverage,
			pulse_tasks: pulseTasks,
			documents: data.documents || [],
			milestones: decoratedMilestones,
			risks: data.risks || [],
			context_document: contextDocument,
			events: eventWindowResult.events,
			events_coverage: eventWindowResult.coverage
		};

		if (!isV2InitialProfile) {
			payload.requirements = data.requirements || [];
			payload.images = data.images || [];
			payload.sources = data.sources || [];
			payload.metrics = data.metrics || [];
			payload.public_page_counts = publicPageCountsResult;
		}

		const response = ApiResponse.success(payload);
		if (samplePerformance) {
			try {
				const responseBytes = (await response.clone().arrayBuffer()).byteLength;
				if (locals.serverTiming?.isEnabled()) {
					response.headers.set('X-BuildOS-Project-Payload-Bytes', String(responseBytes));
				}
				console.info('[Perf][ProjectFull]', {
					profile,
					response_bytes: responseBytes,
					total_ms: Number((performance.now() - requestStartedAt).toFixed(1)),
					rpc_ms: Number(rpcDurationMs.toFixed(1)),
					post_rpc_ms: Number(postRpcDurationMs.toFixed(1)),
					counts: {
						goals: arrayLength(data.goals),
						plans: arrayLength(data.plans),
						tasks_source: arrayLength(data.tasks),
						tasks_returned: taskWindow.tasks.length,
						tasks_total: taskWindow.coverage.total,
						pulse_tasks: pulseTasks.length,
						documents: arrayLength(data.documents),
						milestones: arrayLength(data.milestones),
						risks: arrayLength(data.risks),
						events: eventWindowResult.events.length,
						task_assignee_tasks: Object.keys(data.task_assignees ?? {}).length,
						task_last_changed_tasks: Object.keys(data.task_last_changed_by ?? {}).length
					},
					events_coverage: eventWindowResult.coverage
				});
			} catch (metricsError) {
				console.warn('[Perf][ProjectFull] Failed to record payload metrics:', metricsError);
			}
		}

		return response;
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
