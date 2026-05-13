// apps/web/src/routes/api/users/voice-narration/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const payload = await request.json().catch(() => null);
	if (!payload || typeof payload !== 'object' || typeof payload.enabled !== 'boolean') {
		return ApiResponse.badRequest('Expected boolean enabled field');
	}

	const { data: userData, error: userError } = await supabase
		.from('users')
		.select('is_admin, voice_narration_enabled')
		.eq('id', user.id)
		.single();

	if (userError || !userData) {
		return ApiResponse.internalError(userError, 'Failed to load user settings');
	}

	if (payload.enabled && !userData.is_admin) {
		return ApiResponse.forbidden('Voice narration is currently limited to admins');
	}

	const { data: saved, error: updateError } = await supabase
		.from('users')
		.update({
			voice_narration_enabled: payload.enabled,
			updated_at: new Date().toISOString()
		})
		.eq('id', user.id)
		.select('voice_narration_enabled')
		.single();

	if (updateError || !saved) {
		return ApiResponse.internalError(updateError, 'Failed to update voice narration setting');
	}

	return ApiResponse.success({
		voice_narration_enabled: saved.voice_narration_enabled
	});
};
