// apps/web/src/routes/api/onto/braindumps/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const braindumpId = params.id;
	if (!braindumpId) {
		return ApiResponse.badRequest('Brain Dump id is required');
	}

	const { data: braindump, error } = await locals.supabase
		.from('onto_braindumps')
		.select(
			'id, user_id, content, title, topics, summary, status, error_message, metadata, processed_at, chat_session_id, created_at, updated_at'
		)
		.eq('id', braindumpId)
		.eq('user_id', user.id)
		.is('deleted_at', null)
		.single();

	if (error || !braindump) {
		return ApiResponse.notFound('Brain Dump not found');
	}

	return ApiResponse.success({ braindump });
};

/**
 * Soft delete (deleted_at). The capture leaves History at once and is erased
 * 30 days later by cleanup_privacy_soft_deleted_braindumps
 * (20260924190600_privacy_gaps.sql).
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const braindumpId = params.id;
	if (!braindumpId) {
		return ApiResponse.badRequest('Brain Dump id is required');
	}

	// Owner check inside the RPC (auth.uid()); cast until the types are regenerated.
	const { error } = await (locals.supabase as any).rpc('delete_my_braindump', {
		p_braindump_id: braindumpId
	});

	if (error) {
		// P0002: not the caller's, or already deleted. 22P02: not a uuid.
		if (error.code === 'P0002' || error.code === '22P02') {
			return ApiResponse.notFound('Brain Dump');
		}
		return ApiResponse.databaseError(error);
	}

	return ApiResponse.success({ deleted: true });
};
