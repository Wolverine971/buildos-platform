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
	getChangeSourceFromRequest
} from '$lib/services/async-activity-logger';

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
		const { name, state_key, description, props } = body;

		if (state_key !== undefined && !OUTPUT_STATES.includes(state_key)) {
			return ApiResponse.badRequest(`state_key must be one of: ${OUTPUT_STATES.join(', ')}`);
		}

		const supabase = locals.supabase;

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
			return ApiResponse.databaseError(fetchError);
		}

		if (!existingOutput) {
			return ApiResponse.notFound('Output not found');
		}

		// ✅ SECURITY: Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', existingOutput.project_id)
			.maybeSingle();

		if (projectError || !project) {
			console.error('[Output API] Failed to fetch project:', projectError);
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
			return ApiResponse.internalError(
				actorCheckError || new Error('Failed to resolve user actor')
			);
		}

		// Check if user owns the project (via actor)
		if (project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to update this output');
		}

		// Build update payload with proper typing
		interface UpdatePayload {
			name?: string;
			state_key?: string;
			description?: string;
			props?: Record<string, unknown>;
			updated_at?: string;
		}

		const updatePayload: UpdatePayload = {
			updated_at: new Date().toISOString()
		};

		if (name !== undefined) updatePayload.name = name;
		if (state_key !== undefined) updatePayload.state_key = state_key;
		if (description !== undefined) updatePayload.description = description?.trim() || null;
		if (props !== undefined) updatePayload.props = props;

		// Update the output
		const { data: updatedOutput, error: updateError } = await supabase
			.from('onto_outputs')
			.update(updatePayload)
			.eq('id', id)
			.select('*')
			.single();

		if (updateError) {
			console.error('[Output API] Failed to update output:', updateError);
			return ApiResponse.databaseError(updateError);
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
			actorId,
			getChangeSourceFromRequest(request)
		);

		return ApiResponse.success({ output: updatedOutput });
	} catch (err) {
		console.error('[Output API] Unexpected error in PATCH:', err);
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
			.select('*, project:onto_projects!inner(id, created_by)')
			.eq('id', id)
			.is('deleted_at', null)
			.maybeSingle();

		if (fetchError) {
			console.error('[Output API] Failed to fetch output:', fetchError);
			return ApiResponse.databaseError(fetchError);
		}

		if (!output) {
			return ApiResponse.notFound('Output not found');
		}

		// ✅ SECURITY: Verify user owns the project
		const project = output.project as any;

		// Get user's actor ID for ownership check
		const { data: actorId, error: actorCheckError } = await supabase.rpc(
			'ensure_actor_for_user',
			{
				p_user_id: user.id
			}
		);

		if (actorCheckError || !actorId) {
			console.error('[Output API] Failed to get actor:', actorCheckError);
			return ApiResponse.internalError(
				actorCheckError || new Error('Failed to resolve user actor')
			);
		}

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to view this output');
		}

		return ApiResponse.success({ output });
	} catch (err) {
		console.error('[Output API] Unexpected error in GET:', err);
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

		// Exclude already soft-deleted outputs
		const { data: output, error: fetchError } = await supabase
			.from('onto_outputs')
			.select('id, project_id, name, type_key')
			.eq('id', id)
			.is('deleted_at', null)
			.maybeSingle();

		if (fetchError) {
			console.error('[Output API] Failed to fetch output for delete:', fetchError);
			return ApiResponse.databaseError(fetchError);
		}

		if (!output) {
			return ApiResponse.notFound('Output');
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', output.project_id)
			.maybeSingle();

		if (projectError) {
			console.error('[Output API] Failed to fetch project for delete:', projectError);
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
			return ApiResponse.internalError(
				actorError || new Error('Failed to resolve user actor'),
				'Failed to resolve user identity'
			);
		}

		if (project.created_by !== actorId) {
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
			return ApiResponse.databaseError(deleteError);
		}

		// Log activity async (non-blocking)
		logDeleteAsync(
			supabase,
			projectId,
			'output',
			id,
			outputDataForLog,
			actorId,
			getChangeSourceFromRequest(request)
		);

		return ApiResponse.success({ deleted: true });
	} catch (error) {
		console.error('[Output API] Unexpected DELETE error:', error);
		return ApiResponse.internalError(error, 'Failed to delete output');
	}
};
