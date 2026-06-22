// apps/web/src/lib/components/agent/agent-chat-attachments.svelte.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatAttachmentRef } from '@buildos/shared-types';
import type { OntologyImageAsset } from '$lib/components/ontology/image-assets/types';
import type { AgentChatImageAttachment, UIMessage } from './agent-chat.types';
import {
	AGENT_CHAT_MAX_IMAGE_ATTACHMENTS,
	AGENT_CHAT_OCR_POLL_INITIAL_DELAY_MS,
	createAttachmentController,
	describeAttachmentOcrStatus,
	hasDuplicateAttachmentChecksum,
	imageAttachmentToRef,
	shouldPollOcrStatus,
	type AttachmentControllerDeps
} from './agent-chat-attachments.svelte';

function jsonResponse(body: unknown, ok = true): Response {
	return {
		ok,
		status: ok ? 200 : 400,
		statusText: ok ? 'OK' : 'Bad Request',
		json: vi.fn().mockResolvedValue(body)
	} as unknown as Response;
}

function makeFile(name = 'screenshot.png', type = 'image/png', size = 1024): File {
	return new File([new Uint8Array(size)], name, { type });
}

function makeAttachment(
	overrides: Partial<AgentChatImageAttachment> = {}
): AgentChatImageAttachment {
	return {
		id: 'attachment-1',
		fileName: 'screenshot.png',
		contentType: 'image/png',
		fileSizeBytes: 1024,
		previewUrl: 'blob:screenshot',
		status: 'ready',
		statusLabel: 'OCR ready',
		attachmentKind: 'onto_asset',
		assetId: 'asset-1',
		projectId: 'project-1',
		storageBucket: 'onto-assets',
		storagePath: 'projects/project-1/assets/asset-1/original.png',
		checksumSha256: 'checksum-1',
		width: 800,
		height: 600,
		ocrStatus: 'complete',
		extractionSummary: 'summary',
		extractedTextPreview: 'text',
		...overrides
	};
}

function makeAsset(overrides: Partial<OntologyImageAsset> = {}): OntologyImageAsset {
	return {
		id: 'asset-1',
		project_id: 'project-1',
		kind: 'image',
		storage_bucket: 'onto-assets',
		storage_path: 'projects/project-1/assets/asset-1/original.png',
		original_filename: 'Project image.png',
		content_type: 'image/png',
		file_size_bytes: 4096,
		checksum_sha256: 'asset-checksum',
		width: 1200,
		height: 800,
		alt_text: null,
		caption: null,
		metadata: {},
		ocr_status: 'complete',
		ocr_error: null,
		ocr_model: null,
		ocr_version: 1,
		ocr_started_at: null,
		ocr_completed_at: null,
		extracted_text: 'Detected words',
		extracted_text_source: 'ocr',
		extracted_text_updated_at: null,
		extracted_text_updated_by: null,
		extraction_summary: 'Detected words summary',
		extraction_metadata: {},
		created_by: 'user-1',
		created_at: '2026-06-22T00:00:00Z',
		updated_at: '2026-06-22T00:00:00Z',
		deleted_at: null,
		...overrides
	} as OntologyImageAsset;
}

function createHarness(overrides: Partial<AttachmentControllerDeps> = {}) {
	const state: {
		isBrowser: boolean;
		projectId: string | null;
		messages: UIMessage[];
		nextId: number;
		nextPreview: number;
	} = {
		isBrowser: true,
		projectId: 'project-1',
		messages: [],
		nextId: 0,
		nextPreview: 0
	};
	const fetchImpl = vi.fn();
	const uploadFileToSignedStorageUrl = vi.fn().mockResolvedValue(undefined);
	const toastError = vi.fn();
	const logWarn = vi.fn();
	const revokeObjectUrl = vi.fn();
	const computeSha256 = vi.fn().mockResolvedValue('checksum-1');
	const readImageDimensions = vi.fn().mockResolvedValue({ width: 800, height: 600 });

	const controller = createAttachmentController({
		getBrowser: () => state.isBrowser,
		getProjectId: () => state.projectId,
		getMessages: () => state.messages,
		setMessages: (updater) => {
			state.messages = updater(state.messages);
		},
		toastError,
		logWarn,
		fetchImpl: fetchImpl as unknown as typeof fetch,
		uploadFileToSignedStorageUrl,
		createObjectUrl: (file) => `blob:${file.name}:${++state.nextPreview}`,
		revokeObjectUrl,
		randomUUID: () => `attachment-${++state.nextId}`,
		computeSha256,
		readImageDimensions,
		...overrides
	});

	return {
		controller,
		state,
		fetchImpl,
		uploadFileToSignedStorageUrl,
		toastError,
		logWarn,
		revokeObjectUrl,
		computeSha256,
		readImageDimensions
	};
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('attachment helpers', () => {
	it('describes and polls OCR statuses consistently', () => {
		expect(shouldPollOcrStatus('pending')).toBe(true);
		expect(shouldPollOcrStatus('processing')).toBe(true);
		expect(shouldPollOcrStatus('complete')).toBe(false);
		expect(shouldPollOcrStatus('failed')).toBe(false);
		expect(describeAttachmentOcrStatus('complete')).toBe('OCR ready');
		expect(describeAttachmentOcrStatus('processing')).toBe('Extracting text...');
		expect(describeAttachmentOcrStatus('unknown')).toBe('OCR queued');
	});

	it('detects duplicate checksums excluding the current attachment', () => {
		const attachments = [
			makeAttachment({ id: 'a', checksumSha256: 'same' }),
			makeAttachment({ id: 'b', checksumSha256: 'other' })
		];
		expect(hasDuplicateAttachmentChecksum(attachments, 'c', 'same')).toBe(true);
		expect(hasDuplicateAttachmentChecksum(attachments, 'a', 'same')).toBe(false);
	});

	it('converts ready onto and temporary attachments into stream refs', () => {
		const ontoRef = imageAttachmentToRef(makeAttachment(), 0, {
			includePreviewUrl: true,
			projectId: 'fallback-project'
		});
		expect(ontoRef).toMatchObject({
			attachment_kind: 'onto_asset',
			media_type: 'image',
			asset_id: 'asset-1',
			project_id: 'project-1',
			display_order: 0,
			metadata: { preview_url: '/api/onto/assets/asset-1/render?width=160' }
		});

		const tempRef = imageAttachmentToRef(
			makeAttachment({
				attachmentKind: 'temporary_file',
				projectId: null,
				assetId: 'temp-1',
				storagePath: 'users/user-1/chat-temp/temp-1/original.png',
				ocrStatus: 'skipped'
			}),
			1,
			{ includePreviewUrl: true }
		);
		expect(tempRef).toMatchObject({
			attachment_kind: 'temporary_file',
			temporary_attachment_id: 'temp-1',
			project_id: null,
			metadata: { preview_url: 'blob:screenshot' }
		});
	});
});

describe('AttachmentController — draft validation and refs', () => {
	it('ignores file handling outside the browser', () => {
		const h = createHarness();
		h.state.isBrowser = false;
		h.controller.handleFiles([makeFile()]);
		expect(h.controller.imageAttachments).toEqual([]);
		expect(h.fetchImpl).not.toHaveBeenCalled();
	});

	it('reports unsupported files and keeps the original selected file list filtering in the controller', () => {
		const h = createHarness();
		const pdf = makeFile('brief.pdf', 'application/pdf');
		h.controller.handleFiles([pdf]);
		expect(h.toastError).toHaveBeenCalledWith('Drop an image file to attach it.');
		expect(h.controller.imageAttachments).toEqual([]);
	});

	it('adds image files up to the attachment limit and reports skipped unsupported files', () => {
		const h = createHarness();
		h.fetchImpl.mockResolvedValue(
			jsonResponse({
				data: {
					asset: {
						id: 'asset-1',
						project_id: null,
						kind: 'temporary_file',
						storage_bucket: 'onto-assets',
						storage_path: 'users/user-1/chat-temp/asset-1/original.png',
						ocr_status: 'skipped',
						expires_at: '2026-06-23T00:00:00Z'
					},
					upload: { signed_url: 'https://upload.local', path: 'path', token: 'token' }
				}
			})
		);

		h.controller.handleFiles([makeFile('a.png'), makeFile('notes.txt', 'text/plain')]);

		expect(h.toastError).toHaveBeenCalledWith(
			'Only image files can be attached here; unsupported files were skipped.'
		);
		expect(h.controller.imageAttachments).toHaveLength(1);
		expect(h.controller.imageAttachments[0]).toMatchObject({
			id: 'attachment-1',
			fileName: 'a.png',
			previewUrl: 'blob:a.png:1',
			status: 'hashing'
		});
	});

	it('rejects files above the 25MB limit', () => {
		const h = createHarness();
		const huge = makeFile('huge.png', 'image/png', 25 * 1024 * 1024 + 1);
		h.controller.handleFiles([huge]);
		expect(h.toastError).toHaveBeenCalledWith('huge.png exceeds the 25MB limit.');
		expect(h.controller.imageAttachments).toEqual([]);
	});

	it('attaches existing project images and rejects duplicate assets', () => {
		const h = createHarness();
		const attached = h.controller.attachExistingImage(makeAsset({ ocr_status: 'pending' }));
		expect(attached).toBe(true);
		expect(h.controller.imageAttachments[0]).toMatchObject({
			id: 'attachment-1',
			assetId: 'asset-1',
			status: 'ready',
			statusLabel: 'OCR queued',
			previewUrl: '/api/onto/assets/asset-1/render?width=160'
		});

		const duplicate = h.controller.attachExistingImage(makeAsset());
		expect(duplicate).toBe(false);
		expect(h.toastError).toHaveBeenCalledWith('This image is already attached to the draft.');
		expect(h.controller.imageAttachments).toHaveLength(1);
	});

	it('enforces the attachment limit for existing images', () => {
		const h = createHarness();
		h.controller.imageAttachments = Array.from(
			{ length: AGENT_CHAT_MAX_IMAGE_ATTACHMENTS },
			(_, index) => makeAttachment({ id: `attachment-${index}`, assetId: `asset-${index}` })
		);
		expect(h.controller.attachExistingImage(makeAsset({ id: 'extra-asset' }))).toBe(false);
		expect(h.toastError).toHaveBeenCalledWith(
			`Attach up to ${AGENT_CHAT_MAX_IMAGE_ATTACHMENTS} images per message.`
		);
	});

	it('builds ready refs and excludes pending or failed attachments', () => {
		const h = createHarness();
		h.controller.imageAttachments = [
			makeAttachment({ id: 'ready', status: 'ready', assetId: 'asset-ready' }),
			makeAttachment({ id: 'deduped', status: 'deduped', assetId: 'asset-deduped' }),
			makeAttachment({ id: 'uploading', status: 'uploading', assetId: 'asset-uploading' }),
			makeAttachment({ id: 'error', status: 'error', assetId: 'asset-error' })
		];

		const refs = h.controller.buildReadyRefs(false);
		expect(refs.map((ref) => ref.asset_id)).toEqual(['asset-ready', 'asset-deduped']);
		expect(refs.every((ref) => ref.metadata === null)).toBe(true);

		const optimisticRefs = h.controller.buildReadyRefs(true);
		expect(optimisticRefs[0]?.metadata).toEqual({
			preview_url: '/api/onto/assets/asset-ready/render?width=160'
		});
	});

	it('revokes local preview URLs on remove and cleanup, but not on clearDraft/restoreDraft', () => {
		const h = createHarness();
		h.fetchImpl.mockResolvedValue(
			jsonResponse({
				data: {
					asset: {
						id: 'temp-1',
						project_id: null,
						kind: 'temporary_file',
						storage_bucket: 'onto-assets',
						storage_path: 'users/user-1/chat-temp/temp-1/original.png',
						ocr_status: 'skipped'
					},
					upload: { signed_url: 'https://upload.local', path: 'path', token: 'token' }
				}
			})
		);
		h.controller.handleFiles([makeFile('first.png')]);
		const snapshot = h.controller.imageAttachments;

		h.controller.clearDraft();
		expect(h.revokeObjectUrl).not.toHaveBeenCalled();
		expect(h.controller.imageAttachments).toEqual([]);

		h.controller.restoreDraft(snapshot);
		h.controller.remove(snapshot[0]!.id);
		expect(h.revokeObjectUrl).toHaveBeenCalledWith('blob:first.png:1');
	});
});

describe('AttachmentController — upload lifecycle', () => {
	it('uploads temporary images and marks them ready without OCR polling', async () => {
		const h = createHarness();
		h.state.projectId = null;
		h.fetchImpl.mockResolvedValueOnce(
			jsonResponse({
				data: {
					asset: {
						id: 'temp-asset',
						project_id: null,
						kind: 'temporary_file',
						storage_bucket: 'onto-assets',
						storage_path: 'users/user-1/chat-temp/temp-asset/original.png',
						ocr_status: 'skipped',
						expires_at: '2026-06-23T00:00:00Z'
					},
					upload: { signed_url: 'https://upload.local', path: 'path', token: 'token' }
				}
			})
		);

		h.controller.handleFiles([makeFile('temp.png')]);

		await vi.waitFor(() => {
			expect(h.controller.imageAttachments[0]?.status).toBe('ready');
		});
		expect(h.uploadFileToSignedStorageUrl).toHaveBeenCalledTimes(1);
		expect(h.controller.imageAttachments[0]).toMatchObject({
			attachmentKind: 'temporary_file',
			assetId: 'temp-asset',
			projectId: null,
			storagePath: 'users/user-1/chat-temp/temp-asset/original.png',
			ocrStatus: 'skipped'
		});
		const refs = h.controller.buildReadyRefs(true);
		expect(refs[0]).toMatchObject({
			attachment_kind: 'temporary_file',
			temporary_attachment_id: 'temp-asset',
			metadata: { preview_url: 'blob:temp.png:1' }
		});
	});

	it('queues OCR for uploaded project images and applies the completed asset snapshot', async () => {
		const h = createHarness();
		h.fetchImpl
			.mockResolvedValueOnce(
				jsonResponse({
					data: {
						asset: {
							id: 'asset-uploaded',
							project_id: 'project-1',
							kind: 'image',
							storage_bucket: 'onto-assets',
							storage_path: 'projects/project-1/assets/asset-uploaded/original.png',
							ocr_status: 'pending'
						},
						upload: {
							signed_url: 'https://upload.local',
							path: 'projects/project-1/assets/asset-uploaded/original.png',
							token: 'token'
						}
					}
				})
			)
			.mockResolvedValueOnce(
				jsonResponse({
					data: {
						asset: {
							id: 'asset-uploaded',
							project_id: 'project-1',
							storage_bucket: 'onto-assets',
							storage_path: 'projects/project-1/assets/asset-uploaded/original.png',
							ocr_status: 'complete',
							extraction_summary: 'Summary text',
							extracted_text: 'Full extracted text'
						}
					}
				})
			);

		h.controller.handleFiles([makeFile('project.png')]);

		await vi.waitFor(() => {
			expect(h.controller.imageAttachments[0]?.statusLabel).toBe('OCR ready');
		});
		expect(h.fetchImpl).toHaveBeenNthCalledWith(2, '/api/onto/assets/asset-uploaded/complete', {
			method: 'POST'
		});
		expect(h.controller.imageAttachments[0]).toMatchObject({
			status: 'ready',
			attachmentKind: 'onto_asset',
			assetId: 'asset-uploaded',
			extractionSummary: 'Summary text',
			extractedTextPreview: 'Full extracted text'
		});
	});

	it('dedupes against another draft checksum before creating a server attachment', async () => {
		const h = createHarness();
		h.computeSha256.mockResolvedValue('same-checksum');
		h.controller.imageAttachments = [
			makeAttachment({ id: 'existing', checksumSha256: 'same-checksum' })
		];

		h.controller.handleFiles([makeFile('duplicate.png')]);

		await vi.waitFor(() => {
			expect(
				h.controller.imageAttachments.find((item) => item.id === 'attachment-1')?.status
			).toBe('error');
		});
		expect(h.fetchImpl).not.toHaveBeenCalled();
		expect(
			h.controller.imageAttachments.find((item) => item.id === 'attachment-1')
		).toMatchObject({
			statusLabel: 'Duplicate image',
			error: 'This image is already attached to the draft.',
			checksumSha256: 'same-checksum'
		});
	});

	it('surfaces upload creation failures on the attachment and through toast', async () => {
		const h = createHarness();
		h.fetchImpl.mockResolvedValueOnce(jsonResponse({ error: 'Quota exceeded' }, false));

		h.controller.handleFiles([makeFile('quota.png')]);

		await vi.waitFor(() => {
			expect(h.controller.imageAttachments[0]?.status).toBe('error');
		});
		expect(h.controller.imageAttachments[0]).toMatchObject({
			statusLabel: 'Upload failed',
			error: 'Quota exceeded'
		});
		expect(h.toastError).toHaveBeenCalledWith('Quota exceeded');
	});
});

describe('AttachmentController — OCR polling', () => {
	it('polls draft attachments and updates matching optimistic message attachments', async () => {
		vi.useFakeTimers();
		const h = createHarness();
		h.state.messages = [
			{
				id: 'message-1',
				type: 'user',
				role: 'user',
				content: 'Attached 1 image',
				timestamp: new Date(),
				attachments: [
					{
						attachment_kind: 'onto_asset',
						media_type: 'image',
						asset_id: 'asset-1',
						project_id: 'project-1',
						ocr_status: 'pending',
						metadata: null
					} satisfies ChatAttachmentRef
				]
			} as UIMessage
		];
		h.fetchImpl.mockResolvedValue(
			jsonResponse({
				data: {
					asset: {
						id: 'asset-1',
						original_filename: 'updated.png',
						content_type: 'image/png',
						file_size_bytes: 2048,
						width: 640,
						height: 480,
						checksum_sha256: 'updated-checksum',
						ocr_status: 'complete',
						extraction_summary: 'OCR done',
						extracted_text: 'OCR done with full text'
					}
				}
			})
		);

		h.controller.attachExistingImage(makeAsset({ id: 'asset-1', ocr_status: 'pending' }));

		await vi.advanceTimersByTimeAsync(AGENT_CHAT_OCR_POLL_INITIAL_DELAY_MS);

		expect(h.controller.imageAttachments[0]).toMatchObject({
			statusLabel: 'OCR ready',
			ocrStatus: 'complete',
			extractionSummary: 'OCR done',
			extractedTextPreview: 'OCR done with full text'
		});
		expect(h.state.messages[0]?.attachments?.[0]).toMatchObject({
			file_name: 'updated.png',
			ocr_status: 'complete',
			extraction_summary: 'OCR done',
			extracted_text_preview: 'OCR done with full text',
			metadata: { preview_url: '/api/onto/assets/asset-1/render?width=160' }
		});
	});

	it('polls persisted message attachments independently of draft state', async () => {
		vi.useFakeTimers();
		const h = createHarness();
		h.state.messages = [
			{
				id: 'message-1',
				type: 'user',
				role: 'user',
				content: 'Attached 1 image',
				timestamp: new Date(),
				attachments: [
					{
						attachment_kind: 'onto_asset',
						media_type: 'image',
						asset_id: 'asset-1',
						project_id: 'project-1',
						ocr_status: 'pending',
						metadata: null
					} satisfies ChatAttachmentRef
				]
			} as UIMessage
		];
		h.fetchImpl.mockResolvedValue(
			jsonResponse({
				data: {
					asset: {
						id: 'asset-1',
						ocr_status: 'complete',
						extraction_summary: 'Ready',
						extracted_text: 'Ready full text'
					}
				}
			})
		);

		h.controller.scheduleMessageOcrPoll('message-1', 'asset-1', 'pending');

		await vi.advanceTimersByTimeAsync(AGENT_CHAT_OCR_POLL_INITIAL_DELAY_MS);

		expect(h.state.messages[0]?.attachments?.[0]).toMatchObject({
			ocr_status: 'complete',
			extraction_summary: 'Ready',
			extracted_text_preview: 'Ready full text'
		});
	});

	it('cleanup clears pending OCR timers and revokes tracked preview URLs', async () => {
		vi.useFakeTimers();
		const h = createHarness();
		h.fetchImpl.mockResolvedValue(jsonResponse({ data: { asset: { id: 'asset-1' } } }));
		h.controller.attachExistingImage(makeAsset({ id: 'asset-1', ocr_status: 'pending' }));
		h.controller.handleFiles([makeFile('local.png')]);

		h.controller.cleanup();
		await vi.advanceTimersByTimeAsync(AGENT_CHAT_OCR_POLL_INITIAL_DELAY_MS);

		expect(h.fetchImpl).not.toHaveBeenCalled();
		expect(h.revokeObjectUrl).toHaveBeenCalledWith('blob:local.png:1');
		expect(h.controller.imageAttachments).toEqual([]);
	});

	it('cleanup invalidates OCR polls that are already in flight', async () => {
		vi.useFakeTimers();
		const h = createHarness();
		h.state.messages = [
			{
				id: 'message-1',
				type: 'user',
				role: 'user',
				content: 'Attached 1 image',
				timestamp: new Date(),
				attachments: [
					{
						attachment_kind: 'onto_asset',
						media_type: 'image',
						asset_id: 'asset-1',
						project_id: 'project-1',
						ocr_status: 'pending',
						metadata: null
					} satisfies ChatAttachmentRef
				]
			} as UIMessage
		];
		let resolveFetch: (response: Response) => void = () => {};
		h.fetchImpl.mockReturnValue(
			new Promise<Response>((resolve) => {
				resolveFetch = resolve;
			})
		);

		h.controller.scheduleMessageOcrPoll('message-1', 'asset-1', 'pending');
		await vi.advanceTimersByTimeAsync(AGENT_CHAT_OCR_POLL_INITIAL_DELAY_MS);
		expect(h.fetchImpl).toHaveBeenCalledTimes(1);

		h.controller.cleanup();
		resolveFetch(
			jsonResponse({
				data: {
					asset: {
						id: 'asset-1',
						ocr_status: 'complete',
						extraction_summary: 'Should not apply',
						extracted_text: 'Should not apply'
					}
				}
			})
		);
		await Promise.resolve();
		await Promise.resolve();

		const attachment = h.state.messages[0]?.attachments?.[0];
		expect(attachment?.ocr_status).toBe('pending');
		expect(attachment?.extraction_summary).toBeUndefined();
		expect(attachment?.extracted_text_preview).toBeUndefined();
	});
});
