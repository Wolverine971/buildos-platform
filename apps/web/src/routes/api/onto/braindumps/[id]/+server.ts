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
		.single();

	if (error || !braindump) {
		return ApiResponse.notFound('Brain Dump not found');
	}

	return ApiResponse.success({ braindump });
};
