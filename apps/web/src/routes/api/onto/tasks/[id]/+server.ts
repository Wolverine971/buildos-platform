// apps/web/src/routes/api/onto/tasks/[id]/+server.ts
/**
 * Task CRUD API Endpoints (GET, PATCH, DELETE)
 *
 * Handles read, update, and delete operations for tasks in the ontology system.
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Data Models: /apps/web/docs/features/ontology/DATA_MODELS.md
 * - Implementation: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
 * - API Patterns: /apps/web/docs/technical/api/PATTERNS.md
 *
 * GET /api/onto/tasks/[id]:
 * - Returns task with FSM information
 * - Includes project ownership verification
 *
 * PATCH /api/onto/tasks/[id]:
 * - Updates task properties
 * - Validates state transitions against FSM
 * - Maintains props object integrity
 *
 * DELETE /api/onto/tasks/[id]:
 * - Removes task and associated edges
 * - Verifies ownership before deletion
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/TaskEditModal.svelte
 * - Create Endpoint: /apps/web/src/routes/api/onto/tasks/create/+server.ts
 * - Database: onto_tasks, onto_edges tables
 *
 * Security:
 * - Uses locals.supabase for RLS enforcement
 * - Actor-based authorization
 * - Project ownership verification
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { resolveLinkedEntities } from '../task-linked-helpers';
import { TASK_STATES } from '$lib/types/onto';
import {
	logUpdateAsync,
	logDeleteAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { normalizeTaskStateInput } from '../../shared/task-state';

// GET /api/onto/tasks/[id] - Get a single task
export const GET: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);

	try {
		// Parallelize initial queries: actor resolution and task fetch
		const [actorResult, taskResult] = await Promise.all([
			supabase.rpc('ensure_actor_for_user', { p_user_id: session.user.id }),
			supabase
				.from('onto_tasks')
				.select(
					`
					*,
					project:onto_projects!inner(
						id,
						created_by
					)
				`
				)
				.eq('id', params.id)
				.is('deleted_at', null) // Exclude soft-deleted tasks
				.single()
		]);

		const { data: actorId, error: actorError } = actorResult;
		const { data: task, error } = taskResult;

		if (actorError || !actorId) {
			console.error('[Task GET] Failed to resolve actor:', actorError);
			return ApiResponse.internalError(
				actorError || new Error('Failed to get user actor'),
				'Failed to get user actor'
			);
		}

		if (error || !task) {
			return ApiResponse.notFound('Task');
		}

		// Check if user owns the project
		if (task.project.created_by !== actorId) {
			return ApiResponse.forbidden('Access denied');
		}

		const linkedEntities = await resolveLinkedEntities(supabase, params.id);

		// Remove nested project data from response
		const { project, ...taskData } = task;

		return ApiResponse.success({ task: taskData, linkedEntities });
	} catch (error) {
		console.error('Error fetching task:', error);
		return ApiResponse.internalError(error, 'Internal server error');
	}
};

// PATCH /api/onto/tasks/[id] - Update a task
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);

	try {
		const body = await request.json();
		const {
			title,
			description,
			priority,
			state_key,
			type_key,
			props,
			goal_id,
			supporting_milestone_id,
			start_at,
			due_at
		} = body;

		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Task PATCH] Failed to resolve actor:', actorError);
			return ApiResponse.internalError(
				actorError || new Error('Failed to get user actor'),
				'Failed to get user actor'
			);
		}

		const hasGoalInput = Object.prototype.hasOwnProperty.call(body, 'goal_id');
		const hasMilestoneInput = Object.prototype.hasOwnProperty.call(
			body,
			'supporting_milestone_id'
		);

		let validatedGoalId: string | null | undefined = undefined;
		let validatedMilestoneId: string | null | undefined = undefined;

		// Get task with project to verify ownership
		const { data: existingTask, error: fetchError } = await supabase
			.from('onto_tasks')
			.select(
				`
				*,
				project:onto_projects!inner(
					id,
					created_by
				)
			`
			)
			.eq('id', params.id)
			.is('deleted_at', null)
			.single();

		if (fetchError || !existingTask) {
			return ApiResponse.notFound('Task');
		}

		// Check if user owns the project
		if (existingTask.project.created_by !== actorId) {
			return ApiResponse.forbidden('Access denied');
		}

		// Validate optional goal and milestone updates against the project
		if (hasGoalInput) {
			const targetGoalId =
				typeof goal_id === 'string' && goal_id.trim().length > 0 ? goal_id : null;
			if (targetGoalId) {
				const { data: goal, error: goalError } = await supabase
					.from('onto_goals')
					.select('id')
					.eq('id', targetGoalId)
					.eq('project_id', existingTask.project_id)
					.single();

				if (goalError || !goal) {
					return ApiResponse.notFound('Goal');
				}
				validatedGoalId = goal.id;
			} else {
				validatedGoalId = null;
			}
		}

		if (hasMilestoneInput) {
			const targetMilestoneId =
				typeof supporting_milestone_id === 'string' &&
				supporting_milestone_id.trim().length > 0
					? supporting_milestone_id
					: null;
			if (targetMilestoneId) {
				const { data: milestone, error: milestoneError } = await supabase
					.from('onto_milestones')
					.select('id')
					.eq('id', targetMilestoneId)
					.eq('project_id', existingTask.project_id)
					.single();

				if (milestoneError || !milestone) {
					return ApiResponse.notFound('Milestone');
				}
				validatedMilestoneId = milestone.id;
			} else {
				validatedMilestoneId = null;
			}
		}

		// Build update object
		const updateData: any = {
			updated_at: new Date().toISOString()
		};

		if (title !== undefined) updateData.title = title;
		if (priority !== undefined) updateData.priority = priority;
		if (type_key !== undefined) updateData.type_key = type_key;
		if (start_at !== undefined) updateData.start_at = start_at || null;
		if (due_at !== undefined) updateData.due_at = due_at;

		// Handle description as a direct column (no longer in props)
		if (description !== undefined) {
			updateData.description = description || null;
		}

		// Handle state_key transitions and completed_at
		if (state_key !== undefined) {
			const normalizedState = normalizeTaskStateInput(state_key);
			if (!normalizedState) {
				return ApiResponse.badRequest(
					`state_key must be one of: ${TASK_STATES.join(', ')}`
				);
			}
			updateData.state_key = normalizedState;
			const wasNotDone = existingTask.state_key !== 'done';
			const isNowDone = normalizedState === 'done';
			const wasAlreadyDone = existingTask.state_key === 'done';
			const isNoLongerDone = normalizedState !== 'done';

			// Transitioning TO done: set completed_at
			if (wasNotDone && isNowDone) {
				updateData.completed_at = new Date().toISOString();
			}
			// Transitioning FROM done: clear completed_at
			else if (wasAlreadyDone && isNoLongerDone) {
				updateData.completed_at = null;
			}
		}

		// Handle props update - merge with existing (description no longer stored here)
		const currentProps = (existingTask.props as Record<string, unknown> | null) ?? {};
		const nextProps = { ...currentProps, ...(props || {}) };
		let includeProps = false;

		if (props !== undefined) {
			includeProps = true;
		}

		if (hasGoalInput) {
			if (validatedGoalId) {
				nextProps.goal_id = validatedGoalId;
			} else {
				nextProps.goal_id = null;
			}
			includeProps = true;
		}

		if (hasMilestoneInput) {
			if (validatedMilestoneId) {
				nextProps.supporting_milestone_id = validatedMilestoneId;
			} else {
				nextProps.supporting_milestone_id = null;
			}
			includeProps = true;
		}

		if (includeProps) {
			updateData.props = nextProps;
		}

		// Update the task
		const { data: updatedTask, error: updateError } = await supabase
			.from('onto_tasks')
			.update(updateData)
			.eq('id', params.id)
			.select('*')
			.single();

		if (updateError) {
			console.error('Error updating task:', updateError);
			return ApiResponse.databaseError(updateError);
		}

		// Maintain relationship edges when goal/milestone updates are provided
		if (hasGoalInput) {
			// Remove existing goal relationships for this task
			await supabase
				.from('onto_edges')
				.delete()
				.in('rel', ['supports_goal', 'achieved_by'])
				.or(`src_id.eq.${params.id},dst_id.eq.${params.id}`);

			if (validatedGoalId) {
				await supabase.from('onto_edges').insert({
					project_id: existingTask.project_id,
					src_id: params.id,
					src_kind: 'task',
					dst_id: validatedGoalId,
					dst_kind: 'goal',
					rel: 'supports_goal'
				});
			}
		}

		if (hasMilestoneInput) {
			await supabase
				.from('onto_edges')
				.delete()
				.eq('rel', 'targets_milestone')
				.or(`src_id.eq.${params.id},dst_id.eq.${params.id}`);

			await supabase
				.from('onto_edges')
				.delete()
				.eq('rel', 'contains')
				.eq('src_kind', 'milestone')
				.eq('dst_kind', 'task')
				.eq('dst_id', params.id);

			if (validatedMilestoneId) {
				await supabase.from('onto_edges').insert({
					project_id: existingTask.project_id,
					src_id: params.id,
					src_kind: 'task',
					dst_id: validatedMilestoneId,
					dst_kind: 'milestone',
					rel: 'targets_milestone'
				});
			}
		}

		// Log activity async (non-blocking)
		logUpdateAsync(
			supabase,
			existingTask.project_id,
			'task',
			params.id,
			{
				title: existingTask.title,
				state_key: existingTask.state_key,
				props: existingTask.props
			},
			{
				title: updatedTask.title,
				state_key: updatedTask.state_key,
				props: updatedTask.props
			},
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ task: updatedTask });
	} catch (error) {
		console.error('Error updating task:', error);
		return ApiResponse.internalError(error, 'Internal server error');
	}
};

// DELETE /api/onto/tasks/[id] - Soft delete a task
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);

	try {
		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Task DELETE] Failed to resolve actor:', actorError);
			return ApiResponse.internalError(
				actorError || new Error('Failed to get user actor'),
				'Failed to get user actor'
			);
		}

		// Get task with project to verify ownership (fetch full data for logging)
		const { data: task, error: fetchError } = await supabase
			.from('onto_tasks')
			.select(
				`
				*,
				project:onto_projects!inner(
					id,
					created_by
				)
			`
			)
			.eq('id', params.id)
			.is('deleted_at', null) // Only allow deleting non-deleted tasks
			.single();

		if (fetchError || !task) {
			return ApiResponse.notFound('Task');
		}

		// Check if user owns the project
		if (task.project.created_by !== actorId) {
			return ApiResponse.forbidden('Access denied');
		}

		const projectId = task.project_id;
		const taskDataForLog = {
			title: task.title,
			type_key: task.type_key,
			state_key: task.state_key
		};

		// Soft delete: set deleted_at timestamp instead of hard delete
		const { error: deleteError } = await supabase
			.from('onto_tasks')
			.update({
				deleted_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', params.id);

		if (deleteError) {
			console.error('Error soft-deleting task:', deleteError);
			return ApiResponse.error('Failed to delete task', 500);
		}

		// Note: We keep the edges for soft-deleted tasks to preserve relationships
		// They will be filtered out when querying active tasks

		// Log activity async (non-blocking)
		logDeleteAsync(
			supabase,
			projectId,
			'task',
			params.id,
			taskDataForLog,
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ message: 'Task deleted successfully' });
	} catch (error) {
		console.error('Error deleting task:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};
