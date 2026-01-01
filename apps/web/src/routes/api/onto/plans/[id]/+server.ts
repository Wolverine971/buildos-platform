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
import { PLAN_STATES } from '$lib/types/onto';
import {
	logUpdateAsync,
	logDeleteAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';

// GET /api/onto/plans/[id] - Get a single plan
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
			console.error('[Plan GET] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get plan with project to verify ownership (exclude soft-deleted)
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
			.is('deleted_at', null)
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
	const chatSessionId = getChatSessionIdFromRequest(request);

	try {
		const body = await request.json();
		const { name, plan, description, start_date, end_date, state_key, props } = body;

		if (state_key !== undefined && !PLAN_STATES.includes(state_key)) {
			return ApiResponse.badRequest(`state_key must be one of: ${PLAN_STATES.join(', ')}`);
		}

		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Plan PATCH] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get plan with project to verify ownership (exclude soft-deleted)
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
			.is('deleted_at', null)
			.single();

		if (fetchError || !existingPlan) {
			return ApiResponse.error('Plan not found', 404);
		}

		// Check if user owns the project
		if (existingPlan.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
		}

		// Build update object
		const updateData: Record<string, unknown> = {
			updated_at: new Date().toISOString()
		};

		if (name !== undefined) updateData.name = name;
		if (state_key !== undefined) updateData.state_key = state_key;

		if (plan !== undefined) {
			updateData.plan = plan || null;
		}

		// Update description in dedicated column
		if (description !== undefined) {
			updateData.description = description || null;
		}

		// Handle props update - merge with existing
		const propsUpdate: Record<string, unknown> = {
			...(existingPlan.props as Record<string, unknown>)
		};
		let hasPropsUpdate = false;

		if (props !== undefined && typeof props === 'object' && props !== null) {
			Object.assign(propsUpdate, props);
			hasPropsUpdate = true;
		}

		// Maintain backwards compatibility by also storing in props
		if (plan !== undefined) {
			propsUpdate.plan = plan || null;
			hasPropsUpdate = true;
		}
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

		// Log activity async (non-blocking)
		logUpdateAsync(
			supabase,
			existingPlan.project_id,
			'plan',
			params.id,
			{
				name: existingPlan.name,
				state_key: existingPlan.state_key,
				props: existingPlan.props
			},
			{ name: updatedPlan.name, state_key: updatedPlan.state_key, props: updatedPlan.props },
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ plan: updatedPlan });
	} catch (error) {
		console.error('Error updating plan:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};

// DELETE /api/onto/plans/[id] - Delete a plan
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);

	try {
		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Plan DELETE] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get plan with project to verify ownership (exclude already deleted)
		const { data: plan, error: fetchError } = await supabase
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
			.is('deleted_at', null)
			.single();

		if (fetchError || !plan) {
			return ApiResponse.error('Plan not found', 404);
		}

		// Check if user owns the project
		if (plan.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
		}

		const projectId = plan.project_id;
		const planDataForLog = {
			name: plan.name,
			type_key: plan.type_key,
			state_key: plan.state_key
		};

		// Soft delete the plan (set deleted_at timestamp)
		const { error: deleteError } = await supabase
			.from('onto_plans')
			.update({ deleted_at: new Date().toISOString() })
			.eq('id', params.id);

		if (deleteError) {
			console.error('Error deleting plan:', deleteError);
			return ApiResponse.error('Failed to delete plan', 500);
		}

		// Log activity async (non-blocking)
		logDeleteAsync(
			supabase,
			projectId,
			'plan',
			params.id,
			planDataForLog,
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ message: 'Plan deleted successfully' });
	} catch (error) {
		console.error('Error deleting plan:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};
