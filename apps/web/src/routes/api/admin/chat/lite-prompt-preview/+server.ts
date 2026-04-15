// apps/web/src/routes/api/admin/chat/lite-prompt-preview/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	buildLitePromptPreview,
	LitePromptPreviewInputError,
	type LitePromptPreviewRequest
} from '$lib/services/agentic-chat-lite/preview';

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const { data: adminUser, error: adminError } = await supabase
		.from('admin_users')
		.select('user_id')
		.eq('user_id', user.id)
		.single();

	if (adminError || !adminUser) {
		return ApiResponse.forbidden('Admin access required');
	}

	const body = (await request.json().catch(() => null)) as LitePromptPreviewRequest | null;
	if (!body || typeof body !== 'object') {
		return ApiResponse.badRequest('Invalid request body');
	}

	try {
		return ApiResponse.success(
			await buildLitePromptPreview({
				supabase,
				userId: user.id,
				input: body
			})
		);
	} catch (error) {
		if (error instanceof LitePromptPreviewInputError) {
			return ApiResponse.badRequest(error.message);
		}
		console.error('Lite prompt preview failed', error);
		return ApiResponse.internalError(error, 'Failed to build lite prompt preview');
	}
};
