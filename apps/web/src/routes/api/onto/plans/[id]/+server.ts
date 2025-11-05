// apps/web/src/routes/api/onto/plans/[id]/+server.ts
/**
 * Plan CRUD API Endpoints (GET, PATCH, DELETE)
 *
 * Handles read, update, and delete operations for plans in the ontology system.
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Data Models: /apps/web/docs/features/ontology/DATA_MODELS.md
 * - Implementation: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
 * - API Patterns: /apps/web/docs/technical/api/PATTERNS.md
 *
 * GET /api/onto/plans/[id]:
 * - Returns plan with template and FSM information
 * - Includes project ownership verification
 *
 * PATCH /api/onto/plans/[id]:
 * - Updates plan properties (name, description, dates, state)
 * - Validates state transitions against FSM
 * - Maintains props object integrity
 *
 * DELETE /api/onto/plans/[id]:
 * - Removes plan and associated edges
 * - Verifies ownership before deletion
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/PlanEditModal.svelte
 * - Create Endpoint: /apps/web/src/routes/api/onto/plans/create/+server.ts
 * - Database: onto_plans, onto_edges tables
 *
 * Security:
 * - Uses locals.supabase for RLS enforcement
 * - Actor-based authorization
 * - Project ownership verification
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

// GET /api/onto/plans/[id] - Get a single plan
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

		// Get plan with project to verify ownership
		const { data: plan, error } = await supabase
			.from('onto_plans')
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

		if (error || !plan) {
			return ApiResponse.error('Plan not found', 404);
		}

		// Check if user owns the project
		if (plan.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
		}

		// Remove nested project data from response
		const { project, ...planData } = plan;

		return ApiResponse.success({ plan: planData });
	} catch (error) {
		console.error('Error fetching plan:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};

// PATCH /api/onto/plans/[id] - Update a plan
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const supabase = locals.supabase;

	try {
		const body = await request.json();
		const { name, description, start_date, end_date, state_key, props } = body;

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

		// Get plan with project to verify ownership
		const { data: existingPlan, error: fetchError } = await supabase
			.from('onto_plans')
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

		if (fetchError || !existingPlan) {
			return ApiResponse.error('Plan not found', 404);
		}

		// Check if user owns the project
		if (existingPlan.project.created_by !== actorId) {
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
				...existingPlan.props,
				...props
			};
			// Handle individual fields in props
			if (description !== undefined) {
				updateData.props.description = description || null;
			}
			if (start_date !== undefined) {
				updateData.props.start_date = start_date || null;
			}
			if (end_date !== undefined) {
				updateData.props.end_date = end_date || null;
			}
		} else {
			// Update individual props fields even if props wasn't passed
			const propsUpdate: any = { ...existingPlan.props };
			let hasPropsUpdate = false;

			if (description !== undefined) {
				propsUpdate.description = description || null;
				hasPropsUpdate = true;
			}
			if (start_date !== undefined) {
				propsUpdate.start_date = start_date || null;
				hasPropsUpdate = true;
			}
			if (end_date !== undefined) {
				propsUpdate.end_date = end_date || null;
				hasPropsUpdate = true;
			}

			if (hasPropsUpdate) {
				updateData.props = propsUpdate;
			}
		}

		// Update the plan
		const { data: updatedPlan, error: updateError } = await supabase
			.from('onto_plans')
			.update(updateData)
			.eq('id', params.id)
			.select('*')
			.single();

		if (updateError) {
			console.error('Error updating plan:', updateError);
			return ApiResponse.error('Failed to update plan', 500);
		}

		return ApiResponse.success({ plan: updatedPlan });
	} catch (error) {
		console.error('Error updating plan:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};

// DELETE /api/onto/plans/[id] - Delete a plan
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

		// Get plan with project to verify ownership
		const { data: plan, error: fetchError } = await supabase
			.from('onto_plans')
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

		if (fetchError || !plan) {
			return ApiResponse.error('Plan not found', 404);
		}

		// Check if user owns the project
		if (plan.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
		}

		// Delete related edges
		await supabase
			.from('onto_edges')
			.delete()
			.or(`src_id.eq.${params.id},dst_id.eq.${params.id}`);

		// Delete the plan
		const { error: deleteError } = await supabase.from('onto_plans').delete().eq('id', params.id);

		if (deleteError) {
			console.error('Error deleting plan:', deleteError);
			return ApiResponse.error('Failed to delete plan', 500);
		}

		return ApiResponse.success({ message: 'Plan deleted successfully' });
	} catch (error) {
		console.error('Error deleting plan:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};
