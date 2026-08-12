// apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-history.ts
import type { FastChatHistoryMessage } from '$lib/services/agentic-chat-v2';
import type { FastChatHistoryCompositionResult } from './history-composer';
import type { AgenticChatHistoryStateV1, ChatAttachmentRef } from '@buildos/shared-types';

const PREPARED_HISTORY_ROLES = new Set<FastChatHistoryMessage['role']>([
	'user',
	'assistant',
	'system',
	'tool'
]);

export function normalizePreparedHistoryForModel(raw: unknown): FastChatHistoryMessage[] {
	const inspection = inspectPreparedHistoryForModel(raw);
	if (!inspection.ok) throw new Error(`Invalid prepared history: ${inspection.code}`);
	return inspection.history;
}

export type PreparedHistoryInspection =
	| { ok: true; history: FastChatHistoryMessage[]; state: AgenticChatHistoryStateV1 }
	| { ok: false; code: PreparedHistoryValidationErrorCode };

export type PreparedHistoryValidationErrorCode =
	| 'not_array'
	| 'too_many_messages'
	| 'invalid_message'
	| 'invalid_attachments'
	| 'invalid_tool_calls'
	| 'invalid_strategy'
	| 'invalid_counts';

type PreparedHistoryMessagesInspection =
	| { ok: true; history: FastChatHistoryMessage[] }
	| { ok: false; code: PreparedHistoryValidationErrorCode };

export function inspectPreparedHistorySnapshot(params: {
	historyForModel: unknown;
	historyStrategy: unknown;
	historyCompressed: unknown;
	rawHistoryCount: unknown;
	historyForModelCount: unknown;
}): PreparedHistoryInspection {
	const messages = inspectPreparedHistoryForModel(params.historyForModel);
	if (!messages.ok) return messages;
	const strategy = params.historyStrategy;
	if (
		strategy !== 'raw_history' &&
		strategy !== 'continuity_only' &&
		strategy !== 'compressed_history'
	) {
		return { ok: false, code: 'invalid_strategy' };
	}
	if (
		typeof params.historyCompressed !== 'boolean' ||
		params.historyCompressed !== (strategy === 'compressed_history') ||
		!Number.isSafeInteger(params.rawHistoryCount) ||
		(params.rawHistoryCount as number) < 0 ||
		(params.rawHistoryCount as number) > 50 ||
		!Number.isSafeInteger(params.historyForModelCount) ||
		params.historyForModelCount !== messages.history.length ||
		(strategy === 'continuity_only' &&
			(params.rawHistoryCount !== 0 || params.historyForModelCount !== 1))
	) {
		return { ok: false, code: 'invalid_counts' };
	}
	return {
		ok: true,
		history: messages.history,
		state: {
			strategy,
			compressed: params.historyCompressed,
			rawHistoryCount: params.rawHistoryCount as number,
			historyForModelCount: params.historyForModelCount as number
		}
	};
}

function inspectPreparedHistoryForModel(raw: unknown): PreparedHistoryMessagesInspection {
	if (!Array.isArray(raw)) return { ok: false, code: 'not_array' };
	if (raw.length > 50) return { ok: false, code: 'too_many_messages' };
	const history: FastChatHistoryMessage[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			return { ok: false, code: 'invalid_message' };
		}
		const message = item as Record<string, unknown>;
		const role = message.role;
		const content = message.content;
		if (
			typeof role !== 'string' ||
			!PREPARED_HISTORY_ROLES.has(role as FastChatHistoryMessage['role'])
		) {
			return { ok: false, code: 'invalid_message' };
		}
		if (typeof content !== 'string') return { ok: false, code: 'invalid_message' };
		const attachments = inspectPreparedAttachments(message.attachments);
		if (!attachments) return { ok: false, code: 'invalid_attachments' };
		if (
			message.tool_calls !== undefined &&
			(!Array.isArray(message.tool_calls) ||
				message.tool_calls.some(
					(toolCall) =>
						!toolCall || typeof toolCall !== 'object' || Array.isArray(toolCall)
				))
		) {
			return { ok: false, code: 'invalid_tool_calls' };
		}
		if (
			message.tool_call_id !== undefined &&
			message.tool_call_id !== null &&
			typeof message.tool_call_id !== 'string'
		) {
			return { ok: false, code: 'invalid_message' };
		}
		const normalized: FastChatHistoryMessage = {
			role: role as FastChatHistoryMessage['role'],
			content
		};
		if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
			normalized.tool_calls = message.tool_calls as FastChatHistoryMessage['tool_calls'];
		}
		if (typeof message.tool_call_id === 'string') {
			normalized.tool_call_id = message.tool_call_id;
		}
		if (attachments.length > 0) normalized.attachments = attachments;
		history.push(normalized);
	}
	return { ok: true, history };
}

function inspectPreparedAttachments(value: unknown): ChatAttachmentRef[] | null {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.length > 16) return null;
	const attachments: ChatAttachmentRef[] = [];
	const identities = new Set<string>();
	const displayOrders = new Set<number>();
	for (const [index, raw] of value.entries()) {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
		const attachment = raw as Record<string, unknown>;
		const attachmentKind = attachment.attachment_kind;
		const displayOrder = attachment.display_order ?? index;
		if (
			(attachmentKind !== 'onto_asset' && attachmentKind !== 'temporary_file') ||
			attachment.media_type !== 'image' ||
			!Number.isSafeInteger(displayOrder) ||
			(displayOrder as number) < 0 ||
			(displayOrder as number) > 100 ||
			displayOrders.has(displayOrder as number)
		) {
			return null;
		}
		const assetId = readNullableString(attachment.asset_id, 256);
		const temporaryAttachmentId = readNullableString(attachment.temporary_attachment_id, 256);
		const projectId = readNullableString(attachment.project_id, 256);
		const storageBucket = readNullableString(attachment.storage_bucket, 128);
		const storagePath = readNullableString(attachment.storage_path, 2048);
		const expiresAt = readNullableTimestamp(attachment.expires_at);
		const fileName = readNullableString(attachment.file_name, 1024);
		const contentType = readNullableString(attachment.content_type, 256);
		const ocrStatus = readNullableString(attachment.ocr_status, 128);
		if (
			assetId === undefined ||
			temporaryAttachmentId === undefined ||
			projectId === undefined ||
			storageBucket === undefined ||
			storagePath === undefined ||
			expiresAt === undefined ||
			fileName === undefined ||
			contentType === undefined ||
			ocrStatus === undefined
		) {
			return null;
		}
		const identity =
			attachmentKind === 'onto_asset'
				? assetId &&
					!temporaryAttachmentId &&
					projectId &&
					storageBucket &&
					storagePath &&
					expiresAt === null
					? `asset:${assetId}`
					: null
				: temporaryAttachmentId && !assetId && !projectId && expiresAt
					? `temporary:${temporaryAttachmentId}`
					: null;
		if (!identity || identities.has(identity)) return null;
		const checksum = readNullableString(attachment.checksum_sha256, 64);
		if (checksum === undefined) return null;
		if (checksum !== null && !/^[0-9a-f]{64}$/.test(checksum)) return null;
		const fileSize = readNullableInteger(attachment.file_size_bytes, 100 * 1024 * 1024);
		const width = readNullableInteger(attachment.width, 100_000);
		const height = readNullableInteger(attachment.height, 100_000);
		const extractionSummary = readNullableString(attachment.extraction_summary, 700);
		const extractedTextPreview = readNullableString(attachment.extracted_text_preview, 20_000);
		if (
			fileSize === undefined ||
			width === undefined ||
			height === undefined ||
			extractionSummary === undefined ||
			extractedTextPreview === undefined
		) {
			return null;
		}
		if (
			attachmentKind === 'temporary_file' &&
			(attachment.ocr_status !== 'skipped' ||
				extractionSummary !== null ||
				extractedTextPreview !== null ||
				!storageBucket ||
				!storagePath)
		) {
			return null;
		}

		attachments.push({
			attachment_kind: attachmentKind,
			media_type: 'image',
			asset_id: assetId ?? undefined,
			temporary_attachment_id: temporaryAttachmentId ?? undefined,
			project_id: projectId,
			storage_bucket: storageBucket,
			storage_path: storagePath,
			file_name: fileName,
			content_type: contentType,
			file_size_bytes: fileSize,
			width,
			height,
			checksum_sha256: checksum,
			ocr_status: ocrStatus,
			extraction_summary: extractionSummary,
			extracted_text_preview: extractedTextPreview,
			role: attachment.role === 'analysis_target' ? 'analysis_target' : 'attachment',
			display_order: displayOrder as number,
			expires_at: expiresAt,
			metadata: null
		});
		identities.add(identity);
		displayOrders.add(displayOrder as number);
	}
	return attachments;
}

function readNullableString(value: unknown, maximum: number): string | null | undefined {
	if (value === undefined || value === null) return null;
	return typeof value === 'string' && value.length > 0 && value.length <= maximum
		? value
		: undefined;
}

function readNullableInteger(value: unknown, maximum: number): number | null | undefined {
	if (value === undefined || value === null) return null;
	return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum
		? (value as number)
		: undefined;
}

function readNullableTimestamp(value: unknown): string | null | undefined {
	if (value === undefined || value === null) return null;
	return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined;
}

export function normalizePreparedHistoryStrategy(
	value: unknown
): FastChatHistoryCompositionResult['strategy'] {
	if (value === 'raw_history' || value === 'continuity_only' || value === 'compressed_history') {
		return value;
	}
	return 'raw_history';
}
