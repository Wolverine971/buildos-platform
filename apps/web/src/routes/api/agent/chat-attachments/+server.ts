// apps/web/src/routes/api/agent/chat-attachments/+server.ts
import type { RequestHandler } from './$types';
import type {
	ChatImageAttachmentCaps,
	ChatImageAttachmentCreateRequest,
	ChatImageAttachmentCreateResponse
} from '@buildos/shared-types';
import {
	evaluateChatAttachmentUploadQuota,
	type ChatAttachmentUploadQuotaUsage
} from '$lib/services/agentic-chat-v2/attachments';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';
import { ensureProjectAccess, getFileExtension } from '../../onto/assets/shared';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

const MAX_IMAGE_SIZE_BYTES =
	Number.parseInt(process.env.AGENT_CHAT_IMAGE_MAX_BYTES ?? '', 10) || 25 * 1024 * 1024;
const MAX_IMAGE_ATTACHMENTS_PER_TURN =
	Number.parseInt(process.env.AGENT_CHAT_MAX_IMAGE_ATTACHMENTS_PER_TURN ?? '', 10) || 4;
const UPLOAD_WINDOW_SECONDS =
	Number.parseInt(process.env.AGENT_CHAT_UPLOAD_WINDOW_SECONDS ?? '', 10) || 24 * 60 * 60;
const MAX_UPLOADS_PER_WINDOW =
	Number.parseInt(process.env.AGENT_CHAT_MAX_IMAGE_UPLOADS_PER_WINDOW ?? '', 10) || 100;
const MAX_UPLOAD_BYTES_PER_WINDOW =
	Number.parseInt(process.env.AGENT_CHAT_MAX_IMAGE_UPLOAD_BYTES_PER_WINDOW ?? '', 10) ||
	250 * 1024 * 1024;
const PROJECT_STORAGE_CAP_BYTES =
	Number.parseInt(process.env.AGENT_CHAT_PROJECT_IMAGE_STORAGE_CAP_BYTES ?? '', 10) ||
	2 * 1024 * 1024 * 1024;
const TEMPORARY_IMAGE_TTL_SECONDS =
	Number.parseInt(process.env.AGENT_CHAT_TEMPORARY_IMAGE_TTL_SECONDS ?? '', 10) || 24 * 60 * 60;
const CHAT_ATTACHMENT_STORAGE_BUCKET = 'onto-assets';
const CHECKSUM_SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CHAT_ATTACHMENT_ASSET_SELECT =
	'id, project_id, kind, storage_bucket, storage_path, original_filename, content_type, file_size_bytes, width, height, checksum_sha256, ocr_status, extraction_summary';

type ExistingAssetRow = ChatImageAttachmentCreateResponse['asset'];

function normalizeChecksum(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase();
	return CHECKSUM_SHA256_PATTERN.test(normalized) ? normalized : null;
}

async function findExistingAsset(params: {
	supabase: any;
	projectId: string;
	checksumSha256: string;
}): Promise<ExistingAssetRow | null> {
	const { data, error } = await params.supabase
		.from('onto_assets')
		.select(CHAT_ATTACHMENT_ASSET_SELECT)
		.eq('project_id', params.projectId)
		.eq('checksum_sha256', params.checksumSha256)
		.is('deleted_at', null)
		.maybeSingle();

	if (error) throw error;
	return data ?? null;
}

function sumBytes(rows: Array<{ file_size_bytes?: number | null }> | null | undefined): number {
	return (rows ?? []).reduce((total, row) => {
		const bytes = Number(row.file_size_bytes ?? 0);
		return Number.isFinite(bytes) && bytes > 0 ? total + bytes : total;
	}, 0);
}

async function loadUploadQuotaUsage(params: {
	supabase: any;
	userId: string;
	projectId: string | null;
	windowSeconds: number;
}): Promise<ChatAttachmentUploadQuotaUsage> {
	const windowStartedAt = new Date(Date.now() - params.windowSeconds * 1000).toISOString();
	const recentUploadsQuery = params.supabase
		.from('agent_chat_media_events')
		.select('file_size_bytes')
		.eq('user_id', params.userId)
		.eq('source', 'agent_chat_ui')
		.eq('event_type', 'upload_requested')
		.gte('created_at', windowStartedAt);
	const scopedRecentUploadsQuery = params.projectId
		? recentUploadsQuery.eq('project_id', params.projectId)
		: recentUploadsQuery.is('project_id', null);
	const projectStorageQuery = params.projectId
		? params.supabase
				.from('onto_assets')
				.select('file_size_bytes')
				.eq('project_id', params.projectId)
				.eq('kind', 'image')
				.is('deleted_at', null)
		: Promise.resolve({ data: [], error: null });
	const [recentUploadsResult, projectStorageResult] = await Promise.all([
		scopedRecentUploadsQuery,
		projectStorageQuery
	]);

	if (recentUploadsResult.error) throw recentUploadsResult.error;
	if (projectStorageResult.error) throw projectStorageResult.error;

	const recentUploads = (recentUploadsResult.data ?? []) as Array<{
		file_size_bytes?: number | null;
	}>;
	const projectAssets = (projectStorageResult.data ?? []) as Array<{
		file_size_bytes?: number | null;
	}>;

	return {
		uploadCount: recentUploads.length,
		uploadBytes: sumBytes(recentUploads),
		projectStorageBytes: sumBytes(projectAssets)
	};
}

function isUniqueViolation(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const maybe = error as { code?: string; message?: string };
	return maybe.code === '23505' || /duplicate key/i.test(maybe.message ?? '');
}

async function recordMediaEvent(params: {
	supabase: any;
	userId: string;
	projectId: string | null;
	assetId?: string | null;
	eventType: 'upload_requested' | 'upload_deduped';
	contentType: string;
	fileSizeBytes: number;
	checksumSha256: string;
	metadata?: Record<string, unknown>;
}): Promise<void> {
	const { error } = await params.supabase.from('agent_chat_media_events').insert({
		user_id: params.userId,
		project_id: params.projectId,
		asset_id: params.assetId ?? null,
		source: 'agent_chat_ui',
		event_type: params.eventType,
		media_type: 'image',
		content_type: params.contentType,
		file_size_bytes: params.fileSizeBytes,
		checksum_sha256: params.checksumSha256,
		metadata: params.metadata ?? {}
	});

	if (error) {
		console.warn('[agent-chat-attachments] failed to record media event', error);
	}
}

function createTemporaryImageAsset(params: {
	attachmentId: string;
	storagePath: string;
	fileName: string;
	contentType: string;
	fileSizeBytes: number;
	checksumSha256: string;
	width: number | null;
	height: number | null;
	expiresAt: string;
}): ExistingAssetRow & { expires_at: string } {
	return {
		id: params.attachmentId,
		project_id: null,
		kind: 'temporary_file',
		storage_bucket: CHAT_ATTACHMENT_STORAGE_BUCKET,
		storage_path: params.storagePath,
		original_filename: params.fileName,
		content_type: params.contentType,
		file_size_bytes: params.fileSizeBytes,
		width: params.width,
		height: params.height,
		checksum_sha256: params.checksumSha256,
		ocr_status: 'skipped',
		extraction_summary: null,
		expires_at: params.expiresAt
	};
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const body = (await request
		.json()
		.catch(() => null)) as ChatImageAttachmentCreateRequest | null;
	if (!body || typeof body !== 'object') {
		return ApiResponse.badRequest('Invalid request body');
	}

	const projectId = typeof body.project_id === 'string' ? body.project_id.trim() : '';
	const fileName = body.file_name?.trim();
	const contentType = body.content_type?.trim().toLowerCase();
	const fileSizeBytes = Number(body.file_size_bytes ?? 0);
	const checksumSha256 = normalizeChecksum(body.checksum_sha256);

	if (!fileName) {
		return ApiResponse.badRequest('file_name is required');
	}
	if (!contentType || !contentType.startsWith('image/')) {
		return ApiResponse.badRequest('content_type must be an image/* MIME type');
	}
	if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
		return ApiResponse.badRequest('file_size_bytes must be a positive number');
	}
	if (fileSizeBytes > MAX_IMAGE_SIZE_BYTES) {
		return ApiResponse.badRequest('Image exceeds chat attachment size limit');
	}
	if (!checksumSha256) {
		return ApiResponse.badRequest('checksum_sha256 must be a lowercase SHA-256 hex digest');
	}

	const caps: ChatImageAttachmentCaps = {
		max_image_attachments_per_turn: MAX_IMAGE_ATTACHMENTS_PER_TURN,
		max_file_size_bytes: MAX_IMAGE_SIZE_BYTES,
		upload_window_seconds: UPLOAD_WINDOW_SECONDS,
		max_uploads_per_window: MAX_UPLOADS_PER_WINDOW,
		max_upload_bytes_per_window: MAX_UPLOAD_BYTES_PER_WINDOW,
		project_storage_cap_bytes: PROJECT_STORAGE_CAP_BYTES
	};

	const accessResult = projectId
		? await ensureProjectAccess(locals.supabase, projectId, session.user.id, 'write')
		: null;
	if (accessResult && 'error' in accessResult) {
		return accessResult.error;
	}

	if (projectId) {
		try {
			const existingAsset = await findExistingAsset({
				supabase: locals.supabase as any,
				projectId,
				checksumSha256
			});

			if (existingAsset) {
				await recordMediaEvent({
					supabase: locals.supabase as any,
					userId: session.user.id,
					projectId,
					assetId: existingAsset.id,
					eventType: 'upload_deduped',
					contentType,
					fileSizeBytes,
					checksumSha256,
					metadata: { file_name: fileName }
				});

				return ApiResponse.success({
					asset: existingAsset,
					deduped: true,
					upload: null,
					caps
				} satisfies ChatImageAttachmentCreateResponse);
			}
		} catch (error) {
			return ApiResponse.databaseError(error);
		}
	}

	try {
		const usage = await loadUploadQuotaUsage({
			supabase: locals.supabase as any,
			userId: session.user.id,
			projectId,
			windowSeconds: UPLOAD_WINDOW_SECONDS
		});
		caps.project_storage_used_bytes = usage.projectStorageBytes;
		const quotaDecision = evaluateChatAttachmentUploadQuota({
			caps,
			usage,
			incomingBytes: fileSizeBytes
		});
		if (!quotaDecision.allowed) {
			return ApiResponse.error(
				quotaDecision.message,
				HttpStatus.TOO_MANY_REQUESTS,
				ErrorCode.RATE_LIMITED,
				{
					reason: quotaDecision.reason,
					...quotaDecision.details
				}
			);
		}
	} catch (error) {
		return ApiResponse.databaseError(error);
	}

	const assetId = crypto.randomUUID();
	const extension = getFileExtension(fileName, contentType);
	// Access/quota are validated above; the admin client is only used to mint
	// Storage signed-upload URLs because Supabase Storage inserts object rows at
	// token creation time and user-scoped Storage RLS can reject that insert.
	const storageAdmin = createAdminSupabaseClient();

	if (!projectId) {
		const expiresAt = new Date(Date.now() + TEMPORARY_IMAGE_TTL_SECONDS * 1000).toISOString();
		const storagePath = `users/${session.user.id}/chat-temp/${assetId}/original.${extension}`;
		const { data: uploadData, error: uploadError } = await storageAdmin.storage
			.from(CHAT_ATTACHMENT_STORAGE_BUCKET)
			.createSignedUploadUrl(storagePath);

		if (uploadError || !uploadData?.signedUrl) {
			return ApiResponse.internalError(
				uploadError || new Error('Failed to create upload URL')
			);
		}

		await recordMediaEvent({
			supabase: locals.supabase as any,
			userId: session.user.id,
			projectId: null,
			assetId: null,
			eventType: 'upload_requested',
			contentType,
			fileSizeBytes,
			checksumSha256,
			metadata: {
				file_name: fileName,
				temporary_attachment_id: assetId,
				expires_at: expiresAt
			}
		});

		return ApiResponse.created({
			asset: createTemporaryImageAsset({
				attachmentId: assetId,
				storagePath,
				fileName,
				contentType,
				fileSizeBytes,
				checksumSha256,
				width: typeof body.width === 'number' ? body.width : null,
				height: typeof body.height === 'number' ? body.height : null,
				expiresAt
			}),
			deduped: false,
			upload: {
				signed_url: uploadData.signedUrl,
				path: uploadData.path,
				token: uploadData.token ?? null
			},
			caps
		} satisfies ChatImageAttachmentCreateResponse);
	}

	const storagePath = `projects/${projectId}/assets/${assetId}/original.${extension}`;

	const insertPayload = {
		id: assetId,
		project_id: projectId,
		kind: 'image',
		storage_bucket: CHAT_ATTACHMENT_STORAGE_BUCKET,
		storage_path: storagePath,
		original_filename: fileName,
		content_type: contentType,
		file_size_bytes: fileSizeBytes,
		width: typeof body.width === 'number' ? body.width : null,
		height: typeof body.height === 'number' ? body.height : null,
		alt_text: typeof body.alt_text === 'string' ? body.alt_text : null,
		caption: typeof body.caption === 'string' ? body.caption : null,
		checksum_sha256: checksumSha256,
		metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
		ocr_status: 'pending',
		created_by: accessResult!.actorId
	};

	const { data: createdAsset, error: insertError } = await (locals.supabase as any)
		.from('onto_assets')
		.insert(insertPayload)
		.select(CHAT_ATTACHMENT_ASSET_SELECT)
		.single();

	if (insertError) {
		if (isUniqueViolation(insertError)) {
			try {
				const existingAsset = await findExistingAsset({
					supabase: locals.supabase as any,
					projectId,
					checksumSha256
				});
				if (existingAsset) {
					return ApiResponse.success({
						asset: existingAsset,
						deduped: true,
						upload: null,
						caps
					} satisfies ChatImageAttachmentCreateResponse);
				}
			} catch (error) {
				return ApiResponse.databaseError(error);
			}
		}
		return ApiResponse.databaseError(insertError);
	}

	const { data: uploadData, error: uploadError } = await storageAdmin.storage
		.from(CHAT_ATTACHMENT_STORAGE_BUCKET)
		.createSignedUploadUrl(storagePath);

	if (uploadError || !uploadData?.signedUrl) {
		await (locals.supabase as any).from('onto_assets').delete().eq('id', assetId);
		return ApiResponse.internalError(uploadError || new Error('Failed to create upload URL'));
	}

	await recordMediaEvent({
		supabase: locals.supabase as any,
		userId: session.user.id,
		projectId,
		assetId,
		eventType: 'upload_requested',
		contentType,
		fileSizeBytes,
		checksumSha256,
		metadata: { file_name: fileName }
	});

	return ApiResponse.created({
		asset: createdAsset,
		deduped: false,
		upload: {
			signed_url: uploadData.signedUrl,
			path: uploadData.path,
			token: uploadData.token ?? null
		},
		caps
	} satisfies ChatImageAttachmentCreateResponse);
};
