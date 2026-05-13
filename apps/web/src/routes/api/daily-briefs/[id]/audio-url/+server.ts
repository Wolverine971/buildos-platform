// apps/web/src/routes/api/daily-briefs/[id]/audio-url/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const BRIEF_AUDIO_BUCKET = 'brief-audio';

export const GET: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const { data: brief, error } = await supabase
		.from('ontology_daily_briefs')
		.select('audio_status, audio_storage_path')
		.eq('id', params.id)
		.eq('user_id', user.id)
		.single();

	if (error || !brief) {
		return ApiResponse.notFound('Brief');
	}

	if (brief.audio_status !== 'ready' || !brief.audio_storage_path) {
		return ApiResponse.badRequest('Brief audio is not ready');
	}

	const { data: signedUrl, error: signedError } = await supabase.storage
		.from(BRIEF_AUDIO_BUCKET)
		.createSignedUrl(brief.audio_storage_path, SIGNED_URL_TTL_SECONDS);

	if (signedError || !signedUrl?.signedUrl) {
		return ApiResponse.internalError(signedError, 'Failed to create signed URL');
	}

	return ApiResponse.success({
		url: signedUrl.signedUrl,
		expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString()
	});
};
