// apps/web/src/routes/api/onto/tasks/create/+server.ts
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { ApiResponse } from '$lib/utils/api-response';
import type { EnsureActorResponse } from '$lib/types/onto-api';
import {
	logCreateAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { normalizeTaskStateInput } from '../../shared/task-state';
import { classifyOntologyEntity } from '$lib/server/ontology-classification.service';
import { TaskEventSyncService } from '$lib/services/ontology/task-event-sync.service';
import {
	AutoOrganizeError,
	ENTITY_TABLES,
	autoOrganizeConnections,
	assertEntityRefsInProject,
	toParentRefs
} from '$lib/services/ontology/auto-organizer.service';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';
import { logOntologyApiError } from '../../shared/error-logging';
import {
	normalizeDateTimeInput,
	normalizeOptionalString,
	normalizePriorityInput,
	normalizeRequiredString,
	normalizeTypeKeyInput
} from '../../shared/input-normalization';
import { parseTaskCreateBody } from './request-parser';
import {
	TaskAssignmentValidationError,
	attachAssigneesToTask,
	fetchTaskAssigneesMap,
	notifyTaskAssignmentAdded,
	parseAssigneeActorIds,
	syncTaskAssignees,
	validateAssigneesAreProjectEligible
} from '$lib/server/task-assignment.service';
import {
	notifyEntityMentionsAdded,
	resolveEntityMentionUserIds
} from '$lib/server/entity-mention-notification.service';
const ALLOWED_PARENT_KINDS = new Set(Object.keys(ENTITY_TABLES));
export const POST: RequestHandler = async ({ request, locals }) => {
	// Check authentication
	const { user } = await locals.safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Authentication required');
	}
	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);
	let requestProjectId: string | undefined;
	let requestTitle: string | undefined;
	let requestStateKey: string | undefined;
	let requestPlanId: string | undefined;
	let requestGoalId: string | undefined;
	let requestMilestoneId: string | undefined;
	let requestConnections: ConnectionRef[] | undefined;
	let requestAssigneeActorIds: string[] | undefined;
	try {
		const body = (await request.json()) as Record<string, unknown>;
		const {
			project_id,
			title,
			description,
			type_key,
			priority,
			plan_id,
			state_key,
			goal_id,
			supporting_milestone_id,
			start_at,
			due_at,
			props,
			parent,
			parents,
			connections,
			classificationSource
		} = parseTaskCreateBody(body);

		const normalizedProjectId = normalizeRequiredString(project_id, 'Project ID');
		if (!normalizedProjectId.ok) {
			return ApiResponse.badRequest(normalizedProjectId.error);
		}

		const normalizedTitle = normalizeRequiredString(title, 'Title');
		if (!normalizedTitle.ok) {
			return ApiResponse.badRequest(normalizedTitle.error);
		}

		const normalizedPriority = normalizePriorityInput(priority, { defaultValue: 3 });
		if (!normalizedPriority.ok) {
			return ApiResponse.badRequest(normalizedPriority.error);
		}

		const normalizedStartAt = normalizeDateTimeInput(start_at, 'start_at', 'start');
		if (!normalizedStartAt.ok) {
			return ApiResponse.badRequest(normalizedStartAt.error);
		}

		const normalizedDueAt = normalizeDateTimeInput(due_at, 'due_at', 'end');
		if (!normalizedDueAt.ok) {
			return ApiResponse.badRequest(normalizedDueAt.error);
		}

		const projectId = normalizedProjectId.value;
		const taskTitle = normalizedTitle.value;
		const taskDescription = normalizeOptionalString(description);
		const taskPriority = normalizedPriority.value ?? 3;
		const taskTypeKey = normalizeTypeKeyInput(type_key, 'task', 'task.default');
		const taskProps =
			props && typeof props === 'object' && !Array.isArray(props)
				? (props as Record<string, unknown>)
				: {};
		const taskStartAt = normalizedStartAt.value ?? null;
		const taskDueAt = normalizedDueAt.value ?? null;

		requestProjectId = projectId;
		requestTitle = taskTitle;
		requestStateKey = typeof state_key === 'string' ? state_key : undefined;
		requestPlanId = typeof plan_id === 'string' ? plan_id : undefined;
		requestGoalId = typeof goal_id === 'string' ? goal_id : undefined;
		requestMilestoneId =
			typeof supporting_milestone_id === 'string' ? supporting_milestone_id : undefined;
		const { hasInput: hasAssigneeInput, assigneeActorIds } = parseAssigneeActorIds(body);
		requestAssigneeActorIds = assigneeActorIds;
		const normalizedState = normalizeTaskStateInput(state_key);
		const finalState = normalizedState ?? 'todo';
		// Get user's actor ID
		const { data: actorData, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});
		if (actorError || !actorData) {
			console.error('Error resolving actor for task creation:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: '/api/onto/tasks/create',
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'task',
				operation: 'task_actor_resolve'
			});
			return ApiResponse.internalError(new Error('Failed to get user actor'));
		}
		const actorId = actorData as EnsureActorResponse;
		// Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, name, created_by')
			.eq('id', projectId)
			.is('deleted_at', null)
			.single();
		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}
		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: projectId,
				p_required_access: 'write'
			}
		);
		if (accessError) {
			console.error('[Task Create] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: '/api/onto/tasks/create',
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'task',
				operation: 'task_access_check'
			});
			return ApiResponse.internalError(accessError, 'Failed to check project access');
		}
		if (!hasAccess) {
			return ApiResponse.forbidden(
				'You do not have permission to create tasks in this project'
			);
		}
		if (hasAssigneeInput) {
			await validateAssigneesAreProjectEligible({
				supabase,
				projectId,
				assigneeActorIds,
				projectOwnerActorId: project.created_by
			});
		}
		const normalizedPlanId =
			typeof plan_id === 'string' && plan_id.trim().length > 0 ? plan_id : null;
		// If plan_id is provided, verify it belongs to the project
		if (normalizedPlanId) {
			const { data: plan, error: planError } = await supabase
				.from('onto_plans')
				.select('id')
				.eq('id', normalizedPlanId)
				.is('deleted_at', null)
				.eq('project_id', projectId)
				.single();
			if (planError || !plan) {
				return ApiResponse.notFound('Plan');
			}
		}
		// Validate optional goal and milestone relationships
		let validatedGoalId: string | null = null;
		let validatedMilestoneId: string | null = null;
		const explicitParents = toParentRefs({ parent, parents });
		const normalizedGoalId =
			typeof goal_id === 'string' && goal_id.trim().length > 0 ? goal_id : null;
		const normalizedMilestoneId =
			typeof supporting_milestone_id === 'string' && supporting_milestone_id.trim().length > 0
				? supporting_milestone_id
				: null;
		const invalidParent = explicitParents.find(
			(parentRef) => !ALLOWED_PARENT_KINDS.has(parentRef.kind)
		);
		if (invalidParent) {
			return ApiResponse.badRequest(`Unsupported parent kind: ${invalidParent.kind}`);
		}
		const legacyConnections: ConnectionRef[] = [
			...explicitParents,
			...(normalizedPlanId ? [{ kind: 'plan' as const, id: normalizedPlanId }] : []),
			...(normalizedGoalId ? [{ kind: 'goal' as const, id: normalizedGoalId }] : []),
			...(normalizedMilestoneId
				? [
						{
							kind: 'milestone' as const,
							id: normalizedMilestoneId,
							rel: 'targets_milestone' as const
						}
					]
				: [])
		];
		const connectionList: ConnectionRef[] =
			Array.isArray(connections) && connections.length > 0 ? connections : legacyConnections;
		requestConnections = connectionList;
		if (connectionList.length > 0) {
			await assertEntityRefsInProject({
				supabase,
				projectId,
				refs: connectionList,
				allowProject: true
			});
		}
		if (normalizedGoalId) {
			validatedGoalId = normalizedGoalId;
		}
		if (normalizedMilestoneId) {
			validatedMilestoneId = normalizedMilestoneId;
		}
		// Create the task
		// Description is now a proper column (not just in props)
		// completed_at is auto-set when state_key is 'done'
		const taskData = {
			project_id: projectId,
			title: taskTitle,
			description: taskDescription ?? null,
			type_key: taskTypeKey,
			state_key: finalState,
			priority: taskPriority,
			start_at: taskStartAt,
			due_at: taskDueAt,
			created_by: actorId,
			props: {
				...taskProps,
				// Keep goal_id and milestone_id in props for edge reference
				...(validatedGoalId ? { goal_id: validatedGoalId } : {}),
				...(validatedMilestoneId ? { supporting_milestone_id: validatedMilestoneId } : {})
			},
			// Auto-set completed_at when creating a task as done
			...(finalState === 'done' ? { completed_at: new Date().toISOString() } : {})
		};
		const { data: task, error: createError } = await supabase
			.from('onto_tasks')
			.insert(taskData)
			.select('*')
			.single();
		if (createError) {
			console.error('Error creating task:', createError);
			await logOntologyApiError({
				supabase,
				error: createError,
				endpoint: '/api/onto/tasks/create',
				method: 'POST',
				userId: user.id,
				projectId,
				entityType: 'task',
				operation: 'task_create',
				tableName: 'onto_tasks'
			});
			return ApiResponse.databaseError(createError);
		}
		await autoOrganizeConnections({
			supabase,
			projectId,
			entity: { kind: 'task', id: task.id },
			connections: connectionList,
			options: { mode: 'replace' }
		});
		const actorDisplayName =
			(typeof user.name === 'string' && user.name) ||
			user.email?.split('@')[0] ||
			'A teammate';
		const mentionUserIds = await resolveEntityMentionUserIds({
			supabase,
			projectId,
			projectOwnerActorId: project.created_by,
			actorUserId: user.id,
			nextTextValues: [taskTitle, taskDescription]
		});
		let assignmentRecipientUserIds: string[] = [];
		if (hasAssigneeInput) {
			const { addedActorIds } = await syncTaskAssignees({
				supabase,
				projectId,
				taskId: task.id,
				assigneeActorIds,
				assignedByActorId: actorId
			});
			const { recipientUserIds } = await notifyTaskAssignmentAdded({
				supabase,
				projectId,
				projectName: project.name,
				taskId: task.id,
				taskTitle: task.title,
				actorUserId: user.id,
				actorDisplayName,
				addedAssigneeActorIds: addedActorIds,
				coalescedMentionUserIds: mentionUserIds
			});
			assignmentRecipientUserIds = recipientUserIds;
		}
		await notifyEntityMentionsAdded({
			supabase,
			projectId,
			projectName: project.name,
			entityType: 'task',
			entityId: task.id,
			entityTitle: task.title,
			actorUserId: user.id,
			actorDisplayName,
			mentionedUserIds: mentionUserIds,
			skipUserIds: assignmentRecipientUserIds
		});
		// Create or update linked events when task is scheduled
		try {
			const taskEventSync = new TaskEventSyncService(supabase);
			await taskEventSync.syncTaskEvents(user.id, actorId, task);
		} catch (eventError) {
			console.warn('[Task Create] Failed to sync task events:', eventError);
		}
		// Log activity async (non-blocking)
		logCreateAsync(
			supabase,
			projectId,
			'task',
			task.id,
			{
				title: task.title,
				type_key: task.type_key,
				state_key: task.state_key,
				start_at: task.start_at,
				due_at: task.due_at
			},
			user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);
		if (classificationSource === 'create_modal') {
			void classifyOntologyEntity({
				entityType: 'task',
				entityId: task.id,
				userId: user.id,
				classificationSource: 'create_modal'
			}).catch((err) => {
				if (dev) console.warn('[Task Create] Classification failed:', err);
			});
		}
		let taskWithAssignees = { ...task, assignees: [] as unknown[] };
		try {
			const assigneeMap = await fetchTaskAssigneesMap({ supabase, taskIds: [task.id] });
			taskWithAssignees = attachAssigneesToTask(task, assigneeMap);
		} catch (assigneeError) {
			console.warn('[Task Create] Failed to enrich assignees in response:', assigneeError);
		}
		return ApiResponse.created({ task: taskWithAssignees });
	} catch (error) {
		if (error instanceof TaskAssignmentValidationError) {
			return ApiResponse.error(error.message, error.status);
		}
		if (error instanceof AutoOrganizeError) {
			await logOntologyApiError({
				supabase: locals.supabase,
				error,
				endpoint: '/api/onto/tasks/create',
				method: 'POST',
				userId: user.id,
				projectId: requestProjectId,
				entityType: 'task',
				operation: 'task_auto_organize',
				metadata: {
					title: requestTitle,
					state_key: requestStateKey,
					plan_id: requestPlanId,
					goal_id: requestGoalId,
					supporting_milestone_id: requestMilestoneId,
					assignee_actor_ids: requestAssigneeActorIds,
					connections: requestConnections?.map((connection) => ({
						kind: connection.kind,
						id: connection.id,
						intent: connection.intent,
						rel: connection.rel
					}))
				}
			});
			return ApiResponse.error(error.message, error.status);
		}
		console.error('Error in task create endpoint:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: '/api/onto/tasks/create',
			method: 'POST',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: (error as any)?.project_id,
			entityType: 'task',
			operation: 'task_create'
		});
		return ApiResponse.internalError(error);
	}
};
