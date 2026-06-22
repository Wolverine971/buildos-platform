// apps/web/src/lib/services/agentic-chat-v2/stream-attachments.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatAttachmentRef, ChatContextType, Database } from '@buildos/shared-types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { ErrorLoggerService } from '$lib/services/errorLogger.service';
import type { FastAgentStreamRequest } from './types';
import { checkProjectAccess } from './access-checks';
import {
	assessLiveVisionImageEligibility,
	createChatAttachmentRefFromAsset,
	type ChatAttachmentAssetRow
} from './attachments';
import { resolveEffectiveProjectId } from './scope';

type FastChatSupabaseClient = SupabaseClient<Database>;

type StreamAttachmentLogger = {
	warn(message: string, metadata?: Record<string, unknown>): void;
};

type StorageAdminClient = {
	storage: {
		from(bucket: string): {
			list(
				folder: string,
				options?: { limit?: number; search?: string }
			): Promise<{ data?: Array<{ name?: string }> | null; error?: unknown }>;
			createSignedUrl(
				path: string,
				ttlSeconds: number,
				options?: unknown
			): Promise<{ data?: { signedUrl?: string } | null; error?: unknown }>;
		};
	};
};

type CreateStorageAdminClient = () => StorageAdminClient;

export type ValidatedChatAttachments = {
	attachments: ChatAttachmentRef[];
	assets: ChatAttachmentAssetRow[];
};

export type ChatAttachmentValidationResult = ValidatedChatAttachments | { error: Response };

export type LiveVisionSignedImage = {
	assetId: string;
	signedUrl: string;
};

export function resolveChatAttachmentProjectId(
	contextType: ChatContextType,
	streamRequest: Pick<FastAgentStreamRequest, 'entity_id' | 'projectFocus'>
): string | null {
	return resolveEffectiveProjectId({
		contextType,
		entityId: streamRequest.entity_id,
		projectFocus: streamRequest.projectFocus
	});
}

export async function loadValidatedChatAttachments(params: {
	supabase: FastChatSupabaseClient;
	userId: string;
	projectId: string | null;
	attachments: ChatAttachmentRef[];
	errorLogger?: ErrorLoggerService;
	endpoint: string;
	httpMethod: string;
	maxExtractedTextChars: number;
	tempAttachmentPathPrefix: string;
	storageBucket: string;
	maxTempImageBytes: number;
	createAdminClient?: CreateStorageAdminClient;
}): Promise<ChatAttachmentValidationResult> {
	const projectAttachments = params.attachments.filter(
		(attachment) => attachment.attachment_kind === 'onto_asset'
	);
	const temporaryAttachments = params.attachments.filter(
		(attachment) => attachment.attachment_kind === 'temporary_file'
	);

	if (projectAttachments.length > 0 && !params.projectId) {
		return {
			error: ApiResponse.badRequest(
				'Project image attachments require a project chat context'
			)
		};
	}

	const attachmentKeys = params.attachments.map((attachment) =>
		attachment.attachment_kind === 'temporary_file'
			? `temporary:${attachment.temporary_attachment_id ?? ''}`
			: `asset:${attachment.asset_id ?? ''}`
	);
	if (
		new Set(attachmentKeys).size !== attachmentKeys.length ||
		attachmentKeys.some((key) => key.endsWith(':'))
	) {
		return { error: ApiResponse.badRequest('Duplicate chat attachments are not allowed') };
	}

	const projectAssetsById = new Map<string, ChatAttachmentAssetRow>();
	if (projectAttachments.length > 0 && params.projectId) {
		const accessResult = await checkProjectAccess(
			params.supabase,
			params.projectId,
			params.errorLogger,
			{
				userId: params.userId,
				endpoint: params.endpoint,
				httpMethod: params.httpMethod
			}
		);

		if (!accessResult.allowed) {
			return { error: ApiResponse.forbidden('Access denied for the selected project.') };
		}

		const assetIds = projectAttachments.map((attachment) => String(attachment.asset_id));
		const { data, error } = await params.supabase
			.from('onto_assets')
			.select(
				'id, project_id, storage_bucket, storage_path, original_filename, content_type, file_size_bytes, width, height, checksum_sha256, ocr_status, extraction_summary, extracted_text'
			)
			.in('id', assetIds)
			.eq('project_id', params.projectId)
			.eq('kind', 'image')
			.is('deleted_at', null);

		if (error) {
			return { error: ApiResponse.databaseError(error) };
		}

		for (const asset of (data ?? []) as ChatAttachmentAssetRow[]) {
			projectAssetsById.set(asset.id, asset);
		}
		if (projectAssetsById.size !== assetIds.length) {
			return {
				error: ApiResponse.forbidden('One or more image attachments are unavailable')
			};
		}
	}

	const createAdminClient = params.createAdminClient ?? createAdminSupabaseClient;
	const storageAdmin = temporaryAttachments.length > 0 ? createAdminClient() : null;
	const orderedAttachments: ChatAttachmentRef[] = [];
	const orderedAssets: ChatAttachmentAssetRow[] = [];

	for (const [index, attachment] of params.attachments.entries()) {
		if (attachment.attachment_kind === 'onto_asset') {
			const asset = projectAssetsById.get(String(attachment.asset_id));
			if (!asset) {
				return {
					error: ApiResponse.forbidden('One or more image attachments are unavailable')
				};
			}
			orderedAssets.push(asset);
			orderedAttachments.push(
				createChatAttachmentRefFromAsset(
					asset,
					{
						...attachment,
						display_order: attachment.display_order ?? index,
						role: 'analysis_target'
					},
					{ maxExtractedTextChars: params.maxExtractedTextChars }
				)
			);
			continue;
		}

		const temporaryAttachmentId = attachment.temporary_attachment_id?.trim();
		const storageBucket = attachment.storage_bucket?.trim();
		const storagePath = attachment.storage_path?.trim();
		const contentType = attachment.content_type?.trim().toLowerCase() ?? '';
		const fileSizeBytes = Number(attachment.file_size_bytes ?? 0);
		const expectedPrefix = `${params.tempAttachmentPathPrefix}/${params.userId}/chat-temp/${temporaryAttachmentId}/`;
		if (
			!temporaryAttachmentId ||
			storageBucket !== params.storageBucket ||
			!storagePath ||
			!storagePath.startsWith(expectedPrefix) ||
			!contentType.startsWith('image/') ||
			!Number.isFinite(fileSizeBytes) ||
			fileSizeBytes <= 0 ||
			fileSizeBytes > params.maxTempImageBytes
		) {
			return { error: ApiResponse.badRequest('Invalid temporary image attachment') };
		}

		const pathParts = storagePath.split('/');
		const filename = pathParts.pop();
		const folder = pathParts.join('/');
		if (!filename || !storageAdmin) {
			return { error: ApiResponse.badRequest('Invalid temporary image attachment') };
		}
		const { data: listed, error: listError } = await storageAdmin.storage
			.from(storageBucket)
			.list(folder, { limit: 1, search: filename });
		if (listError) {
			return {
				error: ApiResponse.internalError(
					listError,
					'Failed to verify temporary image attachment'
				)
			};
		}
		if (!(listed ?? []).some((entry) => entry.name === filename)) {
			return { error: ApiResponse.badRequest('Temporary image upload is not complete') };
		}

		const tempAsset: ChatAttachmentAssetRow = {
			id: temporaryAttachmentId,
			project_id: null,
			storage_bucket: storageBucket,
			storage_path: storagePath,
			original_filename: attachment.file_name ?? null,
			content_type: contentType,
			file_size_bytes: fileSizeBytes,
			width: attachment.width ?? null,
			height: attachment.height ?? null,
			checksum_sha256: attachment.checksum_sha256 ?? null,
			ocr_status: 'skipped',
			extraction_summary: null,
			extracted_text: null
		};
		orderedAssets.push(tempAsset);
		orderedAttachments.push({
			...attachment,
			attachment_kind: 'temporary_file',
			media_type: 'image',
			temporary_attachment_id: temporaryAttachmentId,
			storage_bucket: storageBucket,
			storage_path: storagePath,
			ocr_status: 'skipped',
			role: 'analysis_target',
			display_order: attachment.display_order ?? index
		});
	}

	return {
		assets: orderedAssets,
		attachments: orderedAttachments
	};
}

async function recordAgentChatMediaEvent(params: {
	supabase: FastChatSupabaseClient;
	userId: string;
	projectId: string | null;
	sessionId?: string | null;
	messageId?: string | null;
	asset: ChatAttachmentAssetRow;
	eventType: 'live_vision_requested' | 'live_vision_failed';
	metadata?: Record<string, unknown>;
	logger?: StreamAttachmentLogger;
}): Promise<void> {
	const { error } = await params.supabase.from('agent_chat_media_events').insert({
		user_id: params.userId,
		project_id: params.projectId,
		session_id: params.sessionId ?? null,
		message_id: params.messageId ?? null,
		asset_id: params.asset.project_id ? params.asset.id : null,
		source: 'agent_chat_ui',
		event_type: params.eventType,
		media_type: 'image',
		content_type: params.asset.content_type,
		file_size_bytes: params.asset.file_size_bytes,
		checksum_sha256: params.asset.checksum_sha256,
		metadata: {
			...(params.metadata ?? {}),
			...(params.asset.project_id ? {} : { temporary_attachment_id: params.asset.id })
		}
	});

	if (error) {
		params.logger?.warn('Failed to record agent chat media event', {
			error,
			eventType: params.eventType,
			assetId: params.asset.id
		});
	}
}

export async function createLiveVisionSignedImages(params: {
	supabase: FastChatSupabaseClient;
	userId: string;
	projectId: string | null;
	sessionId: string;
	assets: ChatAttachmentAssetRow[];
	maxImages: number;
	maxImageBytes: number;
	renderWidth: number;
	ttlSeconds: number;
	createAdminClient?: CreateStorageAdminClient;
	logger?: StreamAttachmentLogger;
}): Promise<{
	images: LiveVisionSignedImage[];
	failedAssetIds: string[];
	skippedByLimit: number;
}> {
	const candidates: ChatAttachmentAssetRow[] = [];
	const failedAssetIds: string[] = [];
	for (const asset of params.assets) {
		const eligibility = assessLiveVisionImageEligibility(asset, {
			maxBytes: params.maxImageBytes
		});
		if (!eligibility.eligible) {
			failedAssetIds.push(asset.id);
			await recordAgentChatMediaEvent({
				supabase: params.supabase,
				userId: params.userId,
				projectId: params.projectId,
				sessionId: params.sessionId,
				asset,
				eventType: 'live_vision_failed',
				metadata: {
					reason: eligibility.reason,
					max_file_size_bytes: params.maxImageBytes
				},
				logger: params.logger
			});
			continue;
		}
		candidates.push(asset);
	}
	const selected = candidates.slice(0, Math.max(0, params.maxImages));
	const images: LiveVisionSignedImage[] = [];
	const createAdminClient = params.createAdminClient ?? createAdminSupabaseClient;
	const storageAdmin = selected.length > 0 ? createAdminClient() : null;

	for (const asset of selected) {
		const bucket = asset.storage_bucket?.trim();
		const path = asset.storage_path?.trim();
		if (!bucket || !path || !storageAdmin) {
			failedAssetIds.push(asset.id);
			await recordAgentChatMediaEvent({
				supabase: params.supabase,
				userId: params.userId,
				projectId: params.projectId,
				sessionId: params.sessionId,
				asset,
				eventType: 'live_vision_failed',
				metadata: { reason: 'missing_storage_pointer' },
				logger: params.logger
			});
			continue;
		}

		let signedUrlResult: { data?: { signedUrl?: string } | null; error?: unknown } = {};
		try {
			const transform =
				params.renderWidth > 0
					? {
							width: params.renderWidth
						}
					: undefined;
			signedUrlResult = await storageAdmin.storage
				.from(bucket)
				.createSignedUrl(path, params.ttlSeconds, transform ? { transform } : undefined);
		} catch (error) {
			signedUrlResult = { error };
		}

		if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
			failedAssetIds.push(asset.id);
			params.logger?.warn('Failed to create live vision signed image URL', {
				error: signedUrlResult.error,
				assetId: asset.id,
				sessionId: params.sessionId
			});
			await recordAgentChatMediaEvent({
				supabase: params.supabase,
				userId: params.userId,
				projectId: params.projectId,
				sessionId: params.sessionId,
				asset,
				eventType: 'live_vision_failed',
				metadata: { reason: 'signed_url_failed' },
				logger: params.logger
			});
			continue;
		}

		images.push({
			assetId: asset.id,
			signedUrl: signedUrlResult.data.signedUrl
		});
		await recordAgentChatMediaEvent({
			supabase: params.supabase,
			userId: params.userId,
			projectId: params.projectId,
			sessionId: params.sessionId,
			asset,
			eventType: 'live_vision_requested',
			metadata: {
				ttl_seconds: params.ttlSeconds,
				render_width: params.renderWidth,
				max_file_size_bytes: params.maxImageBytes,
				mode: 'current_turn_visual_reasoning'
			},
			logger: params.logger
		});
	}

	return {
		images,
		failedAssetIds,
		skippedByLimit: Math.max(0, candidates.length - selected.length)
	};
}
