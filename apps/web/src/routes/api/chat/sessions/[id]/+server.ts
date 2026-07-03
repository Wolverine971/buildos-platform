// apps/web/src/routes/api/chat/sessions/[id]/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { buildAgentTimeline } from '$lib/components/agent/agent-chat-timeline';
import type {
	AgentTimelineEntityRef,
	AgentTimelineItem
} from '$lib/components/agent/agent-chat.types';

const chatSessionTitleUpdateSchema = z
	.object({
		title: z.string()
	})
	.strict();

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

type EntityLookupConfig = {
	table: string;
	select: string;
	titleFields: string[];
	hasProjectId: boolean;
};

const ENTITY_LOOKUP_CONFIG: Record<string, EntityLookupConfig> = {
	project: {
		table: 'onto_projects',
		select: 'id, name',
		titleFields: ['name'],
		hasProjectId: false
	},
	task: {
		table: 'onto_tasks',
		select: 'id, title, project_id',
		titleFields: ['title'],
		hasProjectId: true
	},
	document: {
		table: 'onto_documents',
		select: 'id, title, project_id',
		titleFields: ['title'],
		hasProjectId: true
	},
	goal: {
		table: 'onto_goals',
		select: 'id, name, project_id',
		titleFields: ['name'],
		hasProjectId: true
	},
	plan: {
		table: 'onto_plans',
		select: 'id, name, project_id',
		titleFields: ['name'],
		hasProjectId: true
	},
	milestone: {
		table: 'onto_milestones',
		select: 'id, title, project_id',
		titleFields: ['title'],
		hasProjectId: true
	},
	risk: {
		table: 'onto_risks',
		select: 'id, title, project_id',
		titleFields: ['title'],
		hasProjectId: true
	},
	event: {
		table: 'onto_events',
		select: 'id, title, project_id',
		titleFields: ['title'],
		hasProjectId: true
	}
};

type EntityLookupValue = {
	kind: string;
	id: string;
	title: string | null;
	projectId: string | null;
};

function entityLookupKey(kind: string, id: string): string {
	return `${kind}:${id}`;
}

function resolveRefProjectId(
	ref: AgentTimelineEntityRef,
	lookup: EntityLookupValue | undefined
): string | null {
	return ref.projectId ?? lookup?.projectId ?? (ref.kind === 'project' ? ref.id : null);
}

function buildEntityUrl(ref: AgentTimelineEntityRef): string | null {
	if (!ref.id) return null;
	if (ref.kind === 'project') return `/projects/${ref.id}`;
	if (!ref.projectId) return null;
	if (ref.kind === 'document') return `/projects/${ref.projectId}?doc=${ref.id}`;
	return `/projects/${ref.projectId}?entity=${encodeURIComponent(ref.kind)}&entity_id=${ref.id}`;
}

function displayTitleFromRow(row: Record<string, unknown>, fields: string[]): string | null {
	for (const field of fields) {
		const value = readString(row[field]);
		if (value) return value;
	}
	return null;
}

function collectTimelineRefs(items: AgentTimelineItem[]): AgentTimelineEntityRef[] {
	const refs: AgentTimelineEntityRef[] = [];
	for (const item of items) {
		if (item.projectRef) refs.push(item.projectRef);
		for (const ref of item.entityRefs) refs.push(ref);
	}
	return refs;
}

async function fetchEntityLookups(params: {
	supabase: unknown;
	idsByKind: Map<string, Set<string>>;
}): Promise<Map<string, EntityLookupValue>> {
	const lookups = new Map<string, EntityLookupValue>();
	const supabase = params.supabase as any;

	for (const [kind, ids] of params.idsByKind) {
		const config = ENTITY_LOOKUP_CONFIG[kind];
		const idList = Array.from(ids).filter(Boolean);
		if (!config || idList.length === 0) continue;

		const { data, error } = await supabase
			.from(config.table)
			.select(config.select)
			.in('id', idList)
			.limit(idList.length);

		if (error) {
			console.warn(`Failed to enrich ${kind} timeline refs`, error);
			continue;
		}

		for (const row of (data ?? []) as Record<string, unknown>[]) {
			const id = readString(row.id);
			if (!id) continue;
			const projectId =
				kind === 'project' ? id : config.hasProjectId ? readString(row.project_id) : null;
			lookups.set(entityLookupKey(kind, id), {
				kind,
				id,
				title: displayTitleFromRow(row, config.titleFields),
				projectId
			});
		}
	}

	return lookups;
}

function addLookupId(idsByKind: Map<string, Set<string>>, kind: string | null, id: string | null) {
	if (!kind || !id || !ENTITY_LOOKUP_CONFIG[kind]) return;
	const existing = idsByKind.get(kind) ?? new Set<string>();
	existing.add(id);
	idsByKind.set(kind, existing);
}

function enrichRef(
	ref: AgentTimelineEntityRef,
	lookups: Map<string, EntityLookupValue>,
	projectLookups: Map<string, EntityLookupValue>
): AgentTimelineEntityRef {
	const lookup = lookups.get(entityLookupKey(ref.kind, ref.id));
	const projectId = resolveRefProjectId(ref, lookup);
	const title = ref.title ?? lookup?.title ?? null;
	const enriched: AgentTimelineEntityRef = {
		...ref,
		title,
		projectId
	};
	enriched.url = ref.url ?? buildEntityUrl(enriched);

	if (enriched.kind === 'project') {
		const projectLookup = projectLookups.get(enriched.id);
		enriched.title = enriched.title ?? projectLookup?.title ?? null;
		enriched.url = enriched.url ?? `/projects/${enriched.id}`;
	}

	return enriched;
}

function primaryChangeRef(item: AgentTimelineItem): AgentTimelineEntityRef | null {
	return (
		item.entityRefs.find((ref) =>
			['created', 'updated', 'deleted', 'linked'].includes(String(ref.operation))
		) ?? null
	);
}

function updateTimelineItemAfterEnrichment(item: AgentTimelineItem): AgentTimelineItem {
	const primaryRef = primaryChangeRef(item);
	if (!primaryRef?.title) return item;
	if (item.kind === 'change') {
		return {
			...item,
			summary: primaryRef.title
		};
	}
	if (item.kind === 'tool' && item.summary?.includes(primaryRef.id)) {
		return {
			...item,
			summary: item.summary.replace(primaryRef.id, primaryRef.title)
		};
	}
	return item;
}

async function enrichTimelineEntityRefs(params: {
	supabase: unknown;
	items: AgentTimelineItem[];
}): Promise<AgentTimelineItem[]> {
	const refs = collectTimelineRefs(params.items);
	const idsByKind = new Map<string, Set<string>>();
	for (const ref of refs) {
		addLookupId(idsByKind, ref.kind, ref.id);
		if (ref.projectId) addLookupId(idsByKind, 'project', ref.projectId);
	}

	if (idsByKind.size === 0) return params.items;

	const lookups = await fetchEntityLookups({ supabase: params.supabase, idsByKind });
	const projectIds = new Set<string>();
	for (const ref of refs) {
		const lookup = lookups.get(entityLookupKey(ref.kind, ref.id));
		const projectId = resolveRefProjectId(ref, lookup);
		if (projectId) projectIds.add(projectId);
	}

	const missingProjectIds = Array.from(projectIds).filter(
		(id) => !lookups.has(entityLookupKey('project', id))
	);
	if (missingProjectIds.length > 0) {
		const projectIdsByKind = new Map<string, Set<string>>([
			['project', new Set(missingProjectIds)]
		]);
		const projectLookups = await fetchEntityLookups({
			supabase: params.supabase,
			idsByKind: projectIdsByKind
		});
		for (const [key, value] of projectLookups) {
			lookups.set(key, value);
		}
	}

	const projectLookups = new Map<string, EntityLookupValue>();
	for (const [key, value] of lookups) {
		if (value.kind === 'project') projectLookups.set(value.id, value);
		if (key.startsWith('project:')) projectLookups.set(value.id, value);
	}

	return params.items.map((item) => {
		const entityRefs = item.entityRefs.map((ref) => enrichRef(ref, lookups, projectLookups));
		const projectRef = item.projectRef
			? enrichRef(item.projectRef, lookups, projectLookups)
			: (() => {
					const primaryRef = entityRefs[0];
					if (!primaryRef?.projectId) return null;
					const projectLookup = projectLookups.get(primaryRef.projectId);
					return {
						kind: 'project',
						id: primaryRef.projectId,
						title: projectLookup?.title ?? null,
						projectId: primaryRef.projectId,
						url: `/projects/${primaryRef.projectId}`,
						operation: 'linked'
					};
				})();

		return updateTimelineItemAfterEnrichment({
			...item,
			projectRef,
			entityRefs
		});
	});
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
			result_count,
			zero_result,
			execution_time_ms,
			tokens_consumed,
			success,
			error_message,
			requires_user_action,
			affected_entities,
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

	const { data: turnEvents, error: turnEventsError } = await supabase
		.from('chat_turn_events')
		.select(
			'id, session_id, user_id, turn_run_id, stream_run_id, event_type, phase, payload, sequence_index, created_at'
		)
		.eq('session_id', sessionId)
		.eq('user_id', user.id)
		.order('created_at', { ascending: true })
		.limit(1000);

	if (turnEventsError) {
		return ApiResponse.databaseError(turnEventsError);
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
	const timelineItems = await enrichTimelineEntityRefs({
		supabase,
		items: buildAgentTimeline({
			sessionId,
			messages: messagesWithAttachments,
			toolExecutions: toolExecutions || [],
			turnRuns: turnRuns || [],
			turnEvents: turnEvents || []
		})
	});

	return ApiResponse.success({
		session,
		messages: messagesWithAttachments,
		toolExecutions: toolExecutions || [],
		turnRuns: turnRuns || [],
		timelineItems,
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

	const parsed = await parseJsonRequest(request, chatSessionTitleUpdateSchema);
	if (!parsed.ok) return parsed.response;
	const payload = parsed.data;

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
