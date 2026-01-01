// apps/web/src/routes/api/onto/decisions/[id]/+server.ts
/**
 * Decision CRUD API Endpoints (GET, PATCH, DELETE)
 *
 * Handles read, update, and delete operations for decisions in the ontology system.
 *
 * GET /api/onto/decisions/[id]:
 * - Returns decision with project ownership verification
 *
 * PATCH /api/onto/decisions/[id]:
 * - Updates decision properties (title, decision_at, rationale, props)
 *
 * DELETE /api/onto/decisions/[id]:
 * - Soft deletes decision record
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

// GET /api/onto/decisions/[id] - Get a single decision
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
			console.error('[Decision GET] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		const { data: decision, error } = await supabase
			.from('onto_decisions')
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

		if (error || !decision) {
			return ApiResponse.notFound('Decision');
		}

		if (decision.project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have access to this decision');
		}

		const { project, ...decisionData } = decision;

		return ApiResponse.success({
			decision: { ...decisionData, project: { name: project.name } }
		});
	} catch (error) {
		console.error('[Decision GET] Unexpected error:', error);
		return ApiResponse.internalError(error);
	}
};

// PATCH /api/onto/decisions/[id] - Update a decision
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);

	try {
		const body = await request.json();
		const { title, description, outcome, rationale, state_key, decision_at, props } = body;

		if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
			return ApiResponse.badRequest('Title cannot be empty');
		}

		// Validate state_key if provided
		const validStates = ['pending', 'made', 'deferred', 'reversed'];
		if (state_key !== undefined && !validStates.includes(state_key)) {
			return ApiResponse.badRequest(
				`Invalid state_key. Must be one of: ${validStates.join(', ')}`
			);
		}

		if (decision_at !== undefined && decision_at !== null) {
			const decisionDate = new Date(decision_at);
			if (isNaN(decisionDate.getTime())) {
				return ApiResponse.badRequest('decision_at must be a valid ISO 8601 date');
			}
		}

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Decision PATCH] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		const { data: existingDecision, error: fetchError } = await supabase
			.from('onto_decisions')
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

		if (fetchError || !existingDecision) {
			return ApiResponse.notFound('Decision');
		}

		if (existingDecision.project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to modify this decision');
		}

		const updateData: Record<string, unknown> = {};
		const currentProps = (existingDecision.props as Record<string, unknown>) || {};
		let hasPropsUpdate = false;
		const propsUpdate: Record<string, unknown> = { ...currentProps };

		if (title !== undefined) {
			updateData.title = title.trim();
		}

		if (description !== undefined) {
			updateData.description = description?.trim() || null;
		}

		if (outcome !== undefined) {
			updateData.outcome = outcome?.trim() || null;
		}

		if (rationale !== undefined) {
			updateData.rationale = rationale?.trim() || null;
		}

		if (state_key !== undefined) {
			updateData.state_key = state_key;
		}

		if (decision_at !== undefined) {
			updateData.decision_at = decision_at ? new Date(decision_at).toISOString() : null;
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

		const { data: updatedDecision, error: updateError } = await supabase
			.from('onto_decisions')
			.update(updateData)
			.eq('id', params.id)
			.select('*')
			.single();

		if (updateError) {
			console.error('[Decision PATCH] Error updating decision:', updateError);
			return ApiResponse.error('Failed to update decision', 500);
		}

		logUpdateAsync(
			supabase,
			existingDecision.project_id,
			'decision',
			params.id,
			{
				title: existingDecision.title,
				decision_at: existingDecision.decision_at,
				rationale: existingDecision.rationale
			},
			{
				title: updatedDecision.title,
				decision_at: updatedDecision.decision_at,
				rationale: updatedDecision.rationale
			},
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ decision: updatedDecision });
	} catch (error) {
		console.error('[Decision PATCH] Unexpected error:', error);
		return ApiResponse.internalError(error);
	}
};

// DELETE /api/onto/decisions/[id] - Delete a decision
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
			console.error('[Decision DELETE] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		const { data: decision, error: fetchError } = await supabase
			.from('onto_decisions')
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

		if (fetchError || !decision) {
			return ApiResponse.notFound('Decision');
		}

		if (decision.project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to delete this decision');
		}

		const projectId = decision.project_id;
		const decisionDataForLog = {
			title: decision.title,
			decision_at: decision.decision_at
		};

		const { error: deleteError } = await supabase
			.from('onto_decisions')
			.update({ deleted_at: new Date().toISOString() })
			.eq('id', params.id);

		if (deleteError) {
			console.error('[Decision DELETE] Error deleting decision:', deleteError);
			return ApiResponse.error('Failed to delete decision', 500);
		}

		logDeleteAsync(
			supabase,
			projectId,
			'decision',
			params.id,
			decisionDataForLog,
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ message: 'Decision deleted successfully' });
	} catch (error) {
		console.error('[Decision DELETE] Unexpected error:', error);
		return ApiResponse.internalError(error);
	}
};
