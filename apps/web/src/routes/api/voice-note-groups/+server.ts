// apps/web/src/routes/api/voice-note-groups/+server.ts
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

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const linkedEntityType = url.searchParams.get('linkedEntityType');
	const linkedEntityId = url.searchParams.get('linkedEntityId');
	const chatSessionId = url.searchParams.get('chatSessionId');
	const status = url.searchParams.get('status');
	const limit = parseLimit(url.searchParams.get('limit'), 50);
	const offset = parseOffset(url.searchParams.get('offset'));

	let query = supabase
		.from('voice_note_groups')
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
	if (chatSessionId) {
		query = query.eq('chat_session_id', chatSessionId);
	}
	if (status && GROUP_STATUSES.has(status)) {
		query = query.eq('status', status);
	}

	const { data: groups, error } = await query;
	if (error) {
		return ApiResponse.databaseError(error);
	}

	return ApiResponse.success({ voiceNoteGroups: groups || [] });
};

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	let payload: Record<string, unknown> = {};
	try {
		payload = (await request.json()) as Record<string, unknown>;
	} catch {
		return ApiResponse.badRequest('Invalid request payload');
	}

	const id = parseOptionalString(payload.id);
	const linkedEntityType = parseOptionalString(payload.linkedEntityType);
	const linkedEntityId = parseOptionalString(payload.linkedEntityId);
	const chatSessionId = parseOptionalString(payload.chatSessionId);
	const statusInput = parseOptionalString(payload.status);
	const metadata = parseOptionalJson(payload.metadata) ?? {};

	const status = statusInput && GROUP_STATUSES.has(statusInput) ? statusInput : 'draft';

	const insertPayload: Record<string, unknown> = {
		user_id: user.id,
		status,
		metadata,
		linked_entity_type: linkedEntityType,
		linked_entity_id: linkedEntityId,
		chat_session_id: chatSessionId
	};

	if (id) {
		insertPayload.id = id;
	}

	const { data: created, error } = await supabase
		.from('voice_note_groups')
		.insert(insertPayload as any)
		.select()
		.single();

	if (error) {
		if (error.code === '23505' && id) {
			const { data: existing, error: fetchError } = await supabase
				.from('voice_note_groups')
				.select('*')
				.eq('id', id)
				.eq('user_id', user.id)
				.single();

			if (fetchError || !existing) {
				return ApiResponse.databaseError(fetchError ?? error);
			}

			return ApiResponse.success(existing);
		}

		return ApiResponse.databaseError(error);
	}

	return ApiResponse.created(created);
};
