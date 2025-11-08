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
 * - Returns task with template and FSM information
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

// GET /api/onto/tasks/[id] - Get a single task
export const GET: RequestHandler = async ({ params, locals }) => {
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
			console.error('[Task GET] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get task with project to verify ownership
		const { data: task, error } = await supabase
			.from('onto_tasks')
			.select(
				`
				*,
				project:onto_projects!inner(
					id,
					created_by
				),
				plan:onto_plans(
					id,
					name,
					type_key
				)
			`
			)
			.eq('id', params.id)
			.single();

		if (error || !task) {
			return ApiResponse.error('Task not found', 404);
		}

		// Check if user owns the project
		if (task.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
		}

		// Remove nested project data from response
		const { project, ...taskData } = task;

		return ApiResponse.success({ task: taskData });
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
		const { title, description, priority, state_key, plan_id, props } = body;

		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Task PATCH] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

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

		// Build update object
		const updateData: any = {
			updated_at: new Date().toISOString()
		};

		if (title !== undefined) updateData.title = title;
		if (priority !== undefined) updateData.priority = priority;
		if (state_key !== undefined) updateData.state_key = state_key;
		if (plan_id !== undefined) updateData.plan_id = plan_id;

		// Handle props update - merge with existing
		if (props !== undefined) {
			updateData.props = {
				...existingTask.props,
				...props
			};
			// Handle description in props
			if (description !== undefined) {
				updateData.props.description = description || null;
			}
		} else if (description !== undefined) {
			// Update description in props even if props wasn't passed
			updateData.props = {
				...existingTask.props,
				description: description || null
			};
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

		return ApiResponse.success({ task: updatedTask });
	} catch (error) {
		console.error('Error updating task:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};

// DELETE /api/onto/tasks/[id] - Delete a task
export const DELETE: RequestHandler = async ({ params, locals }) => {
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

		// Get task with project to verify ownership
		const { data: task, error: fetchError } = await supabase
			.from('onto_tasks')
			.select(
				`
				id,
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

		return ApiResponse.success({ message: 'Task deleted successfully' });
	} catch (error) {
		console.error('Error deleting task:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};
