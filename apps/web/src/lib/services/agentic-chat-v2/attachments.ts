// apps/web/src/lib/services/agentic-chat-v2/attachments.ts
import {
	assessAgenticChatLiveVisionEligibilityV1,
	appendAgenticChatAttachmentContextV1,
	buildAgenticChatAttachmentContextV1,
	buildAgenticChatAttachmentDisplayTextV1,
	shouldUseAgenticChatLiveVisionV1,
	type AgenticChatLiveVisionEligibilityV1,
	type AgenticChatLiveVisionIneligibilityReasonV1,
	type ChatAttachmentRef,
	type ChatImageAttachmentCaps,
	type FrozenChatAttachmentV1,
	type NormalizedChatAttachmentV1
} from '@buildos/shared-types';
import type { OpenRouterContentPart } from '$lib/services/openrouter-v2/types';

const DEFAULT_ATTACHMENT_TEXT_MAX_CHARS = 2000;
const DEFAULT_ATTACHMENT_BLOCK_MAX_CHARS = 7000;

export type ChatAttachmentAssetRow = {
	id: string;
	project_id: string | null;
	storage_bucket: string;
	storage_path: string;
	original_filename: string | null;
	content_type: string | null;
	file_size_bytes: number | null;
	width: number | null;
	height: number | null;
	checksum_sha256: string | null;
	ocr_status: string | null;
	extraction_summary: string | null;
	extracted_text: string | null;
};

export type LiveVisionImageIneligibilityReason = AgenticChatLiveVisionIneligibilityReasonV1;

export type LiveVisionImageEligibilityResult = AgenticChatLiveVisionEligibilityV1;

export type LiveVisionImageInput = {
	assetId: string;
	signedUrl: string;
	detail?: 'auto' | 'low' | 'high';
};

export type NormalizeChatAttachmentRefsResult = {
	attachments: ChatAttachmentRef[];
	rejected: number;
};

export type ChatAttachmentUploadQuotaUsage = {
	uploadCount: number;
	uploadBytes: number;
	projectStorageBytes: number;
};

export type ChatAttachmentUploadQuotaDecision =
	| { allowed: true }
	| {
			allowed: false;
			reason: 'upload_count_limit' | 'upload_bytes_limit' | 'project_storage_limit';
			message: string;
			details: Record<string, number | string>;
	  };

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | null {
	return isRecord(value) ? value : null;
}

export function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function normalizeNonNegativeInteger(value: number): number {
	return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function evaluateChatAttachmentUploadQuota(params: {
	caps: ChatImageAttachmentCaps;
	usage: ChatAttachmentUploadQuotaUsage;
	incomingBytes: number;
}): ChatAttachmentUploadQuotaDecision {
	const incomingBytes = normalizeNonNegativeInteger(params.incomingBytes);
	const uploadCount = normalizeNonNegativeInteger(params.usage.uploadCount);
	const uploadBytes = normalizeNonNegativeInteger(params.usage.uploadBytes);
	const projectStorageBytes = normalizeNonNegativeInteger(params.usage.projectStorageBytes);
	const nextUploadCount = uploadCount + 1;
	const nextUploadBytes = uploadBytes + incomingBytes;
	const nextProjectStorageBytes = projectStorageBytes + incomingBytes;

	if (
		params.caps.max_uploads_per_window > 0 &&
		nextUploadCount > params.caps.max_uploads_per_window
	) {
		return {
			allowed: false,
			reason: 'upload_count_limit',
			message: 'Chat image upload rate limit reached',
			details: {
				current_upload_count: uploadCount,
				attempted_upload_count: nextUploadCount,
				max_uploads_per_window: params.caps.max_uploads_per_window,
				upload_window_seconds: params.caps.upload_window_seconds
			}
		};
	}

	if (
		params.caps.max_upload_bytes_per_window > 0 &&
		nextUploadBytes > params.caps.max_upload_bytes_per_window
	) {
		return {
			allowed: false,
			reason: 'upload_bytes_limit',
			message: 'Chat image upload byte limit reached',
			details: {
				current_upload_bytes: uploadBytes,
				incoming_bytes: incomingBytes,
				attempted_upload_bytes: nextUploadBytes,
				max_upload_bytes_per_window: params.caps.max_upload_bytes_per_window,
				upload_window_seconds: params.caps.upload_window_seconds
			}
		};
	}

	if (
		params.caps.project_storage_cap_bytes > 0 &&
		nextProjectStorageBytes > params.caps.project_storage_cap_bytes
	) {
		return {
			allowed: false,
			reason: 'project_storage_limit',
			message: 'Project image storage limit reached',
			details: {
				current_project_storage_bytes: projectStorageBytes,
				incoming_bytes: incomingBytes,
				attempted_project_storage_bytes: nextProjectStorageBytes,
				project_storage_cap_bytes: params.caps.project_storage_cap_bytes
			}
		};
	}

	return { allowed: true };
}

export function truncateAttachmentText(value: unknown, maxChars: number): string | null {
	if (typeof value !== 'string') return null;
	const normalized = normalizeWhitespace(value);
	if (!normalized) return null;
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function normalizeChatAttachmentRefs(value: unknown): NormalizeChatAttachmentRefsResult {
	if (!Array.isArray(value)) {
		return { attachments: [], rejected: 0 };
	}

	const attachments: ChatAttachmentRef[] = [];
	let rejected = 0;

	for (const item of value) {
		if (!isRecord(item)) {
			rejected += 1;
			continue;
		}

		const attachmentKind =
			readString(item.attachment_kind) ?? readString(item.attachmentKind) ?? 'onto_asset';
		const mediaType = readString(item.media_type) ?? readString(item.mediaType) ?? 'image';
		const assetId = readString(item.asset_id) ?? readString(item.assetId);
		const metadata = readRecord(item.metadata);

		if (mediaType !== 'image') {
			rejected += 1;
			continue;
		}

		if (attachmentKind === 'onto_asset') {
			if (!assetId) {
				rejected += 1;
				continue;
			}
			const projectId = readString(item.project_id) ?? readString(item.projectId) ?? null;
			attachments.push({
				attachment_kind: 'onto_asset',
				media_type: 'image',
				asset_id: assetId,
				project_id: projectId,
				display_order: readNumber(item.display_order) ?? readNumber(item.displayOrder)
			});
			continue;
		}

		if (attachmentKind === 'temporary_file') {
			const temporaryAttachmentId =
				readString(item.temporary_attachment_id) ??
				readString(item.temporaryAttachmentId) ??
				assetId;
			const storageBucket =
				readString(item.storage_bucket) ??
				readString(item.storageBucket) ??
				readString(metadata?.storage_bucket);
			const storagePath =
				readString(item.storage_path) ??
				readString(item.storagePath) ??
				readString(metadata?.storage_path);
			if (!temporaryAttachmentId || !storageBucket || !storagePath) {
				rejected += 1;
				continue;
			}
			attachments.push({
				attachment_kind: 'temporary_file',
				media_type: 'image',
				temporary_attachment_id: temporaryAttachmentId,
				storage_bucket: storageBucket,
				storage_path: storagePath,
				file_name: readString(item.file_name) ?? readString(item.fileName) ?? null,
				content_type: readString(item.content_type) ?? readString(item.contentType) ?? null,
				file_size_bytes:
					readNumber(item.file_size_bytes) ?? readNumber(item.fileSizeBytes) ?? null,
				width: readNumber(item.width) ?? null,
				height: readNumber(item.height) ?? null,
				checksum_sha256:
					readString(item.checksum_sha256) ?? readString(item.checksumSha256) ?? null,
				ocr_status: readString(item.ocr_status) ?? 'skipped',
				role: 'analysis_target',
				display_order: readNumber(item.display_order) ?? readNumber(item.displayOrder),
				expires_at: readString(item.expires_at) ?? readString(item.expiresAt) ?? null
			});
			continue;
		}

		rejected += 1;
	}

	return { attachments, rejected };
}

/**
 * Convert server-validated attachment rows into the canonical admission/hash
 * shape shared by the legacy and worker gateways.
 */
export function normalizeChatAttachmentsForAdmission(
	attachments: readonly ChatAttachmentRef[]
): NormalizedChatAttachmentV1[] {
	return attachments.map((attachment, inputOrder) => ({
		attachment_kind:
			attachment.attachment_kind === 'temporary_file' ? 'temporary_file' : 'onto_asset',
		media_type: 'image',
		asset_id: attachment.asset_id ?? null,
		temporary_attachment_id: attachment.temporary_attachment_id ?? null,
		project_id: attachment.project_id ?? null,
		role: attachment.role === 'analysis_target' ? 'analysis_target' : 'attachment',
		display_order: attachment.display_order ?? inputOrder,
		file_name: attachment.file_name ?? null,
		content_type: attachment.content_type ?? null,
		file_size_bytes: attachment.file_size_bytes ?? null,
		width: attachment.width ?? null,
		height: attachment.height ?? null,
		checksum_sha256: attachment.checksum_sha256 ?? null,
		ocr_status: attachment.ocr_status ?? null,
		extraction_summary: attachment.extraction_summary ?? null,
		extracted_text_preview: attachment.extracted_text_preview ?? null
	}));
}

/** Freeze only server-resolved references; signed URLs and credentials stay ephemeral. */
export function freezeChatAttachmentsForArtifact(
	attachments: readonly ChatAttachmentRef[]
): FrozenChatAttachmentV1[] {
	return attachments.map((attachment, inputOrder) => ({
		...normalizeChatAttachmentsForAdmission([{ ...attachment, display_order: inputOrder }])[0]!,
		storage_bucket: attachment.storage_bucket ?? null,
		storage_path: attachment.storage_path ?? null,
		expires_at: attachment.expires_at ?? null
	}));
}

export function createChatAttachmentRefFromAsset(
	asset: ChatAttachmentAssetRow,
	source?: Partial<ChatAttachmentRef>,
	options: { maxExtractedTextChars?: number } = {}
): ChatAttachmentRef {
	const maxExtractedTextChars =
		options.maxExtractedTextChars ?? DEFAULT_ATTACHMENT_TEXT_MAX_CHARS;

	return {
		attachment_kind: 'onto_asset',
		media_type: 'image',
		asset_id: asset.id,
		project_id: asset.project_id,
		storage_bucket: asset.storage_bucket,
		storage_path: asset.storage_path,
		file_name: asset.original_filename,
		content_type: asset.content_type,
		file_size_bytes: asset.file_size_bytes,
		width: asset.width,
		height: asset.height,
		checksum_sha256: asset.checksum_sha256,
		ocr_status: asset.ocr_status,
		extraction_summary: truncateAttachmentText(asset.extraction_summary, 700),
		extracted_text_preview: truncateAttachmentText(asset.extracted_text, maxExtractedTextChars),
		role: source?.role ?? 'attachment',
		display_order: source?.display_order,
		metadata: source?.metadata ?? null
	};
}

export function buildAttachmentContextBlock(
	attachments: ChatAttachmentRef[],
	options: { maxChars?: number; rawMediaPassedToModel?: boolean } = {}
): string | null {
	return buildAgenticChatAttachmentContextV1(normalizeChatAttachmentsForAdmission(attachments), {
		maxChars: options.maxChars ?? DEFAULT_ATTACHMENT_BLOCK_MAX_CHARS,
		rawMediaPassedToModel: options.rawMediaPassedToModel
	});
}

export function appendAttachmentContextToMessage(
	message: string,
	attachments: ChatAttachmentRef[],
	options: { maxChars?: number; rawMediaPassedToModel?: boolean } = {}
): string {
	return appendAgenticChatAttachmentContextV1(
		message,
		normalizeChatAttachmentsForAdmission(attachments),
		options
	);
}

export function shouldUseLiveVisionForTurn(params: {
	message: string;
	attachmentCount: number;
	liveVisionEnabled?: boolean;
}): boolean {
	return shouldUseAgenticChatLiveVisionV1({
		...params,
		liveVisionEnabled: params.liveVisionEnabled ?? false
	});
}

export function assessLiveVisionImageEligibility(
	asset: Pick<
		ChatAttachmentAssetRow,
		'content_type' | 'file_size_bytes' | 'storage_bucket' | 'storage_path' | 'checksum_sha256'
	>,
	options: { maxBytes: number }
): LiveVisionImageEligibilityResult {
	return assessAgenticChatLiveVisionEligibilityV1(
		{
			attachment_kind: 'onto_asset',
			storage_bucket: asset.storage_bucket,
			storage_path: asset.storage_path,
			content_type: asset.content_type,
			file_size_bytes: asset.file_size_bytes,
			checksum_sha256: asset.checksum_sha256,
			expires_at: null
		},
		options
	);
}

export function buildLiveVisionContentParts(params: {
	text: string;
	images: LiveVisionImageInput[];
}): string | OpenRouterContentPart[] {
	if (params.images.length === 0) return params.text;
	const parts: OpenRouterContentPart[] = [
		{
			type: 'text',
			text: params.text
		}
	];
	for (const image of params.images) {
		parts.push({
			type: 'image_url',
			image_url: {
				url: image.signedUrl,
				detail: image.detail ?? 'auto'
			}
		});
	}
	return parts;
}

export function buildAttachmentOnlyDisplayText(attachmentCount: number): string {
	return buildAgenticChatAttachmentDisplayTextV1(attachmentCount);
}

export function sanitizeAttachmentRefsForMetadata(
	attachments: ChatAttachmentRef[]
): ChatAttachmentRef[] {
	return attachments.map((attachment) => ({
		attachment_kind: attachment.attachment_kind,
		media_type: attachment.media_type,
		asset_id: attachment.asset_id,
		temporary_attachment_id: attachment.temporary_attachment_id,
		project_id: attachment.project_id,
		storage_bucket: attachment.storage_bucket,
		file_name: attachment.file_name,
		content_type: attachment.content_type,
		file_size_bytes: attachment.file_size_bytes,
		width: attachment.width,
		height: attachment.height,
		checksum_sha256: attachment.checksum_sha256,
		ocr_status: attachment.ocr_status,
		extraction_summary: attachment.extraction_summary,
		extracted_text_preview: truncateAttachmentText(attachment.extracted_text_preview, 1200),
		role: attachment.role,
		display_order: attachment.display_order,
		expires_at: attachment.expires_at,
		metadata:
			attachment.attachment_kind === 'temporary_file' ? null : (attachment.metadata ?? null)
	}));
}
