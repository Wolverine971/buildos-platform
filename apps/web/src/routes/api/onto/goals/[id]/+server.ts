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
 * - Updates goal properties (name, description, priority, target_date, state)
 * - Validates state transitions against FSM
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

// GET /api/onto/goals/[id] - Get a single goal
export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const supabase = locals.supabase;

	try {
		// Get user's actor ID
		const { data: actor } = await supabase
			.rpc('ensure_actor_for_user', {
				p_user_id: session.user.id
			})
			.single();

		if (!actor) {
			return ApiResponse.error('Failed to get user actor', 500);
		}

		const actorId = (actor as any).actor_id;

		// Get goal with project to verify ownership
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
		const { name, description, priority, target_date, measurement_criteria, state_key, props } =
			body;

		// Get user's actor ID
		const { data: actor } = await supabase
			.rpc('ensure_actor_for_user', {
				p_user_id: session.user.id
			})
			.single();

		if (!actor) {
			return ApiResponse.error('Failed to get user actor', 500);
		}

		const actorId = (actor as any).actor_id;

		// Get goal with project to verify ownership
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
			.single();

		if (fetchError || !existingGoal) {
			return ApiResponse.error('Goal not found', 404);
		}

		// Check if user owns the project
		if (existingGoal.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
		}

		// Build update object
		const updateData: any = {
			updated_at: new Date().toISOString()
		};

		if (name !== undefined) updateData.name = name;
		if (state_key !== undefined) updateData.state_key = state_key;

		// Handle props update - merge with existing
		if (props !== undefined) {
			updateData.props = {
				...existingGoal.props,
				...props
			};
			// Handle individual fields in props
			if (description !== undefined) {
				updateData.props.description = description || null;
			}
			if (priority !== undefined) {
				updateData.props.priority = priority || null;
			}
			if (target_date !== undefined) {
				updateData.props.target_date = target_date || null;
			}
			if (measurement_criteria !== undefined) {
				updateData.props.measurement_criteria = measurement_criteria || null;
			}
		} else {
			// Update individual props fields even if props wasn't passed
			const propsUpdate: any = { ...existingGoal.props };
			let hasPropsUpdate = false;

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

		return ApiResponse.success({ goal: updatedGoal });
	} catch (error) {
		console.error('Error updating goal:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};

// DELETE /api/onto/goals/[id] - Delete a goal
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const supabase = locals.supabase;

	try {
		// Get user's actor ID
		const { data: actor } = await supabase
			.rpc('ensure_actor_for_user', {
				p_user_id: session.user.id
			})
			.single();

		if (!actor) {
			return ApiResponse.error('Failed to get user actor', 500);
		}

		const actorId = (actor as any).actor_id;

		// Get goal with project to verify ownership
		const { data: goal, error: fetchError } = await supabase
			.from('onto_goals')
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

		if (fetchError || !goal) {
			return ApiResponse.error('Goal not found', 404);
		}

		// Check if user owns the project
		if (goal.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
		}

		// Delete related edges
		await supabase
			.from('onto_edges')
			.delete()
			.or(`src_id.eq.${params.id},dst_id.eq.${params.id}`);

		// Delete the goal
		const { error: deleteError } = await supabase.from('onto_goals').delete().eq('id', params.id);

		if (deleteError) {
			console.error('Error deleting goal:', deleteError);
			return ApiResponse.error('Failed to delete goal', 500);
		}

		return ApiResponse.success({ message: 'Goal deleted successfully' });
	} catch (error) {
		console.error('Error deleting goal:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};
