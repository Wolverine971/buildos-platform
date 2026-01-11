// apps/web/src/routes/api/voice-notes/+server.ts
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_SYNC_TRANSCRIBE_SECONDS = 180; // 3 minutes
const TRANSCRIPTION_MODEL = env.TRANSCRIPTION_MODEL || 'gpt-4o-transcribe';

const ALLOWED_AUDIO_MIME_TYPES = [
	'audio/webm',
	'audio/ogg',
	'audio/mp4',
	'audio/wav',
	'audio/mpeg',
	'audio/mp3',
	'audio/aac'
];

const MIME_EXTENSION_MAP: Record<string, string> = {
	'audio/webm': 'webm',
	'audio/ogg': 'ogg',
	'audio/mp4': 'm4a',
	'audio/wav': 'wav',
	'audio/mpeg': 'mp3',
	'audio/mp3': 'mp3',
	'audio/aac': 'm4a'
};

function normalizeMimeType(mimeType: string): string {
	return mimeType.split(';')[0]?.trim().toLowerCase();
}

function getExtensionForMimeType(mimeType: string): string {
	return MIME_EXTENSION_MAP[mimeType] || 'webm';
}

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalJson(value: FormDataEntryValue | null): Record<string, unknown> | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	try {
		const parsed = JSON.parse(value);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
		return null;
	} catch {
		return null;
	}
}

function parseOptionalDate(value: FormDataEntryValue | null): string | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toISOString();
}

const TRANSCRIPTION_STATUSES = new Set(['pending', 'complete', 'failed', 'skipped']);

function parseLimit(value: string | null, fallback: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(Math.max(Math.floor(parsed), 1), 100);
}

function parseOffset(value: string | null): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.max(Math.floor(parsed), 0);
}

async function transcribeViaApi(
	audioFile: File,
	fetcher: typeof fetch,
	cookieHeader: string | null
): Promise<string> {
	const formData = new FormData();
	formData.append('audio', audioFile);

	const response = await fetcher('/api/transcribe', {
		method: 'POST',
		body: formData,
		headers: cookieHeader ? { cookie: cookieHeader } : undefined
	});

	if (!response.ok) {
		let errorMessage = `Transcription failed (${response.status})`;
		try {
			const payload = await response.json();
			if (payload?.error) {
				errorMessage = payload.error;
			}
		} catch {
			// Ignore JSON parse errors
		}
		throw new Error(errorMessage);
	}

	const payload = await response.json();
	if (payload?.success && payload?.data?.transcript) {
		return payload.data.transcript;
	}

	if (payload?.transcript) {
		return payload.transcript;
	}

	throw new Error('No transcript returned from transcription service');
}

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const linkedEntityType = url.searchParams.get('linkedEntityType');
	const linkedEntityId = url.searchParams.get('linkedEntityId');
	const groupId = url.searchParams.get('groupId');
	const groupIdsParam = url.searchParams.get('groupIds');
	const limit = parseLimit(url.searchParams.get('limit'), 50);
	const offset = parseOffset(url.searchParams.get('offset'));

	let query = supabase
		.from('voice_notes')
		.select('*')
		.eq('user_id', user.id)
		.is('deleted_at', null)
		.order('created_at', { ascending: false })
		.range(offset, offset + limit - 1);

	if (linkedEntityType) {
		query = query.eq('linked_entity_type', linkedEntityType);
	}
	if (linkedEntityId) {
		query = query.eq('linked_entity_id', linkedEntityId);
	}
	if (groupId) {
		query = query.eq('group_id', groupId);
	}
	if (groupIdsParam) {
		const groupIds = groupIdsParam
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean);
		if (groupIds.length > 0) {
			query = query.in('group_id', groupIds);
		}
	}

	const { data: voiceNotes, error } = await query;
	if (error) {
		return ApiResponse.databaseError(error);
	}

	return ApiResponse.success({ voiceNotes: voiceNotes || [] });
};

export const POST: RequestHandler = async ({
	request,
	locals: { safeGetSession, supabase },
	fetch
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const formData = await request.formData();
	const audioFile = formData.get('audio');

	if (!audioFile || !(audioFile instanceof File)) {
		return ApiResponse.badRequest('No audio file provided');
	}

	if (audioFile.size === 0) {
		return ApiResponse.badRequest('Audio file is empty');
	}

	if (audioFile.size > MAX_FILE_SIZE_BYTES) {
		return ApiResponse.badRequest('Audio file exceeds 50MB limit');
	}

	const rawMimeType = audioFile.type || '';
	const mimeType = normalizeMimeType(rawMimeType);

	if (!mimeType || !ALLOWED_AUDIO_MIME_TYPES.includes(mimeType)) {
		return ApiResponse.badRequest('Unsupported audio format');
	}

	const durationSeconds = parseOptionalNumber(formData.get('durationSeconds'));
	const linkedEntityType = parseOptionalString(formData.get('linkedEntityType'));
	const linkedEntityId = parseOptionalString(formData.get('linkedEntityId'));
	const transcribe = formData.get('transcribe') === 'true';
	const groupId = parseOptionalString(formData.get('groupId'));
	const segmentIndex = parseOptionalNumber(formData.get('segmentIndex'));
	const recordedAt = parseOptionalDate(formData.get('recordedAt'));
	const transcript = parseOptionalString(formData.get('transcript'));
	const transcriptionStatusInput = parseOptionalString(formData.get('transcriptionStatus'));
	const transcriptionSource = parseOptionalString(formData.get('transcriptionSource'));
	const transcriptionModelInput = parseOptionalString(formData.get('transcriptionModel'));
	const metadataInput = parseOptionalJson(formData.get('metadata')) || {};

	const noteId = crypto.randomUUID();
	const extension = getExtensionForMimeType(mimeType);
	const storagePath = `${user.id}/${noteId}.${extension}`;

	const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

	const { error: uploadError } = await supabase.storage
		.from('voice_notes')
		.upload(storagePath, audioBuffer, {
			contentType: rawMimeType || mimeType,
			upsert: false
		});

	if (uploadError) {
		return ApiResponse.internalError(uploadError, 'Failed to upload audio');
	}

	let initialStatus = transcribe ? 'pending' : 'skipped';
	if (transcriptionStatusInput && TRANSCRIPTION_STATUSES.has(transcriptionStatusInput)) {
		initialStatus = transcriptionStatusInput;
	}
	if (transcript) {
		initialStatus = 'complete';
	}

	const metadata = { ...metadataInput };
	if (transcriptionSource) {
		metadata.transcription_source = transcriptionSource;
	}

	const { data: inserted, error: insertError } = await supabase
		.from('voice_notes')
		.insert({
			id: noteId,
			user_id: user.id,
			storage_path: storagePath,
			storage_bucket: 'voice_notes',
			file_size_bytes: audioFile.size,
			duration_seconds: durationSeconds,
			mime_type: mimeType,
			transcription_status: initialStatus,
			transcription_model: transcriptionModelInput,
			transcript,
			linked_entity_type: linkedEntityType,
			linked_entity_id: linkedEntityId,
			group_id: groupId,
			segment_index: segmentIndex,
			recorded_at: recordedAt,
			metadata
		})
		.select()
		.single();

	if (insertError) {
		await supabase.storage.from('voice_notes').remove([storagePath]);
		return ApiResponse.databaseError(insertError);
	}

	let voiceNote = inserted;
	const shouldSyncTranscribe =
		transcribe && (durationSeconds === null || durationSeconds <= MAX_SYNC_TRANSCRIBE_SECONDS);

	if (transcribe && shouldSyncTranscribe && !transcript) {
		try {
			const transcript = await transcribeViaApi(
				audioFile,
				fetch,
				request.headers.get('cookie')
			);

			const { data: updated, error: updateError } = await supabase
				.from('voice_notes')
				.update({
					transcript,
					transcription_status: 'complete',
					transcription_model: TRANSCRIPTION_MODEL,
					transcription_error: null,
					metadata: {
						...metadata,
						transcription_source: metadata.transcription_source || 'audio'
					}
				})
				.eq('id', noteId)
				.select()
				.single();

			if (!updateError && updated) {
				voiceNote = updated;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Transcription failed';
			const { data: failedUpdate } = await supabase
				.from('voice_notes')
				.update({
					transcription_status: 'failed',
					transcription_model: TRANSCRIPTION_MODEL,
					transcription_error: message
				})
				.eq('id', noteId)
				.select()
				.single();
			if (failedUpdate) {
				voiceNote = failedUpdate;
			} else {
				voiceNote = {
					...voiceNote,
					transcription_status: 'failed',
					transcription_model: TRANSCRIPTION_MODEL,
					transcription_error: message
				};
			}
		}
	}

	return ApiResponse.created(voiceNote);
};
