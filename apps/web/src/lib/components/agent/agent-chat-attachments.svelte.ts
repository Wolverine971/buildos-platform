// apps/web/src/lib/components/agent/agent-chat-attachments.svelte.ts
//
// AttachmentController — owns draft image attachments, upload lifecycle,
// preview URL cleanup, and OCR polling for AgentChatModal.

import type { ChatAttachmentRef, ChatImageAttachmentCreateResponse } from '@buildos/shared-types';
import type { OntologyImageAsset } from '$lib/components/ontology/image-assets/types';
import { uploadFileToSignedStorageUrl as uploadToSignedStorageUrl } from '$lib/utils/signed-storage-upload';
import type { AgentChatImageAttachment, UIMessage } from './agent-chat.types';

export const AGENT_CHAT_MAX_IMAGE_ATTACHMENTS = 4;
export const AGENT_CHAT_MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const AGENT_CHAT_MAX_CONCURRENT_IMAGE_UPLOADS = 2;
export const AGENT_CHAT_OCR_POLL_INITIAL_DELAY_MS = 2500;
export const AGENT_CHAT_OCR_POLL_MAX_DELAY_MS = 10_000;
export const AGENT_CHAT_OCR_POLL_MAX_ATTEMPTS = 10;

type TimeoutHandle = ReturnType<typeof setTimeout>;

type UploadToSignedStorageUrl = typeof uploadToSignedStorageUrl;
type ChatImageAttachmentCreateApiPayload =
	| (ChatImageAttachmentCreateResponse & { error?: string })
	| {
			error?: string;
			data?: ChatImageAttachmentCreateResponse;
	  };

export interface AttachmentControllerDeps {
	getBrowser(): boolean;
	getProjectId(): string | null | undefined;
	getMessages(): UIMessage[];
	setMessages(updater: (messages: UIMessage[]) => UIMessage[]): void;
	toastError(message: string): void;
	logWarn?(message: string, error: unknown): void;
	fetchImpl?: typeof fetch;
	uploadFileToSignedStorageUrl?: UploadToSignedStorageUrl;
	createObjectUrl?(file: File): string;
	revokeObjectUrl?(url: string | null | undefined): void;
	randomUUID?(): string;
	computeSha256?(file: File): Promise<string>;
	readImageDimensions?(file: File): Promise<{ width: number; height: number } | null>;
	setTimeoutImpl?(callback: () => void, delay: number): TimeoutHandle;
	clearTimeoutImpl?(id: TimeoutHandle): void;
}

export function assetRenderPreviewUrl(assetId: string): string {
	return `/api/onto/assets/${assetId}/render?width=160`;
}

export function compactAttachmentText(value: unknown, maxChars = 1200): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	return normalized.length <= maxChars
		? normalized
		: `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function isTerminalOcrStatus(status: unknown): boolean {
	return status === 'complete' || status === 'failed' || status === 'skipped';
}

export function shouldPollOcrStatus(status: unknown): boolean {
	return !isTerminalOcrStatus(status);
}

export function describeAttachmentOcrStatus(status: unknown): string {
	switch (status) {
		case 'complete':
			return 'OCR ready';
		case 'failed':
			return 'OCR failed';
		case 'skipped':
			return 'OCR skipped';
		case 'processing':
			return 'Extracting text...';
		case 'pending':
			return 'OCR queued';
		default:
			return 'OCR queued';
	}
}

export function hasDuplicateAttachmentChecksum(
	attachments: AgentChatImageAttachment[],
	attachmentId: string,
	checksum: string
): boolean {
	return attachments.some(
		(attachment) => attachment.id !== attachmentId && attachment.checksumSha256 === checksum
	);
}

export function imageAttachmentToRef(
	attachment: AgentChatImageAttachment,
	index: number,
	options: { includePreviewUrl?: boolean; projectId?: string | null } = {}
): ChatAttachmentRef {
	const isTemporary = attachment.attachmentKind === 'temporary_file' || !attachment.projectId;
	const previewUrl =
		options.includePreviewUrl && attachment.assetId
			? isTemporary
				? attachment.previewUrl
				: assetRenderPreviewUrl(attachment.assetId)
			: null;
	return {
		attachment_kind: isTemporary ? 'temporary_file' : 'onto_asset',
		media_type: 'image',
		asset_id: isTemporary ? undefined : attachment.assetId,
		temporary_attachment_id: isTemporary ? attachment.assetId : undefined,
		project_id: isTemporary ? null : (attachment.projectId ?? options.projectId ?? null),
		storage_bucket: isTemporary ? (attachment.storageBucket ?? null) : null,
		storage_path: isTemporary ? (attachment.storagePath ?? null) : null,
		file_name: attachment.fileName,
		content_type: attachment.contentType,
		file_size_bytes: attachment.fileSizeBytes,
		width: attachment.width ?? null,
		height: attachment.height ?? null,
		checksum_sha256: attachment.checksumSha256 ?? null,
		ocr_status: attachment.ocrStatus ?? null,
		extraction_summary: attachment.extractionSummary ?? null,
		extracted_text_preview: attachment.extractedTextPreview ?? null,
		role: 'analysis_target',
		display_order: index,
		expires_at: attachment.expiresAt ?? null,
		metadata: previewUrl ? { preview_url: previewUrl } : null
	};
}

async function defaultComputeSha256(file: File): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

async function defaultReadImageDimensions(
	file: File
): Promise<{ width: number; height: number } | null> {
	if (typeof createImageBitmap !== 'undefined') {
		const bitmap = await createImageBitmap(file);
		const dimensions = { width: bitmap.width, height: bitmap.height };
		bitmap.close();
		return dimensions;
	}
	return null;
}

function defaultRandomUUID(): string {
	return (
		crypto.randomUUID?.() ?? `attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`
	);
}

function isLocalObjectUrl(url: string | null | undefined): boolean {
	return typeof url === 'string' && url.startsWith('blob:');
}

export class AttachmentController {
	imageAttachments = $state<AgentChatImageAttachment[]>([]);

	#deps: AttachmentControllerDeps;
	#activePreviewUrls = new Set<string>();
	#uploadQueue: Array<() => Promise<void>> = [];
	#activeUploadCount = 0;
	#uploadGeneration = 0;
	#ocrGeneration = 0;
	#timers = new Set<TimeoutHandle>();

	constructor(deps: AttachmentControllerDeps) {
		this.#deps = deps;
	}

	get hasSendableImageAttachments(): boolean {
		return (
			this.imageAttachments.length > 0 &&
			this.imageAttachments.every(
				(attachment) =>
					Boolean(attachment.assetId) &&
					(attachment.status === 'ready' || attachment.status === 'deduped')
			)
		);
	}

	get hasPendingOrFailedImageAttachments(): boolean {
		return this.imageAttachments.some(
			(attachment) =>
				attachment.status === 'hashing' ||
				attachment.status === 'uploading' ||
				attachment.status === 'processing' ||
				attachment.status === 'error'
		);
	}

	get selectedAttachmentAssetIds(): string[] {
		return this.imageAttachments
			.map((attachment) => attachment.assetId)
			.filter((id): id is string => Boolean(id));
	}

	handleFiles(files: File[]): void {
		if (!this.#deps.getBrowser()) return;
		const projectId = this.#resolveProjectId();

		const imageFiles = files.filter((file) => file.type.startsWith('image/'));
		if (imageFiles.length === 0) {
			this.#deps.toastError('Drop an image file to attach it.');
			return;
		}
		if (imageFiles.length < files.length) {
			this.#deps.toastError(
				'Only image files can be attached here; unsupported files were skipped.'
			);
		}

		const remaining = AGENT_CHAT_MAX_IMAGE_ATTACHMENTS - this.imageAttachments.length;
		if (remaining <= 0) {
			this.#deps.toastError(
				`Attach up to ${AGENT_CHAT_MAX_IMAGE_ATTACHMENTS} images per message.`
			);
			return;
		}

		const accepted = imageFiles.slice(0, remaining);
		if (imageFiles.length > accepted.length) {
			this.#deps.toastError(
				`Only ${AGENT_CHAT_MAX_IMAGE_ATTACHMENTS} images can be attached at once.`
			);
		}

		for (const file of accepted) {
			if (file.size > AGENT_CHAT_MAX_IMAGE_BYTES) {
				this.#deps.toastError(`${file.name || 'Image'} exceeds the 25MB limit.`);
				continue;
			}

			const previewUrl = this.#createObjectUrl(file);
			this.#activePreviewUrls.add(previewUrl);
			const attachmentId = this.#randomUUID();
			const uploadGeneration = this.#uploadGeneration;
			this.imageAttachments = [
				...this.imageAttachments,
				{
					id: attachmentId,
					fileName: file.name || 'image',
					contentType: file.type || 'image/jpeg',
					fileSizeBytes: file.size,
					previewUrl,
					status: 'hashing',
					statusLabel: 'Preparing image...'
				}
			];
			this.#enqueueUpload(async () => {
				if (uploadGeneration !== this.#uploadGeneration) return;
				await this.#uploadImageAttachment(attachmentId, file, projectId);
			});
		}
	}

	attachExistingImage(asset: OntologyImageAsset): boolean {
		if (!asset?.id) return false;
		if (this.imageAttachments.length >= AGENT_CHAT_MAX_IMAGE_ATTACHMENTS) {
			this.#deps.toastError(
				`Attach up to ${AGENT_CHAT_MAX_IMAGE_ATTACHMENTS} images per message.`
			);
			return false;
		}
		if (this.imageAttachments.some((attachment) => attachment.assetId === asset.id)) {
			this.#deps.toastError('This image is already attached to the draft.');
			return false;
		}

		const attachmentId = this.#randomUUID();
		this.imageAttachments = [
			...this.imageAttachments,
			{
				id: attachmentId,
				fileName: asset.original_filename || asset.caption || 'Project image',
				contentType: asset.content_type || 'image/jpeg',
				fileSizeBytes: Number(asset.file_size_bytes ?? 0),
				previewUrl: assetRenderPreviewUrl(asset.id),
				status: 'ready',
				statusLabel: describeAttachmentOcrStatus(asset.ocr_status),
				attachmentKind: 'onto_asset',
				assetId: asset.id,
				projectId: asset.project_id,
				storageBucket: asset.storage_bucket ?? null,
				storagePath: asset.storage_path ?? null,
				checksumSha256: asset.checksum_sha256 ?? undefined,
				width: asset.width ?? null,
				height: asset.height ?? null,
				ocrStatus: asset.ocr_status ?? 'pending',
				extractionSummary: compactAttachmentText(asset.extraction_summary, 700),
				extractedTextPreview: compactAttachmentText(asset.extracted_text)
			}
		];
		this.#scheduleDraftOcrPoll(attachmentId, asset.id, asset.ocr_status ?? 'pending');
		return true;
	}

	remove(attachmentId: string): void {
		const attachment = this.imageAttachments.find((item) => item.id === attachmentId);
		this.#revokePreviewUrl(attachment?.previewUrl);
		this.imageAttachments = this.imageAttachments.filter((item) => item.id !== attachmentId);
	}

	/**
	 * Clears the composer draft and cancels queued uploads. Object URLs are kept alive
	 * so optimistic user-message previews remain valid after send.
	 */
	clearDraft(): void {
		this.#cancelQueuedUploads();
		this.imageAttachments = [];
	}

	restoreDraft(attachments: AgentChatImageAttachment[]): void {
		this.imageAttachments = attachments;
		for (const attachment of attachments) {
			if (isLocalObjectUrl(attachment.previewUrl)) {
				this.#activePreviewUrls.add(attachment.previewUrl);
			}
		}
	}

	buildReadyRefs(includePreviewUrl = false): ChatAttachmentRef[] {
		const projectId = this.#resolveProjectId();
		return this.imageAttachments
			.filter(
				(attachment) =>
					Boolean(attachment.assetId) &&
					(attachment.status === 'ready' || attachment.status === 'deduped')
			)
			.map((attachment, index) =>
				imageAttachmentToRef(attachment, index, { includePreviewUrl, projectId })
			);
	}

	scheduleMessageOcrPoll(messageId: string, assetId: string, status: unknown): void {
		this.#scheduleMessageOcrPoll(messageId, assetId, status);
	}

	cleanup(): void {
		this.#cancelQueuedUploads();
		this.#ocrGeneration += 1;
		this.imageAttachments = [];
		this.#clearTimers();
		this.#revokeAllPreviewUrls();
	}

	#resolveProjectId(): string | null {
		return this.#deps.getProjectId() ?? null;
	}

	#randomUUID(): string {
		return this.#deps.randomUUID?.() ?? defaultRandomUUID();
	}

	#createObjectUrl(file: File): string {
		return this.#deps.createObjectUrl?.(file) ?? URL.createObjectURL(file);
	}

	#revokeObjectUrl(url: string | null | undefined): void {
		if (!url) return;
		if (this.#deps.revokeObjectUrl) {
			this.#deps.revokeObjectUrl(url);
			return;
		}
		URL.revokeObjectURL(url);
	}

	#fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
		const fetchImpl = this.#deps.fetchImpl ?? fetch;
		return fetchImpl(input, init);
	}

	#uploadToSignedStorageUrl: UploadToSignedStorageUrl = (params) => {
		return (this.#deps.uploadFileToSignedStorageUrl ?? uploadToSignedStorageUrl)(params);
	};

	#computeSha256(file: File): Promise<string> {
		return this.#deps.computeSha256?.(file) ?? defaultComputeSha256(file);
	}

	#readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
		return this.#deps.readImageDimensions?.(file) ?? defaultReadImageDimensions(file);
	}

	#hasAttachment(attachmentId: string): boolean {
		return this.imageAttachments.some((attachment) => attachment.id === attachmentId);
	}

	#updateAttachment(attachmentId: string, patch: Partial<AgentChatImageAttachment>): void {
		this.imageAttachments = this.imageAttachments.map((attachment) =>
			attachment.id === attachmentId ? { ...attachment, ...patch } : attachment
		);
	}

	#revokePreviewUrl(url: string | null | undefined): void {
		if (!url || !this.#activePreviewUrls.has(url)) return;
		this.#revokeObjectUrl(url);
		this.#activePreviewUrls.delete(url);
	}

	#revokeAllPreviewUrls(): void {
		for (const url of this.#activePreviewUrls) {
			this.#revokeObjectUrl(url);
		}
		this.#activePreviewUrls.clear();
	}

	#cancelQueuedUploads(): void {
		this.#uploadGeneration += 1;
		this.#uploadQueue.length = 0;
	}

	#scheduleNextUpload(): void {
		if (this.#activeUploadCount >= AGENT_CHAT_MAX_CONCURRENT_IMAGE_UPLOADS) return;
		const nextUpload = this.#uploadQueue.shift();
		if (!nextUpload) return;

		this.#activeUploadCount += 1;
		void nextUpload()
			.catch((error) => {
				this.#deps.logWarn?.('[AgentChat] Image attachment upload failed:', error);
			})
			.finally(() => {
				this.#activeUploadCount = Math.max(0, this.#activeUploadCount - 1);
				this.#scheduleNextUpload();
			});
	}

	#enqueueUpload(task: () => Promise<void>): void {
		this.#uploadQueue.push(task);
		this.#scheduleNextUpload();
	}

	#setTrackedTimeout(callback: () => void, delay: number): TimeoutHandle {
		const setTimer = this.#deps.setTimeoutImpl ?? setTimeout;
		const id = setTimer(() => {
			this.#timers.delete(id);
			callback();
		}, delay);
		this.#timers.add(id);
		return id;
	}

	#clearTimers(): void {
		const clearTimer = this.#deps.clearTimeoutImpl ?? clearTimeout;
		for (const id of this.#timers) {
			clearTimer(id);
		}
		this.#timers.clear();
	}

	#applyDraftAssetSnapshot(attachmentId: string, asset: Record<string, any>): void {
		const current = this.imageAttachments.find((attachment) => attachment.id === attachmentId);
		if (!current || current.assetId !== asset.id) return;
		this.#updateAttachment(attachmentId, {
			status: current.status === 'deduped' ? 'deduped' : 'ready',
			statusLabel: describeAttachmentOcrStatus(asset.ocr_status),
			ocrStatus: asset.ocr_status ?? current.ocrStatus ?? 'pending',
			extractionSummary: compactAttachmentText(asset.extraction_summary, 700),
			extractedTextPreview: compactAttachmentText(asset.extracted_text)
		});
		this.#applyMessageAssetSnapshot(asset);
	}

	#applyMessageAssetSnapshot(asset: Record<string, any>): void {
		if (!asset?.id) return;
		const assetId = String(asset.id);
		this.#deps.setMessages((messages) =>
			messages.map((message) => {
				if (!message.attachments?.length) return message;
				let messageDidUpdate = false;
				const attachments = message.attachments.map((attachment) => {
					if (attachment.asset_id !== assetId) return attachment;
					messageDidUpdate = true;
					return {
						...attachment,
						file_name: asset.original_filename ?? attachment.file_name ?? null,
						content_type: asset.content_type ?? attachment.content_type ?? null,
						file_size_bytes:
							asset.file_size_bytes ?? attachment.file_size_bytes ?? null,
						width: asset.width ?? attachment.width ?? null,
						height: asset.height ?? attachment.height ?? null,
						checksum_sha256:
							asset.checksum_sha256 ?? attachment.checksum_sha256 ?? null,
						ocr_status: asset.ocr_status ?? attachment.ocr_status ?? null,
						extraction_summary:
							compactAttachmentText(asset.extraction_summary, 700) ??
							attachment.extraction_summary ??
							null,
						extracted_text_preview:
							compactAttachmentText(asset.extracted_text) ??
							attachment.extracted_text_preview ??
							null,
						metadata: {
							...(attachment.metadata ?? {}),
							preview_url: assetRenderPreviewUrl(assetId)
						}
					};
				});
				return messageDidUpdate ? { ...message, attachments } : message;
			})
		);
	}

	#scheduleDraftOcrPoll(
		attachmentId: string,
		assetId: string,
		ocrStatus: unknown,
		attempt = 0,
		generation = this.#ocrGeneration
	): void {
		if (generation !== this.#ocrGeneration) return;
		if (!this.#deps.getBrowser() || !assetId || !shouldPollOcrStatus(ocrStatus)) return;
		if (attempt >= AGENT_CHAT_OCR_POLL_MAX_ATTEMPTS) {
			this.#updateAttachment(attachmentId, {
				statusLabel: 'OCR still running'
			});
			return;
		}

		const delay = Math.min(
			AGENT_CHAT_OCR_POLL_MAX_DELAY_MS,
			AGENT_CHAT_OCR_POLL_INITIAL_DELAY_MS + attempt * 1000
		);
		this.#setTrackedTimeout(() => {
			void this.#pollDraftOcrStatus(attachmentId, assetId, attempt + 1, generation);
		}, delay);
	}

	async #pollDraftOcrStatus(
		attachmentId: string,
		assetId: string,
		attempt: number,
		generation: number
	): Promise<void> {
		if (generation !== this.#ocrGeneration) return;
		const current = this.imageAttachments.find((attachment) => attachment.id === attachmentId);
		if (!current || current.assetId !== assetId || !shouldPollOcrStatus(current.ocrStatus)) {
			return;
		}

		try {
			const response = await this.#fetch(`/api/onto/assets/${assetId}`);
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to refresh attachment OCR');
			}
			const asset = payload?.data?.asset;
			if (!asset?.id || asset.id !== assetId) return;
			if (generation !== this.#ocrGeneration) return;
			this.#applyDraftAssetSnapshot(attachmentId, asset);
			this.#scheduleDraftOcrPoll(
				attachmentId,
				assetId,
				asset.ocr_status,
				attempt,
				generation
			);
		} catch {
			this.#scheduleDraftOcrPoll(
				attachmentId,
				assetId,
				current.ocrStatus,
				attempt,
				generation
			);
		}
	}

	#scheduleMessageOcrPoll(
		messageId: string,
		assetId: string,
		ocrStatus: unknown,
		attempt = 0,
		generation = this.#ocrGeneration
	): void {
		if (generation !== this.#ocrGeneration) return;
		if (!this.#deps.getBrowser() || !messageId || !assetId || !shouldPollOcrStatus(ocrStatus)) {
			return;
		}
		if (attempt >= AGENT_CHAT_OCR_POLL_MAX_ATTEMPTS) return;
		const delay = Math.min(
			AGENT_CHAT_OCR_POLL_MAX_DELAY_MS,
			AGENT_CHAT_OCR_POLL_INITIAL_DELAY_MS + attempt * 1000
		);
		this.#setTrackedTimeout(() => {
			void this.#pollMessageOcrStatus(messageId, assetId, attempt + 1, generation);
		}, delay);
	}

	async #pollMessageOcrStatus(
		messageId: string,
		assetId: string,
		attempt: number,
		generation: number
	): Promise<void> {
		if (generation !== this.#ocrGeneration) return;
		const message = this.#deps.getMessages().find((item) => item.id === messageId);
		const attachment = message?.attachments?.find((item) => item.asset_id === assetId);
		if (!attachment || !shouldPollOcrStatus(attachment.ocr_status)) return;

		try {
			const response = await this.#fetch(`/api/onto/assets/${assetId}`);
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to refresh attachment OCR');
			}
			const asset = payload?.data?.asset;
			if (!asset?.id || asset.id !== assetId) return;
			if (generation !== this.#ocrGeneration) return;
			this.#applyMessageAssetSnapshot(asset);
			this.#scheduleMessageOcrPoll(messageId, assetId, asset.ocr_status, attempt, generation);
		} catch {
			this.#scheduleMessageOcrPoll(
				messageId,
				assetId,
				attachment.ocr_status,
				attempt,
				generation
			);
		}
	}

	async #uploadImageAttachment(
		attachmentId: string,
		file: File,
		projectId: string | null
	): Promise<void> {
		try {
			if (!this.#hasAttachment(attachmentId)) return;
			this.#updateAttachment(attachmentId, {
				status: 'hashing',
				statusLabel: 'Preparing image...'
			});

			const [checksumSha256, dimensions] = await Promise.all([
				this.#computeSha256(file),
				this.#readImageDimensions(file).catch(() => null)
			]);

			if (!this.#hasAttachment(attachmentId)) return;
			if (
				hasDuplicateAttachmentChecksum(this.imageAttachments, attachmentId, checksumSha256)
			) {
				this.#updateAttachment(attachmentId, {
					status: 'error',
					statusLabel: 'Duplicate image',
					error: 'This image is already attached to the draft.',
					checksumSha256
				});
				return;
			}

			if (!this.#hasAttachment(attachmentId)) return;
			this.#updateAttachment(attachmentId, {
				status: 'uploading',
				statusLabel: 'Uploading...',
				checksumSha256,
				width: dimensions?.width ?? null,
				height: dimensions?.height ?? null
			});

			const createResponse = await this.#fetch('/api/agent/chat-attachments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: projectId ?? null,
					file_name: file.name || 'image',
					content_type: file.type || 'image/jpeg',
					file_size_bytes: file.size,
					checksum_sha256: checksumSha256,
					width: dimensions?.width ?? null,
					height: dimensions?.height ?? null,
					metadata: {
						source_component: 'agent_chat_composer'
					}
				})
			});
			const createPayload = (await createResponse
				.json()
				.catch(() => null)) as ChatImageAttachmentCreateApiPayload | null;
			if (!createResponse.ok) {
				throw new Error(createPayload?.error ?? 'Failed to create image attachment');
			}

			const createData =
				createPayload && 'data' in createPayload && createPayload.data
					? createPayload.data
					: createPayload && 'asset' in createPayload
						? createPayload
						: null;
			const asset = createData?.asset;
			const upload = createData?.upload;
			if (!asset?.id) {
				throw new Error('Attachment asset metadata missing from server response');
			}

			if (upload) {
				await this.#uploadToSignedStorageUrl({
					bucket: asset.storage_bucket ?? 'onto-assets',
					upload,
					file,
					contentType: file.type || 'application/octet-stream'
				});

				if (!asset.project_id || asset.kind === 'temporary_file') {
					this.#updateAttachment(attachmentId, {
						status: 'ready',
						statusLabel: 'Ready to analyze',
						attachmentKind: 'temporary_file',
						assetId: asset.id,
						projectId: null,
						storageBucket: asset.storage_bucket ?? null,
						storagePath: asset.storage_path ?? null,
						ocrStatus: asset.ocr_status ?? 'skipped',
						expiresAt: asset.expires_at ?? null
					});
					return;
				}

				this.#updateAttachment(attachmentId, {
					status: 'processing',
					statusLabel: 'Queueing OCR...',
					attachmentKind: 'onto_asset',
					assetId: asset.id,
					projectId: asset.project_id,
					storageBucket: asset.storage_bucket ?? null,
					storagePath: asset.storage_path ?? null,
					ocrStatus: asset.ocr_status ?? 'pending'
				});

				const completeResponse = await this.#fetch(
					`/api/onto/assets/${asset.id}/complete`,
					{
						method: 'POST'
					}
				);
				const completePayload = await completeResponse.json().catch(() => null);
				if (!completeResponse.ok) {
					throw new Error(completePayload?.error ?? 'Failed to queue OCR');
				}

				const completedAsset = completePayload?.data?.asset ?? asset;
				this.#updateAttachment(attachmentId, {
					status: 'ready',
					statusLabel: describeAttachmentOcrStatus(completedAsset.ocr_status),
					attachmentKind: 'onto_asset',
					assetId: completedAsset.id,
					projectId: completedAsset.project_id,
					storageBucket: completedAsset.storage_bucket ?? null,
					storagePath: completedAsset.storage_path ?? null,
					ocrStatus: completedAsset.ocr_status ?? 'pending',
					extractionSummary: compactAttachmentText(
						completedAsset.extraction_summary,
						700
					),
					extractedTextPreview: compactAttachmentText(completedAsset.extracted_text)
				});
				this.#scheduleDraftOcrPoll(
					attachmentId,
					completedAsset.id,
					completedAsset.ocr_status ?? 'pending'
				);
				return;
			}

			this.#updateAttachment(attachmentId, {
				status: 'deduped',
				statusLabel:
					asset.ocr_status === 'complete'
						? 'Existing OCR ready'
						: describeAttachmentOcrStatus(asset.ocr_status),
				attachmentKind: 'onto_asset',
				assetId: asset.id,
				projectId: asset.project_id,
				storageBucket: asset.storage_bucket ?? null,
				storagePath: asset.storage_path ?? null,
				ocrStatus: asset.ocr_status ?? 'pending',
				extractionSummary: compactAttachmentText(asset.extraction_summary, 700),
				extractedTextPreview: compactAttachmentText((asset as any).extracted_text)
			});
			this.#scheduleDraftOcrPoll(attachmentId, asset.id, asset.ocr_status ?? 'pending');
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to upload image attachment';
			this.#updateAttachment(attachmentId, {
				status: 'error',
				statusLabel: 'Upload failed',
				error: message
			});
			this.#deps.toastError(message);
		}
	}
}

export function createAttachmentController(deps: AttachmentControllerDeps): AttachmentController {
	return new AttachmentController(deps);
}
