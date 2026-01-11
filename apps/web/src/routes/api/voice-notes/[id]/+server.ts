// apps/web/src/routes/api/voice-notes/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

const TRANSCRIPTION_STATUSES = new Set(['pending', 'complete', 'failed', 'skipped']);

function parseOptionalString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalJson(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const voiceNoteId = params.id;

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

	const { error: storageError } = await supabase.storage
		.from(voiceNote.storage_bucket)
		.remove([voiceNote.storage_path]);

	if (storageError) {
		return ApiResponse.internalError(storageError, 'Failed to delete stored audio');
	}

	return ApiResponse.success({ id: voiceNoteId });
};

export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { safeGetSession, supabase }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const voiceNoteId = params.id;
	if (!voiceNoteId) {
		return ApiResponse.badRequest('Voice note id is required');
	}

	let payload: Record<string, unknown> = {};
	try {
		payload = (await request.json()) as Record<string, unknown>;
	} catch {
		return ApiResponse.badRequest('Invalid request payload');
	}

	const transcript = parseOptionalString(payload.transcript);
	const transcriptionStatus = parseOptionalString(payload.transcriptionStatus);
	const transcriptionSource = parseOptionalString(payload.transcriptionSource);
	const transcriptionModel = parseOptionalString(payload.transcriptionModel);
	const transcriptionError = parseOptionalString(payload.transcriptionError);
	const metadataInput = parseOptionalJson(payload.metadata);

	const { data: existing, error: fetchError } = await supabase
		.from('voice_notes')
		.select('id, metadata')
		.eq('id', voiceNoteId)
		.eq('user_id', user.id)
		.is('deleted_at', null)
		.single();

	if (fetchError || !existing) {
		return ApiResponse.notFound('Voice note');
	}

	const update: Record<string, unknown> = {};

	if (transcript !== null) {
		update.transcript = transcript;
		if (!transcriptionStatus) {
			update.transcription_status = 'complete';
		}
	}

	if (transcriptionStatus && TRANSCRIPTION_STATUSES.has(transcriptionStatus)) {
		update.transcription_status = transcriptionStatus;
	}

	if (transcriptionModel) {
		update.transcription_model = transcriptionModel;
	}

	if (transcriptionError) {
		update.transcription_error = transcriptionError;
	}

	if (metadataInput || transcriptionSource) {
		const mergedMetadata: Record<string, unknown> = {
			...(existing.metadata as Record<string, unknown> | null),
			...(metadataInput ?? {})
		};
		if (transcriptionSource) {
			mergedMetadata.transcription_source = transcriptionSource;
		}
		update.metadata = mergedMetadata;
	}

	if (Object.keys(update).length === 0) {
		return ApiResponse.badRequest('No updates provided');
	}

	const { data: updated, error: updateError } = await supabase
		.from('voice_notes')
		.update(update)
		.eq('id', voiceNoteId)
		.eq('user_id', user.id)
		.select()
		.single();

	if (updateError || !updated) {
		return ApiResponse.databaseError(updateError);
	}

	return ApiResponse.success(updated);
};
