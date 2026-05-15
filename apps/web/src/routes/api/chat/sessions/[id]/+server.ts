// apps/web/src/routes/api/chat/sessions/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

type ChatMessageAttachmentRow = {
	message_id?: string | null;
	asset_id?: string | null;
	project_id?: string | null;
	attachment_kind?: string | null;
	media_type?: string | null;
	role?: string | null;
	display_order?: number | null;
	metadata?: Record<string, unknown> | null;
	asset?: Record<string, unknown> | Record<string, unknown>[] | null;
};

function firstAsset(value: ChatMessageAttachmentRow['asset']): Record<string, unknown> | null {
	if (!value) return null;
	return Array.isArray(value) ? (value[0] ?? null) : value;
}

function readString(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function compactText(value: unknown, maxChars: number): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	return normalized.length <= maxChars
		? normalized
		: `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function buildAttachmentRef(row: ChatMessageAttachmentRow): Record<string, unknown> | null {
	if (row.media_type !== 'image') return null;
	const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};

	if (row.attachment_kind === 'temporary_file') {
		const temporaryAttachmentId = readString(metadata.temporary_attachment_id);
		if (!temporaryAttachmentId) return null;
		return {
			attachment_kind: 'temporary_file',
			media_type: 'image',
			temporary_attachment_id: temporaryAttachmentId,
			project_id: null,
			file_name: readString(metadata.file_name),
			content_type: readString(metadata.content_type),
			file_size_bytes: readNumber(metadata.file_size_bytes),
			width: readNumber(metadata.width),
			height: readNumber(metadata.height),
			checksum_sha256: readString(metadata.checksum_sha256),
			ocr_status: readString(metadata.ocr_status) ?? 'skipped',
			role: row.role ?? 'analysis_target',
			display_order: row.display_order ?? 0,
			expires_at: readString(metadata.expires_at),
			metadata: null
		};
	}

	if (row.attachment_kind !== 'onto_asset' || !row.asset_id) return null;
	const asset = firstAsset(row.asset);
	const assetId = readString(asset?.id) ?? row.asset_id;
	return {
		attachment_kind: 'onto_asset',
		media_type: 'image',
		asset_id: assetId,
		project_id: readString(asset?.project_id) ?? row.project_id ?? null,
		file_name: readString(asset?.original_filename) ?? readString(metadata.file_name),
		content_type: readString(asset?.content_type) ?? readString(metadata.content_type),
		file_size_bytes: readNumber(asset?.file_size_bytes) ?? readNumber(metadata.file_size_bytes),
		width: readNumber(asset?.width) ?? readNumber(metadata.width),
		height: readNumber(asset?.height) ?? readNumber(metadata.height),
		checksum_sha256: readString(asset?.checksum_sha256) ?? readString(metadata.checksum_sha256),
		ocr_status: readString(asset?.ocr_status) ?? readString(metadata.ocr_status) ?? 'pending',
		extraction_summary:
			compactText(asset?.extraction_summary, 700) ??
			compactText(metadata.extraction_summary, 700),
		extracted_text_preview:
			compactText(asset?.extracted_text, 1600) ??
			compactText(metadata.extracted_text_preview, 1600),
		role: row.role ?? 'analysis_target',
		display_order: row.display_order ?? 0,
		metadata: {
			preview_url: `/api/onto/assets/${assetId}/render?width=160`
		}
	};
}

/**
 * GET /api/chat/sessions/[id]
 *
 * Fetches a chat session with its messages for resumption.
 * Used by the history page when resuming a previous chat session.
 */
export const GET: RequestHandler = async ({
	params,
	url,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();

	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const sessionId = params.id;
	if (!sessionId) {
		return ApiResponse.badRequest('Session id is required');
	}

	// Fetch the session
	const { data: session, error: sessionError } = await supabase
		.from('chat_sessions')
		.select('*')
		.eq('id', sessionId)
		.eq('user_id', user.id)
		.single();

	if (sessionError || !session) {
		return ApiResponse.notFound('Chat session not found');
	}

	const includeVoiceNotes =
		url.searchParams.get('includeVoiceNotes') === '1' ||
		url.searchParams.get('includeVoiceNotes') === 'true';

	// Fetch messages for the session (limit to avoid loading too much data)
	const MESSAGE_LIMIT = 400;
	const { data: messages, error: messagesError } = await supabase
		.from('chat_messages')
		.select(
			'id, session_id, user_id, role, content, tool_calls, tool_call_id, created_at, metadata'
		)
		.eq('session_id', sessionId)
		.in('role', ['user', 'assistant']) // Only return user-facing messages to avoid tool/system noise
		.order('created_at', { ascending: true })
		.limit(MESSAGE_LIMIT);

	if (messagesError) {
		return ApiResponse.databaseError(messagesError);
	}

	let messagesWithAttachments = messages || [];
	if (messages && messages.length > 0) {
		const messageIds = messages
			.map((message: any) => message.id)
			.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
		if (messageIds.length > 0) {
			const { data: attachmentRows, error: attachmentError } = await (supabase as any)
				.from('chat_message_attachments')
				.select(
					'message_id, asset_id, project_id, attachment_kind, media_type, role, display_order, metadata, asset:onto_assets(id, project_id, original_filename, content_type, file_size_bytes, width, height, checksum_sha256, ocr_status, extraction_summary, extracted_text)'
				)
				.in('message_id', messageIds)
				.eq('session_id', sessionId)
				.eq('user_id', user.id)
				.order('display_order', { ascending: true })
				.limit(MESSAGE_LIMIT * 8);

			if (!attachmentError) {
				const attachmentsByMessageId = new Map<string, Record<string, unknown>[]>();
				for (const row of (attachmentRows ?? []) as ChatMessageAttachmentRow[]) {
					const messageId = readString(row.message_id);
					if (!messageId) continue;
					const attachment = buildAttachmentRef(row);
					if (!attachment) continue;
					const existing = attachmentsByMessageId.get(messageId) ?? [];
					existing.push(attachment);
					attachmentsByMessageId.set(messageId, existing);
				}

				messagesWithAttachments = messages.map((message: any) => {
					const attachments = attachmentsByMessageId.get(message.id);
					return attachments?.length ? { ...message, attachments } : message;
				});
			} else {
				console.warn('Failed to load chat message attachments', attachmentError);
			}
		}
	}

	const { data: toolExecutions, error: toolExecutionsError } = await supabase
		.from('chat_tool_executions')
		.select(
			`
			id,
			session_id,
			message_id,
			turn_run_id,
			stream_run_id,
			client_turn_id,
			tool_name,
			tool_category,
			gateway_op,
			help_path,
			sequence_index,
			arguments,
			result,
			execution_time_ms,
			tokens_consumed,
			success,
			error_message,
			requires_user_action,
			created_at
		`
		)
		.eq('session_id', sessionId)
		.order('created_at', { ascending: true })
		.limit(1000);

	if (toolExecutionsError) {
		return ApiResponse.databaseError(toolExecutionsError);
	}

	const { data: turnRuns, error: turnRunsError } = await supabase
		.from('chat_turn_runs')
		.select(
			'id, session_id, user_id, stream_run_id, client_turn_id, status, finished_reason, request_message, assistant_message_id, started_at, finished_at, created_at, updated_at'
		)
		.eq('session_id', sessionId)
		.eq('user_id', user.id)
		.order('started_at', { ascending: false })
		.limit(5);

	if (turnRunsError) {
		return ApiResponse.databaseError(turnRunsError);
	}

	let voiceNotes: any[] = [];
	let voiceNoteGroups: any[] = [];

	if (includeVoiceNotes && messages && messages.length > 0) {
		const groupIds = Array.from(
			new Set(
				messages
					.map((message: any) => message.metadata?.voice_note_group_id)
					.filter(Boolean)
			)
		);

		if (groupIds.length > 0) {
			const { data: groups, error: groupsError } = await supabase
				.from('voice_note_groups')
				.select('*')
				.in('id', groupIds)
				.eq('user_id', user.id)
				.is('deleted_at', null);

			if (groupsError) {
				return ApiResponse.databaseError(groupsError);
			}

			voiceNoteGroups = groups || [];

			const { data: notes, error: notesError } = await supabase
				.from('voice_notes')
				.select('*')
				.in('group_id', groupIds)
				.eq('user_id', user.id)
				.is('deleted_at', null)
				.order('segment_index', { ascending: true })
				.order('created_at', { ascending: true });

			if (notesError) {
				return ApiResponse.databaseError(notesError);
			}

			voiceNotes = notes || [];
		}
	}

	// Check if there are more messages than we fetched (truncation indicator)
	const truncated = (messages?.length || 0) >= MESSAGE_LIMIT;

	return ApiResponse.success({
		session,
		messages: messagesWithAttachments,
		toolExecutions: toolExecutions || [],
		turnRuns: turnRuns || [],
		voiceNoteGroups,
		voiceNotes,
		truncated
	});
};

export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();

	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const sessionId = params.id;
	if (!sessionId) {
		return ApiResponse.badRequest('Session id is required');
	}

	let payload: { title?: string } = {};

	try {
		payload = (await request.json()) as { title?: string };
	} catch {
		return ApiResponse.badRequest('Invalid request payload');
	}

	const title = payload.title?.trim();
	if (!title) {
		return ApiResponse.validationError('title', 'Title is required');
	}

	if (title.length > 120) {
		return ApiResponse.validationError('title', 'Title must be 120 characters or fewer');
	}

	const { data: existingSession, error: sessionError } = await supabase
		.from('chat_sessions')
		.select('*')
		.eq('id', sessionId)
		.eq('user_id', user.id)
		.single();

	if (sessionError || !existingSession) {
		return ApiResponse.notFound('Session');
	}

	const { data: updatedSession, error: updateError } = await supabase
		.from('chat_sessions')
		.update({
			title,
			updated_at: new Date().toISOString()
		})
		.eq('id', sessionId)
		.eq('user_id', user.id)
		.select('*')
		.single();

	if (updateError || !updatedSession) {
		return ApiResponse.internalError(updateError, 'Failed to rename chat session');
	}

	return ApiResponse.success({ session: updatedSession });
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const sessionId = params.id;
	if (!sessionId) {
		return ApiResponse.badRequest('Session id is required');
	}

	const { data: existingSession, error: sessionError } = await supabase
		.from('chat_sessions')
		.select('id')
		.eq('id', sessionId)
		.eq('user_id', user.id)
		.single();

	if (sessionError || !existingSession) {
		return ApiResponse.notFound('Session');
	}

	const { error: messagesError } = await supabase
		.from('chat_messages')
		.delete()
		.eq('session_id', sessionId);

	if (messagesError) {
		return ApiResponse.databaseError(messagesError);
	}

	const { error: deleteError } = await supabase
		.from('chat_sessions')
		.delete()
		.eq('id', sessionId)
		.eq('user_id', user.id);

	if (deleteError) {
		return ApiResponse.databaseError(deleteError);
	}

	return ApiResponse.success({ deleted: true });
};
