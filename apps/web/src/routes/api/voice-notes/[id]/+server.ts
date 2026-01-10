// apps/web/src/routes/api/voice-notes/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const DELETE: RequestHandler = async ({
	params,
	url,
	locals: { safeGetSession, supabase }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const voiceNoteId = params.id;
	const purge = url.searchParams.get('purge') === 'true';

	const { data: voiceNote, error: fetchError } = await supabase
		.from('voice_notes')
		.select('storage_path, storage_bucket')
		.eq('id', voiceNoteId)
		.eq('user_id', user.id)
		.is('deleted_at', null)
		.single();

	if (fetchError || !voiceNote) {
		return ApiResponse.notFound('Voice note');
	}

	const { error: updateError } = await supabase
		.from('voice_notes')
		.update({ deleted_at: new Date().toISOString() })
		.eq('id', voiceNoteId);

	if (updateError) {
		return ApiResponse.databaseError(updateError);
	}

	if (purge) {
		const { error: storageError } = await supabase.storage
			.from(voiceNote.storage_bucket)
			.remove([voiceNote.storage_path]);

		if (storageError) {
			return ApiResponse.internalError(storageError, 'Failed to delete stored audio');
		}
	}

	return ApiResponse.success({ id: voiceNoteId });
};
