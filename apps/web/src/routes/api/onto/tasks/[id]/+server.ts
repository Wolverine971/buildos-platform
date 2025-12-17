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
import {
	logUpdateAsync,
	logDeleteAsync,
	getChangeSourceFromRequest
} from '$lib/services/async-activity-logger';

// GET /api/onto/tasks/[id] - Get a single task
export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const supabase = locals.supabase;

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
				.single()
		]);

		const { data: actorId, error: actorError } = actorResult;
		const { data: task, error } = taskResult;

		if (actorError || !actorId) {
			console.error('[Task GET] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		if (error || !task) {
			return ApiResponse.error('Task not found', 404);
		}

		// Check if user owns the project
		if (task.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
		}

		// Parallelize secondary queries: plan edge and linked entities
		const [planEdgeResult, linkedEntities] = await Promise.all([
			supabase
				.from('onto_edges')
				.select('dst_id')
				.eq('src_kind', 'task')
				.eq('src_id', params.id)
				.eq('rel', 'belongs_to_plan')
				.eq('dst_kind', 'plan')
				.single(),
			resolveLinkedEntities(supabase, params.id)
		]);

		// Fetch plan data if edge exists (this is a dependent query)
		let plan = null;
		if (planEdgeResult.data?.dst_id) {
			const { data: planData } = await supabase
				.from('onto_plans')
				.select('id, name, type_key')
				.eq('id', planEdgeResult.data.dst_id)
				.single();

			if (planData) {
				plan = planData;
			}
		}

		// Remove nested project data from response, add plan
		const { project, ...taskData } = task;

		return ApiResponse.success({ task: { ...taskData, plan }, linkedEntities });
	} catch (error) {
		console.error('Error fetching task:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};

// PATCH /api/onto/tasks/[id] - Update a task
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const supabase = locals.supabase;

	try {
		const body = await request.json();
		const {
			title,
			description,
			priority,
			state_key,
			plan_id, // Still accepted from UI, but stored as edge relationship
			type_key,
			props,
			goal_id,
			supporting_milestone_id,
			due_at
		} = body;

		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Task PATCH] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
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
			.single();

		if (fetchError || !existingTask) {
			return ApiResponse.error('Task not found', 404);
		}

		// Check if user owns the project
		if (existingTask.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
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
		if (state_key !== undefined) updateData.state_key = state_key;
		if (type_key !== undefined) updateData.type_key = type_key;
		if (due_at !== undefined) updateData.due_at = due_at;

		const hasPlanInput = Object.prototype.hasOwnProperty.call(body, 'plan_id');

		// Handle props update - merge with existing
		const currentProps = (existingTask.props as Record<string, unknown> | null) ?? {};
		const nextProps = { ...currentProps, ...(props || {}) };
		let includeProps = false;

		if (props !== undefined) {
			includeProps = true;
		}

		if (description !== undefined) {
			nextProps.description = description || null;
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
			return ApiResponse.error('Failed to update task', 500);
		}

		// Maintain relationship edges when goal/milestone updates are provided
		if (hasGoalInput) {
			// Remove existing goal relationships for this task
			await supabase
				.from('onto_edges')
				.delete()
				.eq('rel', 'supports_goal')
				.eq('dst_kind', 'task')
				.eq('dst_id', params.id);

			if (validatedGoalId) {
				await supabase.from('onto_edges').insert({
					src_id: validatedGoalId,
					src_kind: 'goal',
					dst_id: params.id,
					dst_kind: 'task',
					rel: 'supports_goal'
				});
			}
		}

		if (hasMilestoneInput) {
			await supabase
				.from('onto_edges')
				.delete()
				.eq('rel', 'contains')
				.eq('src_kind', 'milestone')
				.eq('dst_kind', 'task')
				.eq('dst_id', params.id);

			if (validatedMilestoneId) {
				await supabase.from('onto_edges').insert({
					src_id: validatedMilestoneId,
					src_kind: 'milestone',
					dst_id: params.id,
					dst_kind: 'task',
					rel: 'contains'
				});
			}
		}

		// Handle plan relationship via edges (plan_id is no longer a column)
		if (hasPlanInput) {
			// Remove existing plan relationships for this task
			await supabase
				.from('onto_edges')
				.delete()
				.eq('rel', 'belongs_to_plan')
				.eq('src_kind', 'task')
				.eq('src_id', params.id);

			await supabase
				.from('onto_edges')
				.delete()
				.eq('rel', 'has_task')
				.eq('dst_kind', 'task')
				.eq('dst_id', params.id)
				.eq('src_kind', 'plan');

			const targetPlanId =
				typeof plan_id === 'string' && plan_id.trim().length > 0 ? plan_id : null;

			if (targetPlanId) {
				// Validate plan belongs to the same project
				const { data: planData, error: planError } = await supabase
					.from('onto_plans')
					.select('id')
					.eq('id', targetPlanId)
					.eq('project_id', existingTask.project_id)
					.single();

				if (planError || !planData) {
					return ApiResponse.notFound('Plan');
				}

				// Create bidirectional edges
				await supabase.from('onto_edges').insert([
					{
						src_id: params.id,
						src_kind: 'task',
						dst_id: targetPlanId,
						dst_kind: 'plan',
						rel: 'belongs_to_plan'
					},
					{
						src_id: targetPlanId,
						src_kind: 'plan',
						dst_id: params.id,
						dst_kind: 'task',
						rel: 'has_task'
					}
				]);
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
			actorId,
			getChangeSourceFromRequest(request)
		);

		return ApiResponse.success({ task: updatedTask });
	} catch (error) {
		console.error('Error updating task:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};

// DELETE /api/onto/tasks/[id] - Delete a task
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const supabase = locals.supabase;

	try {
		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Task DELETE] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
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
			.single();

		if (fetchError || !task) {
			return ApiResponse.error('Task not found', 404);
		}

		// Check if user owns the project
		if (task.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
		}

		const projectId = task.project_id;
		const taskDataForLog = {
			title: task.title,
			type_key: task.type_key,
			state_key: task.state_key
		};

		// Delete related edges
		await supabase
			.from('onto_edges')
			.delete()
			.or(`src_id.eq.${params.id},dst_id.eq.${params.id}`);

		// Delete the task
		const { error: deleteError } = await supabase
			.from('onto_tasks')
			.delete()
			.eq('id', params.id);

		if (deleteError) {
			console.error('Error deleting task:', deleteError);
			return ApiResponse.error('Failed to delete task', 500);
		}

		// Log activity async (non-blocking)
		logDeleteAsync(
			supabase,
			projectId,
			'task',
			params.id,
			taskDataForLog,
			actorId,
			getChangeSourceFromRequest(request)
		);

		return ApiResponse.success({ message: 'Task deleted successfully' });
	} catch (error) {
		console.error('Error deleting task:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};
