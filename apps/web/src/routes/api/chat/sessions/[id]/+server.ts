// apps/web/src/routes/api/chat/sessions/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();

	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const sessionId = params.id;
	if (!sessionId) {
		return ApiResponse.badRequest('Session id is required');
	}

	let payload: { title?: string } = {};

	try {
		payload = (await request.json()) as { title?: string };
	} catch {
		return ApiResponse.badRequest('Invalid request payload');
	}

	const title = payload.title?.trim();
	if (!title) {
		return ApiResponse.validationError('title', 'Title is required');
	}

	if (title.length > 120) {
		return ApiResponse.validationError('title', 'Title must be 120 characters or fewer');
	}

	const { data: existingSession, error: sessionError } = await supabase
		.from('chat_sessions')
		.select('*')
		.eq('id', sessionId)
		.eq('user_id', user.id)
		.single();

	if (sessionError || !existingSession) {
		return ApiResponse.notFound('Session');
	}

	const { data: updatedSession, error: updateError } = await supabase
		.from('chat_sessions')
		.update({
			title,
			updated_at: new Date().toISOString()
		})
		.eq('id', sessionId)
		.eq('user_id', user.id)
		.select('*')
		.single();

	if (updateError || !updatedSession) {
		return ApiResponse.internalError(updateError, 'Failed to rename chat session');
	}

	return ApiResponse.success({ session: updatedSession });
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const sessionId = params.id;
	if (!sessionId) {
		return ApiResponse.badRequest('Session id is required');
	}

	const { data: existingSession, error: sessionError } = await supabase
		.from('chat_sessions')
		.select('id')
		.eq('id', sessionId)
		.eq('user_id', user.id)
		.single();

	if (sessionError || !existingSession) {
		return ApiResponse.notFound('Session');
	}

	const { error: messagesError } = await supabase
		.from('chat_messages')
		.delete()
		.eq('session_id', sessionId);

	if (messagesError) {
		return ApiResponse.databaseError(messagesError);
	}

	const { error: deleteError } = await supabase
		.from('chat_sessions')
		.delete()
		.eq('id', sessionId)
		.eq('user_id', user.id);

	if (deleteError) {
		return ApiResponse.databaseError(deleteError);
	}

	return ApiResponse.success({ deleted: true });
};
