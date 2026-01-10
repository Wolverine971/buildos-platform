// apps/web/src/routes/api/onto/outputs/[id]/+server.ts
/**
 * PATCH /api/onto/outputs/[id]
 * Update an existing output
 *
 * GET /api/onto/outputs/[id]
 * Get a single output
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { OUTPUT_STATES } from '$lib/types/onto';
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

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id } = params;
		if (!id) {
			return ApiResponse.badRequest('Output ID required');
		}

		const body = await request.json();
		const { name, state_key, description, props, parent, parents, connections } = body;

		if (state_key !== undefined && !OUTPUT_STATES.includes(state_key)) {
			return ApiResponse.badRequest(`state_key must be one of: ${OUTPUT_STATES.join(', ')}`);
		}

		const supabase = locals.supabase;
		const chatSessionId = getChatSessionIdFromRequest(request);

		// Verify the output exists and get project info (fetch more data for logging)
		// Exclude soft-deleted outputs
		const { data: existingOutput, error: fetchError } = await supabase
			.from('onto_outputs')
			.select('id, project_id, name, type_key, state_key, description')
			.eq('id', id)
			.is('deleted_at', null)
			.maybeSingle();

		if (fetchError) {
			console.error('[Output API] Failed to fetch output:', fetchError);
			await logOntologyApiError({
				supabase,
				error: fetchError,
				endpoint: `/api/onto/outputs/${id}`,
				method: 'PATCH',
				userId: user.id,
				entityType: 'output',
				entityId: id,
				operation: 'output_fetch',
				tableName: 'onto_outputs'
			});
			return ApiResponse.databaseError(fetchError);
		}

		if (!existingOutput) {
			return ApiResponse.notFound('Output not found');
		}

		// ✅ SECURITY: Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id')
			.eq('id', existingOutput.project_id)
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError || !project) {
			console.error('[Output API] Failed to fetch project:', projectError);
			if (projectError) {
				await logOntologyApiError({
					supabase,
					error: projectError,
					endpoint: `/api/onto/outputs/${id}`,
					method: 'PATCH',
					userId: user.id,
					projectId: existingOutput.project_id,
					entityType: 'project',
					operation: 'output_project_fetch',
					tableName: 'onto_projects'
				});
			}
			return ApiResponse.notFound('Project not found');
		}

		// Get user's actor ID for ownership check
		const { data: actorId, error: actorCheckError } = await supabase.rpc(
			'ensure_actor_for_user',
			{
				p_user_id: user.id
			}
		);

		if (actorCheckError || !actorId) {
			console.error('[Output API] Failed to get actor:', actorCheckError);
			await logOntologyApiError({
				supabase,
				error: actorCheckError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/outputs/${id}`,
				method: 'PATCH',
				userId: user.id,
				projectId: existingOutput.project_id,
				entityType: 'output',
				entityId: id,
				operation: 'output_actor_resolve'
			});
			return ApiResponse.internalError(
				actorCheckError || new Error('Failed to resolve user actor')
			);
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: existingOutput.project_id,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			console.error('[Output API] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/outputs/${id}`,
				method: 'PATCH',
				userId: user.id,
				projectId: existingOutput.project_id,
				entityType: 'output',
				entityId: id,
				operation: 'output_access_check'
			});
			return ApiResponse.internalError(accessError, 'Failed to check project access');
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('You do not have permission to update this output');
		}

		// Build update payload
		// Note: We cast the payload to satisfy Supabase's stricter Json type requirements.
		// Record<string, unknown> from request body is compatible at runtime but not at type level.
		const updatePayload: Record<string, unknown> = {
			updated_at: new Date().toISOString()
		};

		if (name !== undefined) updatePayload.name = name;
		if (state_key !== undefined) updatePayload.state_key = state_key;
		if (description !== undefined) updatePayload.description = description?.trim() || null;
		if (props !== undefined) updatePayload.props = props;

		// Update the output
		const { data: updatedOutput, error: updateError } = await supabase
			.from('onto_outputs')
			.update(updatePayload as any)
			.eq('id', id)
			.select('*')
			.single();

		if (updateError) {
			console.error('[Output API] Failed to update output:', updateError);
			await logOntologyApiError({
				supabase,
				error: updateError,
				endpoint: `/api/onto/outputs/${id}`,
				method: 'PATCH',
				userId: user.id,
				projectId: existingOutput.project_id,
				entityType: 'output',
				entityId: id,
				operation: 'output_update',
				tableName: 'onto_outputs'
			});
			return ApiResponse.databaseError(updateError);
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
					projectId: existingOutput.project_id,
					refs: connectionList,
					allowProject: true
				});
			}

			await autoOrganizeConnections({
				supabase,
				projectId: existingOutput.project_id,
				entity: { kind: 'output', id },
				connections: connectionList,
				options: {
					mode: 'replace',
					skipContainment: true
				}
			});
		}

		// Log activity async (non-blocking)
		logUpdateAsync(
			supabase,
			existingOutput.project_id,
			'output',
			id,
			{
				name: existingOutput.name ?? 'unknown',
				state_key: existingOutput.state_key ?? 'unknown'
			},
			{ name: updatedOutput.name, state_key: updatedOutput.state_key },
			user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ output: updatedOutput });
	} catch (err) {
		if (err instanceof AutoOrganizeError) {
			return ApiResponse.error(err.message, err.status);
		}
		console.error('[Output API] Unexpected error in PATCH:', err);
		await logOntologyApiError({
			supabase: locals.supabase,
			error: err,
			endpoint: `/api/onto/outputs/${params.id ?? ''}`,
			method: 'PATCH',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'output',
			entityId: params.id,
			operation: 'output_update'
		});
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id } = params;
		if (!id) {
			return ApiResponse.badRequest('Output ID required');
		}

		const supabase = locals.supabase;

		// Fetch output with project info for authorization
		// Exclude soft-deleted outputs
		const { data: output, error: fetchError } = await supabase
			.from('onto_outputs')
			.select('*, project:onto_projects!inner(id)')
			.eq('id', id)
			.is('deleted_at', null)
			.maybeSingle();

		if (fetchError) {
			console.error('[Output API] Failed to fetch output:', fetchError);
			await logOntologyApiError({
				supabase,
				error: fetchError,
				endpoint: `/api/onto/outputs/${id}`,
				method: 'GET',
				userId: user.id,
				entityType: 'output',
				entityId: id,
				operation: 'output_fetch',
				tableName: 'onto_outputs'
			});
			return ApiResponse.databaseError(fetchError);
		}

		if (!output) {
			return ApiResponse.notFound('Output not found');
		}

		// Get user's actor ID for ownership check
		const { data: actorId, error: actorCheckError } = await supabase.rpc(
			'ensure_actor_for_user',
			{
				p_user_id: user.id
			}
		);

		if (actorCheckError || !actorId) {
			console.error('[Output API] Failed to get actor:', actorCheckError);
			await logOntologyApiError({
				supabase,
				error: actorCheckError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/outputs/${id}`,
				method: 'GET',
				userId: user.id,
				projectId: output.project_id,
				entityType: 'output',
				entityId: id,
				operation: 'output_actor_resolve'
			});
			return ApiResponse.internalError(
				actorCheckError || new Error('Failed to resolve user actor')
			);
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: output.project_id,
				p_required_access: 'read'
			}
		);

		if (accessError) {
			console.error('[Output API] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/outputs/${id}`,
				method: 'GET',
				userId: user.id,
				projectId: output.project_id,
				entityType: 'output',
				entityId: id,
				operation: 'output_access_check'
			});
			return ApiResponse.internalError(accessError, 'Failed to check project access');
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('You do not have permission to view this output');
		}

		return ApiResponse.success({ output });
	} catch (err) {
		console.error('[Output API] Unexpected error in GET:', err);
		await logOntologyApiError({
			supabase: locals.supabase,
			error: err,
			endpoint: `/api/onto/outputs/${params.id ?? ''}`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'output',
			entityId: params.id,
			operation: 'output_get'
		});
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id } = params;
		if (!id) {
			return ApiResponse.badRequest('Output ID required');
		}

		const supabase = locals.supabase;
		const chatSessionId = getChatSessionIdFromRequest(request);

		// Exclude already soft-deleted outputs
		const { data: output, error: fetchError } = await supabase
			.from('onto_outputs')
			.select('id, project_id, name, type_key')
			.eq('id', id)
			.is('deleted_at', null)
			.maybeSingle();

		if (fetchError) {
			console.error('[Output API] Failed to fetch output for delete:', fetchError);
			await logOntologyApiError({
				supabase,
				error: fetchError,
				endpoint: `/api/onto/outputs/${id}`,
				method: 'DELETE',
				userId: session.user.id,
				entityType: 'output',
				entityId: id,
				operation: 'output_fetch',
				tableName: 'onto_outputs'
			});
			return ApiResponse.databaseError(fetchError);
		}

		if (!output) {
			return ApiResponse.notFound('Output');
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id')
			.eq('id', output.project_id)
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError) {
			console.error('[Output API] Failed to fetch project for delete:', projectError);
			await logOntologyApiError({
				supabase,
				error: projectError,
				endpoint: `/api/onto/outputs/${id}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId: output.project_id,
				entityType: 'project',
				operation: 'output_project_fetch',
				tableName: 'onto_projects'
			});
			return ApiResponse.databaseError(projectError);
		}

		if (!project) {
			return ApiResponse.notFound('Project');
		}

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Output API] Failed to resolve actor for delete:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/outputs/${id}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId: output.project_id,
				entityType: 'output',
				entityId: id,
				operation: 'output_actor_resolve'
			});
			return ApiResponse.internalError(
				actorError || new Error('Failed to resolve user actor'),
				'Failed to resolve user identity'
			);
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: output.project_id,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			console.error('[Output API] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/outputs/${id}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId: output.project_id,
				entityType: 'output',
				entityId: id,
				operation: 'output_access_check'
			});
			return ApiResponse.internalError(accessError, 'Failed to check project access');
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('You do not have permission to delete this output');
		}

		const projectId = output.project_id;
		const outputDataForLog = {
			name: output.name ?? 'unknown',
			type_key: output.type_key ?? 'unknown'
		};

		// Soft delete the output (set deleted_at timestamp)
		const { error: deleteError } = await supabase
			.from('onto_outputs')
			.update({ deleted_at: new Date().toISOString() })
			.eq('id', id);

		if (deleteError) {
			console.error('[Output API] Failed to delete output:', deleteError);
			await logOntologyApiError({
				supabase,
				error: deleteError,
				endpoint: `/api/onto/outputs/${id}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId,
				entityType: 'output',
				entityId: id,
				operation: 'output_delete',
				tableName: 'onto_outputs'
			});
			return ApiResponse.databaseError(deleteError);
		}

		// Log activity async (non-blocking)
		logDeleteAsync(
			supabase,
			projectId,
			'output',
			id,
			outputDataForLog,
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ deleted: true });
	} catch (error) {
		console.error('[Output API] Unexpected DELETE error:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/outputs/${params.id ?? ''}`,
			method: 'DELETE',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'output',
			entityId: params.id,
			operation: 'output_delete'
		});
		return ApiResponse.internalError(error, 'Failed to delete output');
	}
};
