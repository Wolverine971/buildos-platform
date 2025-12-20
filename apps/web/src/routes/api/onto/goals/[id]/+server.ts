// apps/web/src/routes/api/onto/goals/[id]/+server.ts
/**
 * Goal CRUD API Endpoints (GET, PATCH, DELETE)
 *
 * Handles read, update, and delete operations for goals in the ontology system.
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Data Models: /apps/web/docs/features/ontology/DATA_MODELS.md
 * - Implementation: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
 * - API Patterns: /apps/web/docs/technical/api/PATTERNS.md
 *
 * GET /api/onto/goals/[id]:
 * - Returns goal with template and FSM information
 * - Includes project ownership verification
 *
 * PATCH /api/onto/goals/[id]:
 * - Updates goal properties (name, description, priority, target_date)
 * - Maintains props object integrity
 *
 * DELETE /api/onto/goals/[id]:
 * - Removes goal and associated edges
 * - Verifies ownership before deletion
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/GoalEditModal.svelte
 * - Create Endpoint: /apps/web/src/routes/api/onto/goals/create/+server.ts
 * - Database: onto_goals, onto_edges tables
 *
 * Security:
 * - Uses locals.supabase for RLS enforcement
 * - Actor-based authorization
 * - Project ownership verification
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	logUpdateAsync,
	logDeleteAsync,
	getChangeSourceFromRequest
} from '$lib/services/async-activity-logger';

// GET /api/onto/goals/[id] - Get a single goal
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
			console.error('[Goal GET] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get goal with project to verify ownership (exclude soft-deleted)
		const { data: goal, error } = await supabase
			.from('onto_goals')
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

		if (error || !goal) {
			return ApiResponse.error('Goal not found', 404);
		}

		// Check if user owns the project
		if (goal.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
		}

		// Remove nested project data from response
		const { project, ...goalData } = goal;

		return ApiResponse.success({ goal: goalData });
	} catch (error) {
		console.error('Error fetching goal:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};

// PATCH /api/onto/goals/[id] - Update a goal
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const supabase = locals.supabase;

	try {
		const body = await request.json();
		const { name, description, priority, target_date, measurement_criteria, props } = body;

		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Goal PATCH] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get goal with project to verify ownership (exclude soft-deleted)
		const { data: existingGoal, error: fetchError } = await supabase
			.from('onto_goals')
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

		if (fetchError || !existingGoal) {
			return ApiResponse.error('Goal not found', 404);
		}

		// Check if user owns the project
		if (existingGoal.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
		}

		// Build update object
		const updateData: Record<string, unknown> = {
			updated_at: new Date().toISOString()
		};

		if (name !== undefined) updateData.name = name;

		// Update dedicated columns
		if (description !== undefined) {
			updateData.description = description || null;
		}
		if (target_date !== undefined) {
			updateData.target_date = target_date || null;
		}

		// Handle props update - merge with existing
		const propsUpdate: Record<string, unknown> = {
			...(existingGoal.props as Record<string, unknown>)
		};
		let hasPropsUpdate = false;

		if (props !== undefined && typeof props === 'object' && props !== null) {
			Object.assign(propsUpdate, props);
			hasPropsUpdate = true;
		}

		// Maintain backwards compatibility by also storing in props
		if (description !== undefined) {
			propsUpdate.description = description || null;
			hasPropsUpdate = true;
		}
		if (priority !== undefined) {
			propsUpdate.priority = priority || null;
			hasPropsUpdate = true;
		}
		if (target_date !== undefined) {
			propsUpdate.target_date = target_date || null;
			hasPropsUpdate = true;
		}
		if (measurement_criteria !== undefined) {
			propsUpdate.measurement_criteria = measurement_criteria || null;
			hasPropsUpdate = true;
		}

		if (hasPropsUpdate) {
			updateData.props = propsUpdate;
		}

		// Update the goal
		const { data: updatedGoal, error: updateError } = await supabase
			.from('onto_goals')
			.update(updateData)
			.eq('id', params.id)
			.select('*')
			.single();

		if (updateError) {
			console.error('Error updating goal:', updateError);
			return ApiResponse.error('Failed to update goal', 500);
		}

		// Log activity async (non-blocking)
		logUpdateAsync(
			supabase,
			existingGoal.project_id,
			'goal',
			params.id,
			{ name: existingGoal.name, props: existingGoal.props },
			{ name: updatedGoal.name, props: updatedGoal.props },
			actorId,
			getChangeSourceFromRequest(request)
		);

		return ApiResponse.success({ goal: updatedGoal });
	} catch (error) {
		console.error('Error updating goal:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};

// DELETE /api/onto/goals/[id] - Delete a goal
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
			console.error('[Goal DELETE] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get goal with project to verify ownership (exclude already deleted)
		const { data: goal, error: fetchError } = await supabase
			.from('onto_goals')
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

		if (fetchError || !goal) {
			return ApiResponse.error('Goal not found', 404);
		}

		// Check if user owns the project
		if (goal.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
		}

		const projectId = goal.project_id;
		const goalDataForLog = { name: goal.name, type_key: goal.type_key };

		// Soft delete the goal (set deleted_at timestamp)
		const { error: deleteError } = await supabase
			.from('onto_goals')
			.update({ deleted_at: new Date().toISOString() })
			.eq('id', params.id);

		if (deleteError) {
			console.error('Error deleting goal:', deleteError);
			return ApiResponse.error('Failed to delete goal', 500);
		}

		// Log activity async (non-blocking)
		logDeleteAsync(
			supabase,
			projectId,
			'goal',
			params.id,
			goalDataForLog,
			actorId,
			getChangeSourceFromRequest(request)
		);

		return ApiResponse.success({ message: 'Goal deleted successfully' });
	} catch (error) {
		console.error('Error deleting goal:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};
