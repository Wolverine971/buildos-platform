// apps/web/src/routes/api/onto/requirements/[id]/+server.ts
/**
 * Requirement CRUD API Endpoints (GET, PATCH, DELETE)
 *
 * Handles read, update, and delete operations for requirements in the ontology system.
 *
 * GET /api/onto/requirements/[id]:
 * - Returns requirement with project ownership verification
 *
 * PATCH /api/onto/requirements/[id]:
 * - Updates requirement properties (text, priority, type_key, props)
 *
 * DELETE /api/onto/requirements/[id]:
 * - Soft deletes requirement record
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
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';

// GET /api/onto/requirements/[id] - Get a single requirement
export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;

	try {
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Requirement GET] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		const { data: requirement, error } = await supabase
			.from('onto_requirements')
			.select(
				`
				*,
				project:onto_projects!inner(
					id,
					name,
					created_by
				)
			`
			)
			.eq('id', params.id)
			.is('deleted_at', null)
			.maybeSingle();

		if (error || !requirement) {
			return ApiResponse.notFound('Requirement');
		}

		if (requirement.project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have access to this requirement');
		}

		const { project, ...requirementData } = requirement;

		return ApiResponse.success({
			requirement: { ...requirementData, project: { name: project.name } }
		});
	} catch (error) {
		console.error('[Requirement GET] Unexpected error:', error);
		return ApiResponse.internalError(error);
	}
};

// PATCH /api/onto/requirements/[id] - Update a requirement
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);

	try {
		const body = await request.json();
		const { text, priority, type_key, props } = body;

		if (text !== undefined && (typeof text !== 'string' || !text.trim())) {
			return ApiResponse.badRequest('Requirement text cannot be empty');
		}

		if (priority !== undefined && priority !== null && !Number.isFinite(Number(priority))) {
			return ApiResponse.badRequest('Priority must be a number');
		}

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Requirement PATCH] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		const { data: existingRequirement, error: fetchError } = await supabase
			.from('onto_requirements')
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

		if (fetchError || !existingRequirement) {
			return ApiResponse.notFound('Requirement');
		}

		if (existingRequirement.project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to modify this requirement');
		}

		const updateData: Record<string, unknown> = {};
		const currentProps = (existingRequirement.props as Record<string, unknown>) || {};
		let hasPropsUpdate = false;
		const propsUpdate: Record<string, unknown> = { ...currentProps };

		if (text !== undefined) {
			updateData.text = text.trim();
		}

		if (priority !== undefined) {
			updateData.priority = priority !== null ? Number(priority) : null;
		}

		if (type_key !== undefined) {
			updateData.type_key = type_key;
		}

		if (props !== undefined && typeof props === 'object' && props !== null) {
			Object.assign(propsUpdate, props);
			hasPropsUpdate = true;
		}

		if (hasPropsUpdate) {
			updateData.props = propsUpdate;
		}

		updateData.updated_at = new Date().toISOString();

		if (Object.keys(updateData).length === 1 && updateData.updated_at) {
			return ApiResponse.badRequest('No valid update fields provided');
		}

		const { data: updatedRequirement, error: updateError } = await supabase
			.from('onto_requirements')
			.update(updateData)
			.eq('id', params.id)
			.select('*')
			.single();

		if (updateError) {
			console.error('[Requirement PATCH] Error updating requirement:', updateError);
			return ApiResponse.error('Failed to update requirement', 500);
		}

		logUpdateAsync(
			supabase,
			existingRequirement.project_id,
			'requirement',
			params.id,
			{
				text: existingRequirement.text,
				priority: existingRequirement.priority,
				type_key: existingRequirement.type_key
			},
			{
				text: updatedRequirement.text,
				priority: updatedRequirement.priority,
				type_key: updatedRequirement.type_key
			},
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ requirement: updatedRequirement });
	} catch (error) {
		console.error('[Requirement PATCH] Unexpected error:', error);
		return ApiResponse.internalError(error);
	}
};

// DELETE /api/onto/requirements/[id] - Delete a requirement
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);

	try {
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Requirement DELETE] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		const { data: requirement, error: fetchError } = await supabase
			.from('onto_requirements')
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

		if (fetchError || !requirement) {
			return ApiResponse.notFound('Requirement');
		}

		if (requirement.project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to delete this requirement');
		}

		const projectId = requirement.project_id;
		const requirementDataForLog = {
			text: requirement.text,
			priority: requirement.priority,
			type_key: requirement.type_key
		};

		const { error: deleteError } = await supabase
			.from('onto_requirements')
			.update({ deleted_at: new Date().toISOString() })
			.eq('id', params.id);

		if (deleteError) {
			console.error('[Requirement DELETE] Error deleting requirement:', deleteError);
			return ApiResponse.error('Failed to delete requirement', 500);
		}

		logDeleteAsync(
			supabase,
			projectId,
			'requirement',
			params.id,
			requirementDataForLog,
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ message: 'Requirement deleted successfully' });
	} catch (error) {
		console.error('[Requirement DELETE] Unexpected error:', error);
		return ApiResponse.internalError(error);
	}
};
