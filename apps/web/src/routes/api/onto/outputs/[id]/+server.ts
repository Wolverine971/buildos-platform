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
		const { name, state_key, props } = body;

		const supabase = locals.supabase;

		// Verify the output exists and get project info
		const { data: existingOutput, error: fetchError } = await supabase
			.from('onto_outputs')
			.select('id, project_id')
			.eq('id', id)
			.maybeSingle();

		if (fetchError) {
			console.error('[Output API] Failed to fetch output:', fetchError);
			return ApiResponse.databaseError(fetchError.message);
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
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		// Check if user owns the project (via actor)
		if (project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to update this output');
		}

		// Build update payload with proper typing
		interface UpdatePayload {
			name?: string;
			state_key?: string;
			props?: Record<string, unknown>;
			updated_at?: string;
		}

		const updatePayload: UpdatePayload = {
			updated_at: new Date().toISOString()
		};

		if (name !== undefined) updatePayload.name = name;
		if (state_key !== undefined) updatePayload.state_key = state_key;
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
			return ApiResponse.databaseError(`Failed to update output: ${updateError.message}`);
		}

		return ApiResponse.success({ output: updatedOutput });
	} catch (err) {
		console.error('[Output API] Unexpected error in PATCH:', err);
		return ApiResponse.internalError('An unexpected error occurred');
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
		const { data: output, error: fetchError } = await supabase
			.from('onto_outputs')
			.select('*, project:onto_projects!inner(id, created_by)')
			.eq('id', id)
			.maybeSingle();

		if (fetchError) {
			console.error('[Output API] Failed to fetch output:', fetchError);
			return ApiResponse.databaseError(fetchError.message);
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
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to view this output');
		}

		return ApiResponse.success({ output });
	} catch (err) {
		console.error('[Output API] Unexpected error in GET:', err);
		return ApiResponse.internalError('An unexpected error occurred');
	}
};
