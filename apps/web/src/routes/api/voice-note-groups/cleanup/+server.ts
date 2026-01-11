// apps/web/src/routes/api/voice-note-groups/cleanup/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

const DEFAULT_MAX_AGE_HOURS = 24;
const DEFAULT_GROUP_LIMIT = 50;

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	let payload: { maxAgeHours?: number; limit?: number } = {};
	try {
		payload = (await request.json()) as { maxAgeHours?: number; limit?: number };
	} catch {
		payload = {};
	}

	const maxAgeHours =
		typeof payload.maxAgeHours === 'number' && payload.maxAgeHours > 0
			? payload.maxAgeHours
			: DEFAULT_MAX_AGE_HOURS;
	const limit =
		typeof payload.limit === 'number' && payload.limit > 0
			? Math.min(Math.floor(payload.limit), 200)
			: DEFAULT_GROUP_LIMIT;

	const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

	const { data: groups, error: groupsError } = await supabase
		.from('voice_note_groups')
		.select('id')
		.eq('user_id', user.id)
		.eq('status', 'draft')
		.is('deleted_at', null)
		.lt('created_at', cutoff)
		.order('created_at', { ascending: true })
		.limit(limit);

	if (groupsError) {
		return ApiResponse.databaseError(groupsError);
	}

	const groupIds = (groups || []).map((group) => group.id);
	if (groupIds.length === 0) {
		return ApiResponse.success({ deletedGroupIds: [], deletedVoiceNotes: 0 });
	}

	const { data: notes, error: notesError } = await supabase
		.from('voice_notes')
		.select('id, storage_path, storage_bucket')
		.in('group_id', groupIds)
		.eq('user_id', user.id)
		.is('deleted_at', null);

	if (notesError) {
		return ApiResponse.databaseError(notesError);
	}

	const storageByBucket = new Map<string, string[]>();
	for (const note of notes || []) {
		if (!note.storage_bucket || !note.storage_path) continue;
		const existing = storageByBucket.get(note.storage_bucket) ?? [];
		existing.push(note.storage_path);
		storageByBucket.set(note.storage_bucket, existing);
	}

	if (notes && notes.length > 0) {
		const { error: markDeletedError } = await supabase
			.from('voice_notes')
			.update({ deleted_at: new Date().toISOString() })
			.in(
				'id',
				notes.map((note) => note.id)
			);

		if (markDeletedError) {
			return ApiResponse.databaseError(markDeletedError);
		}
	}

	for (const [bucket, paths] of storageByBucket.entries()) {
		const { error: storageError } = await supabase.storage.from(bucket).remove(paths);
		if (storageError) {
			return ApiResponse.internalError(storageError, 'Failed to delete stored audio');
		}
	}

	const { error: groupUpdateError } = await supabase
		.from('voice_note_groups')
		.update({ deleted_at: new Date().toISOString(), status: 'orphaned' })
		.in('id', groupIds);

	if (groupUpdateError) {
		return ApiResponse.databaseError(groupUpdateError);
	}

	return ApiResponse.success({
		deletedGroupIds: groupIds,
		deletedVoiceNotes: notes?.length ?? 0
	});
};
