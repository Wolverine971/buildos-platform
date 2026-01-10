// apps/web/src/routes/api/voice-notes/[id]/play/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export const GET: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const voiceNoteId = params.id;

	const { data: voiceNote, error } = await supabase
		.from('voice_notes')
		.select('storage_path, storage_bucket')
		.eq('id', voiceNoteId)
		.eq('user_id', user.id)
		.is('deleted_at', null)
		.single();

	if (error || !voiceNote) {
		return ApiResponse.notFound('Voice note');
	}

	const { data: signedUrl, error: signedError } = await supabase.storage
		.from(voiceNote.storage_bucket)
		.createSignedUrl(voiceNote.storage_path, SIGNED_URL_TTL_SECONDS);

	if (signedError || !signedUrl?.signedUrl) {
		return ApiResponse.internalError(signedError, 'Failed to create signed URL');
	}

	const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

	return ApiResponse.success({ url: signedUrl.signedUrl, expiresAt });
};
