// apps/web/src/routes/api/onto/milestones/[id]/+server.ts
/**
 * Milestone CRUD API Endpoints (GET, PATCH, DELETE)
 *
 * Handles read, update, and delete operations for milestones in the ontology system.
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Data Models: /apps/web/docs/features/ontology/DATA_MODELS.md
 * - Implementation: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
 * - API Patterns: /apps/web/docs/technical/api/PATTERNS.md
 *
 * GET /api/onto/milestones/[id]:
 * - Returns milestone with project ownership verification
 * - Includes state information from props
 *
 * PATCH /api/onto/milestones/[id]:
 * - Updates milestone properties (title, due_at, state_key, etc.)
 * - Maintains props object integrity
 *
 * DELETE /api/onto/milestones/[id]:
 * - Removes milestone and associated edges
 * - Verifies ownership before deletion
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/MilestoneEditModal.svelte
 * - Create Endpoint: /apps/web/src/routes/api/onto/milestones/create/+server.ts
 * - Database: onto_milestones, onto_edges tables
 *
 * Security:
 * - Uses locals.supabase for RLS enforcement
 * - Actor-based authorization
 * - Project ownership verification
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

const VALID_STATES = ['pending', 'in_progress', 'achieved', 'missed', 'deferred'] as const;
type MilestoneState = (typeof VALID_STATES)[number];

// GET /api/onto/milestones/[id] - Get a single milestone
export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;

	try {
		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Milestone GET] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get milestone with project to verify ownership
		const { data: milestone, error } = await supabase
			.from('onto_milestones')
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

		if (error || !milestone) {
			return ApiResponse.notFound('Milestone');
		}

		// Check if user owns the project
		if (milestone.project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have access to this milestone');
		}

		// Remove nested project data from response
		const { project, ...milestoneData } = milestone;

		return ApiResponse.success({ milestone: milestoneData });
	} catch (error) {
		console.error('[Milestone GET] Unexpected error:', error);
		return ApiResponse.internalError(error);
	}
};

// PATCH /api/onto/milestones/[id] - Update a milestone
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;

	try {
		const body = await request.json();
		const { title, due_at, state_key, description, props } = body;

		// Validate state_key if provided
		if (state_key !== undefined && !VALID_STATES.includes(state_key as MilestoneState)) {
			return ApiResponse.badRequest(`State must be one of: ${VALID_STATES.join(', ')}`);
		}

		// Validate due_at if provided
		if (due_at !== undefined && due_at !== null) {
			const dueDate = new Date(due_at);
			if (isNaN(dueDate.getTime())) {
				return ApiResponse.badRequest('Due date must be a valid ISO 8601 date');
			}
		}

		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Milestone PATCH] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get milestone with project to verify ownership
		const { data: existingMilestone, error: fetchError } = await supabase
			.from('onto_milestones')
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

		if (fetchError || !existingMilestone) {
			return ApiResponse.notFound('Milestone');
		}

		// Check if user owns the project
		if (existingMilestone.project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to modify this milestone');
		}

		// Build update object
		const updateData: Record<string, unknown> = {};

		if (title !== undefined) {
			if (typeof title !== 'string' || !title.trim()) {
				return ApiResponse.badRequest('Title cannot be empty');
			}
			updateData.title = title.trim();
		}

		if (due_at !== undefined) {
			if (due_at === null) {
				return ApiResponse.badRequest('Due date cannot be removed');
			}
			updateData.due_at = new Date(due_at).toISOString();
		}

		// Handle props update - merge with existing
		const currentProps = (existingMilestone.props as Record<string, unknown>) || {};
		let hasPropsUpdate = false;
		const propsUpdate: Record<string, unknown> = { ...currentProps };

		if (props !== undefined && typeof props === 'object' && props !== null) {
			Object.assign(propsUpdate, props);
			hasPropsUpdate = true;
		}

		if (description !== undefined) {
			propsUpdate.description = description?.trim() || null;
			hasPropsUpdate = true;
		}

		if (state_key !== undefined) {
			propsUpdate.state_key = state_key;
			hasPropsUpdate = true;
		}

		if (hasPropsUpdate) {
			updateData.props = propsUpdate;
		}

		// Only update if there's something to update
		if (Object.keys(updateData).length === 0) {
			return ApiResponse.badRequest('No valid update fields provided');
		}

		// Update the milestone
		const { data: updatedMilestone, error: updateError } = await supabase
			.from('onto_milestones')
			.update(updateData)
			.eq('id', params.id)
			.select('*')
			.single();

		if (updateError) {
			console.error('[Milestone PATCH] Error updating milestone:', updateError);
			return ApiResponse.error('Failed to update milestone', 500);
		}

		return ApiResponse.success({ milestone: updatedMilestone });
	} catch (error) {
		console.error('[Milestone PATCH] Unexpected error:', error);
		return ApiResponse.internalError(error);
	}
};

// DELETE /api/onto/milestones/[id] - Delete a milestone
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;

	try {
		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Milestone DELETE] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Get milestone with project to verify ownership
		const { data: milestone, error: fetchError } = await supabase
			.from('onto_milestones')
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

		if (fetchError || !milestone) {
			return ApiResponse.notFound('Milestone');
		}

		// Check if user owns the project
		if (milestone.project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to delete this milestone');
		}

		// Delete related edges
		await supabase
			.from('onto_edges')
			.delete()
			.or(`src_id.eq.${params.id},dst_id.eq.${params.id}`);

		// Delete the milestone
		const { error: deleteError } = await supabase
			.from('onto_milestones')
			.delete()
			.eq('id', params.id);

		if (deleteError) {
			console.error('[Milestone DELETE] Error deleting milestone:', deleteError);
			return ApiResponse.error('Failed to delete milestone', 500);
		}

		return ApiResponse.success({ message: 'Milestone deleted successfully' });
	} catch (error) {
		console.error('[Milestone DELETE] Unexpected error:', error);
		return ApiResponse.internalError(error);
	}
};
