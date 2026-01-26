// apps/web/src/routes/api/homework/scratchpad/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

/**
 * GET /api/homework/scratchpad/[id]
 * Retrieves the scratchpad document content
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const { id } = params;
	const supabase = locals.supabase;
	const session = await locals.safeGetSession();

	if (!session?.user?.id) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const { data, error } = await supabase
		.from('onto_documents')
		.select('id, title, content, type_key, state_key, props, updated_at, project_id')
		.eq('id', id)
		.single();

	if (error) {
		console.error('[Scratchpad GET] Error fetching scratchpad:', error);
		return ApiResponse.error(error.message, 500);
	}

	if (!data) {
		return ApiResponse.error('Scratchpad not found', 404);
	}

	return ApiResponse.success(data);
};

/**
 * PATCH /api/homework/scratchpad/[id]
 * Updates the scratchpad document content
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const { id } = params;
	const supabase = locals.supabase;
	const session = await locals.safeGetSession();

	if (!session?.user?.id) {
		return ApiResponse.error('Unauthorized', 401);
	}

	let body: { content?: string; title?: string };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.error('Invalid JSON body', 400);
	}

	// Validate that at least one field is being updated
	if (body.content === undefined && body.title === undefined) {
		return ApiResponse.error('No fields to update', 400);
	}

	// Build update payload
	const updatePayload: Record<string, unknown> = {
		updated_at: new Date().toISOString()
	};

	if (body.content !== undefined) {
		updatePayload.content = body.content;
	}

	if (body.title !== undefined) {
		updatePayload.title = body.title;
	}

	const { data, error } = await supabase
		.from('onto_documents')
		.update(updatePayload)
		.eq('id', id)
		.select('id, title, content, type_key, state_key, props, updated_at')
		.single();

	if (error) {
		console.error('[Scratchpad PATCH] Error updating scratchpad:', error);
		return ApiResponse.error(error.message, 500);
	}

	if (!data) {
		return ApiResponse.error('Scratchpad not found', 404);
	}

	return ApiResponse.success(data);
};

/**
 * DELETE /api/homework/scratchpad/[id]
 * Soft-deletes the scratchpad document
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { id } = params;
	const supabase = locals.supabase;
	const session = await locals.safeGetSession();

	if (!session?.user?.id) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const { data, error } = await supabase
		.from('onto_documents')
		.update({
			deleted_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		})
		.eq('id', id)
		.select('id')
		.single();

	if (error) {
		console.error('[Scratchpad DELETE] Error deleting scratchpad:', error);
		return ApiResponse.error(error.message, 500);
	}

	if (!data) {
		return ApiResponse.error('Scratchpad not found', 404);
	}

	return ApiResponse.success({ deleted: true, id: data.id });
};
