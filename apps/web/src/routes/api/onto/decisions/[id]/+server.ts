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
import {
	AutoOrganizeError,
	autoOrganizeConnections,
	assertEntityRefsInProject,
	toParentRefs
} from '$lib/services/ontology/auto-organizer.service';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';
import { logOntologyApiError } from '../../shared/error-logging';

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
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/decisions/${params.id}`,
				method: 'GET',
				userId: session.user.id,
				entityType: 'decision',
				entityId: params.id,
				operation: 'decision_actor_resolve'
			});
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
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/decisions/${params.id}`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'decision',
			entityId: params.id,
			operation: 'decision_get'
		});
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
		const {
			title,
			description,
			outcome,
			rationale,
			state_key,
			decision_at,
			props,
			type_key,
			parent,
			parents,
			connections
		} = body;

		if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
			return ApiResponse.badRequest('Title cannot be empty');
		}

		if (state_key !== undefined && state_key !== null && typeof state_key !== 'string') {
			return ApiResponse.badRequest('state_key must be a string');
		}

		if (description !== undefined && description !== null && typeof description !== 'string') {
			return ApiResponse.badRequest('description must be a string');
		}

		if (outcome !== undefined && outcome !== null && typeof outcome !== 'string') {
			return ApiResponse.badRequest('outcome must be a string');
		}

		if (rationale !== undefined && rationale !== null && typeof rationale !== 'string') {
			return ApiResponse.badRequest('rationale must be a string');
		}

		if (type_key !== undefined && type_key !== null && typeof type_key !== 'string') {
			return ApiResponse.badRequest('type_key must be a string');
		}

		// Validate state_key if provided
		const validStates = ['pending', 'made', 'deferred', 'reversed'];
		if (state_key !== undefined && !validStates.includes(state_key)) {
			return ApiResponse.badRequest(
				`Invalid state_key. Must be one of: ${validStates.join(', ')}`
			);
		}

		if (decision_at !== undefined && decision_at !== null) {
			if (typeof decision_at !== 'string') {
				return ApiResponse.badRequest('decision_at must be a valid ISO 8601 date');
			}
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
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/decisions/${params.id}`,
				method: 'PATCH',
				userId: session.user.id,
				entityType: 'decision',
				entityId: params.id,
				operation: 'decision_actor_resolve'
			});
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
			if (fetchError) {
				await logOntologyApiError({
					supabase,
					error: fetchError,
					endpoint: `/api/onto/decisions/${params.id}`,
					method: 'PATCH',
					userId: session.user.id,
					entityType: 'decision',
					entityId: params.id,
					operation: 'decision_fetch',
					tableName: 'onto_decisions'
				});
			}
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

		if (type_key !== undefined && type_key !== null) {
			const trimmedTypeKey = String(type_key).trim();
			if (!trimmedTypeKey) {
				return ApiResponse.badRequest('type_key cannot be empty');
			}
			updateData.type_key = trimmedTypeKey;
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
			await logOntologyApiError({
				supabase,
				error: updateError,
				endpoint: `/api/onto/decisions/${params.id}`,
				method: 'PATCH',
				userId: session.user.id,
				projectId: existingDecision.project_id,
				entityType: 'decision',
				entityId: params.id,
				operation: 'decision_update',
				tableName: 'onto_decisions'
			});
			return ApiResponse.error('Failed to update decision', 500);
		}

		const hasParentField = Object.prototype.hasOwnProperty.call(body, 'parent');
		const hasParentsField = Object.prototype.hasOwnProperty.call(body, 'parents');
		const hasConnectionsInput = Array.isArray(connections);
		const explicitParents = toParentRefs({ parent, parents });

		const connectionList: ConnectionRef[] =
			hasConnectionsInput && connections.length > 0 ? connections : explicitParents;

		if (hasParentField || hasParentsField || hasConnectionsInput) {
			if (connectionList.length > 0) {
				await assertEntityRefsInProject({
					supabase,
					projectId: existingDecision.project_id,
					refs: connectionList,
					allowProject: true
				});
			}

			await autoOrganizeConnections({
				supabase,
				projectId: existingDecision.project_id,
				entity: { kind: 'decision', id: params.id },
				connections: connectionList,
				options: { mode: 'replace' }
			});
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
		if (error instanceof AutoOrganizeError) {
			return ApiResponse.error(error.message, error.status);
		}
		console.error('[Decision PATCH] Unexpected error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/decisions/${params.id}`,
			method: 'PATCH',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'decision',
			entityId: params.id,
			operation: 'decision_update'
		});
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
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/decisions/${params.id}`,
				method: 'DELETE',
				userId: session.user.id,
				entityType: 'decision',
				entityId: params.id,
				operation: 'decision_actor_resolve'
			});
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
			if (fetchError) {
				await logOntologyApiError({
					supabase,
					error: fetchError,
					endpoint: `/api/onto/decisions/${params.id}`,
					method: 'DELETE',
					userId: session.user.id,
					entityType: 'decision',
					entityId: params.id,
					operation: 'decision_fetch',
					tableName: 'onto_decisions'
				});
			}
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
			await logOntologyApiError({
				supabase,
				error: deleteError,
				endpoint: `/api/onto/decisions/${params.id}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId,
				entityType: 'decision',
				entityId: params.id,
				operation: 'decision_delete',
				tableName: 'onto_decisions'
			});
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
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/decisions/${params.id}`,
			method: 'DELETE',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'decision',
			entityId: params.id,
			operation: 'decision_delete'
		});
		return ApiResponse.internalError(error);
	}
};
