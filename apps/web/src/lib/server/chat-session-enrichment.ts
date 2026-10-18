// apps/web/src/lib/server/chat-session-enrichment.ts
import type { ProjectFocus, Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	AgentTimelineEntityRef,
	AgentTimelineItem
} from '$lib/components/agent/agent-chat.types';
import {
	ENTITY_LOOKUP_CONFIG,
	type EntityLookupValue,
	entityLookupKey,
	fetchEntityLookups
} from './chat-entity-lookups';
import { readInScopePendingTurnContract } from './chat-pending-change';
import {
	buildPendingChangeView,
	pendingChangeLookupIds
} from '$lib/services/agentic-chat-v2/pending-change';
import type { ChatSessionRestore } from '$lib/types/chat-session-restore';

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

function collectTimelineRefs(items: AgentTimelineItem[]): AgentTimelineEntityRef[] {
	const refs: AgentTimelineEntityRef[] = [];
	for (const item of items) {
		if (item.projectRef) refs.push(item.projectRef);
		for (const ref of item.entityRefs) refs.push(ref);
	}
	return refs;
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

export async function enrichSessionEntities(params: {
	supabase: unknown;
	items: AgentTimelineItem[];
	projectFocus: ProjectFocus | null;
	pending: ReturnType<typeof readInScopePendingTurnContract>;
}): Promise<{
	timelineItems: AgentTimelineItem[];
	projectFocus: ProjectFocus | null;
	pendingChange: ReturnType<typeof buildPendingChangeView> | null;
}> {
	const refs = collectTimelineRefs(params.items);
	const idsByKind = params.pending
		? pendingChangeLookupIds(params.pending)
		: new Map<string, Set<string>>();
	for (const ref of refs) {
		addLookupId(idsByKind, ref.kind, ref.id);
		if (ref.projectId) addLookupId(idsByKind, 'project', ref.projectId);
	}

	// Resolve the saved focus even when the chat has no tool activity. Share the
	// timeline lookup batch so reopening doesn't fetch the same entities twice.
	const focus = params.projectFocus;
	if (focus) {
		addLookupId(idsByKind, 'project', focus.projectId);
		addLookupId(idsByKind, focus.focusType, focus.focusEntityId);
	}

	if (idsByKind.size === 0)
		return {
			timelineItems: params.items,
			projectFocus: focus,
			pendingChange: params.pending ? buildPendingChangeView(params.pending) : null
		};

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

	const timelineItems = params.items.map((item) => {
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
	const focusedEntity = focus?.focusEntityId
		? lookups.get(entityLookupKey(focus.focusType, focus.focusEntityId))
		: null;
	return {
		timelineItems,
		pendingChange: params.pending
			? buildPendingChangeView(
					params.pending,
					(kind, id) => lookups.get(entityLookupKey(kind, id))?.title ?? null
				)
			: null,
		projectFocus: focus
			? {
					...focus,
					projectName: projectLookups.get(focus.projectId)?.title ?? focus.projectName,
					focusEntityName:
						focusedEntity?.projectId === focus.projectId
							? (focusedEntity.title ?? focus.focusEntityName)
							: focus.focusEntityName
				}
			: null
	};
}

export async function loadRestoreAttachments(
	supabase: SupabaseClient<Database>,
	sessionId: string,
	messages: ChatSessionRestore['messages']
): Promise<ChatSessionRestore['messages']> {
	if (!messages.length) return messages;
	const { data, error } = await supabase.rpc('get_chat_restore_attachments_v1', {
		p_session_id: sessionId,
		p_message_ids: messages.map((message) => message.id)
	});
	if (error) {
		console.warn('Failed to load chat message attachments', error);
		return messages;
	}
	const byMessage = new Map<string, Record<string, unknown>[]>();
	for (const row of (data ?? []) as ChatMessageAttachmentRow[]) {
		const messageId = readString(row.message_id);
		const attachment = buildAttachmentRef(row);
		if (!messageId || !attachment) continue;
		const attachments = byMessage.get(messageId) ?? [];
		attachments.push(attachment);
		byMessage.set(messageId, attachments);
	}
	return messages.map((message) =>
		byMessage.has(message.id) ? { ...message, attachments: byMessage.get(message.id) } : message
	);
}

export async function loadRestoreVoiceNotes(
	supabase: SupabaseClient<Database>,
	userId: string,
	messages: ChatSessionRestore['messages'],
	include: boolean
) {
	const groupIds = include
		? [
				...new Set(
					messages.flatMap((message) => {
						const metadata = message.metadata as Record<string, unknown> | null;
						return typeof metadata?.voice_note_group_id === 'string'
							? [metadata.voice_note_group_id]
							: [];
					})
				)
			]
		: [];
	if (!groupIds.length) return { voiceNoteGroups: [], voiceNotes: [], error: null };
	const [groups, notes] = await Promise.all([
		supabase
			.from('voice_note_groups')
			.select('*')
			.in('id', groupIds)
			.eq('user_id', userId)
			.is('deleted_at', null),
		supabase
			.from('voice_notes')
			.select('*')
			.in('group_id', groupIds)
			.eq('user_id', userId)
			.is('deleted_at', null)
			.order('segment_index', { ascending: true })
			.order('created_at', { ascending: true })
	]);
	return {
		voiceNoteGroups: groups.data ?? [],
		voiceNotes: notes.data ?? [],
		error: groups.error ?? notes.error
	};
}
