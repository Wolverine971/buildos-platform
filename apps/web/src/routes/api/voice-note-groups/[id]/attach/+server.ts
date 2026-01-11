// apps/web/src/routes/api/voice-note-groups/[id]/attach/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

const GROUP_STATUSES = new Set(['draft', 'attached', 'orphaned']);

function parseOptionalString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalJson(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { safeGetSession, supabase }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const groupId = params.id;
	if (!groupId) {
		return ApiResponse.badRequest('Group id is required');
	}

	let payload: Record<string, unknown> = {};
	try {
		payload = (await request.json()) as Record<string, unknown>;
	} catch {
		return ApiResponse.badRequest('Invalid request payload');
	}

	const linkedEntityType = parseOptionalString(payload.linkedEntityType);
	const linkedEntityId = parseOptionalString(payload.linkedEntityId);
	const chatSessionId = parseOptionalString(payload.chatSessionId);
	const statusInput = parseOptionalString(payload.status);
	const metadataInput = parseOptionalJson(payload.metadata);

	if (!linkedEntityType || !linkedEntityId) {
		return ApiResponse.badRequest('linkedEntityType and linkedEntityId are required');
	}

	const status = statusInput && GROUP_STATUSES.has(statusInput) ? statusInput : 'attached';

	const { data: existing, error: fetchError } = await supabase
		.from('voice_note_groups')
		.select('metadata')
		.eq('id', groupId)
		.eq('user_id', user.id)
		.single();

	if (fetchError && fetchError.code !== 'PGRST116') {
		return ApiResponse.databaseError(fetchError);
	}

	const mergedMetadata: Record<string, unknown> = {
		...(existing?.metadata as Record<string, unknown> | null),
		...(metadataInput ?? {})
	};

	const upsertPayload = {
		id: groupId,
		user_id: user.id,
		linked_entity_type: linkedEntityType,
		linked_entity_id: linkedEntityId,
		chat_session_id: chatSessionId,
		status,
		metadata: mergedMetadata
	};

	const { data: updated, error: updateError } = await supabase
		.from('voice_note_groups')
		.upsert(upsertPayload, { onConflict: 'id' })
		.select()
		.single();

	if (updateError || !updated) {
		return ApiResponse.databaseError(updateError);
	}

	return ApiResponse.success(updated);
};
