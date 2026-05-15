// apps/web/src/lib/services/agentic-chat-v2/attachments.test.ts
import { describe, expect, it } from 'vitest';
import {
	appendAttachmentContextToMessage,
	assessLiveVisionImageEligibility,
	buildLiveVisionContentParts,
	evaluateChatAttachmentUploadQuota,
	normalizeChatAttachmentRefs,
	sanitizeAttachmentRefsForMetadata,
	shouldUseLiveVisionForTurn
} from './attachments';
import type { ChatAttachmentRef } from '@buildos/shared-types';

const imageAttachment: ChatAttachmentRef = {
	attachment_kind: 'onto_asset',
	media_type: 'image',
	asset_id: 'asset-1',
	project_id: 'project-1',
	file_name: 'screenshot.png',
	ocr_status: 'complete',
	extracted_text_preview: 'Visible OCR text'
};

describe('agentic chat attachments', () => {
	it('enables live vision only for attached-image turns with visual intent', () => {
		expect(
			shouldUseLiveVisionForTurn({
				message: '',
				attachmentCount: 1,
				liveVisionEnabled: true
			})
		).toBe(true);
		expect(
			shouldUseLiveVisionForTurn({
				message: 'Inspect this screenshot and tell me what changed.',
				attachmentCount: 1,
				liveVisionEnabled: true
			})
		).toBe(true);
		expect(
			shouldUseLiveVisionForTurn({
				message: 'Turn this into tasks.',
				attachmentCount: 1,
				liveVisionEnabled: true
			})
		).toBe(true);
		expect(
			shouldUseLiveVisionForTurn({
				message: 'Store this as context for later.',
				attachmentCount: 1,
				liveVisionEnabled: true
			})
		).toBe(false);
		expect(
			shouldUseLiveVisionForTurn({
				message: 'Inspect this screenshot.',
				attachmentCount: 1,
				liveVisionEnabled: false
			})
		).toBe(false);
	});

	it('marks attachment context accurately when raw image input is included', () => {
		const text = appendAttachmentContextToMessage('Analyze this.', [imageAttachment], {
			rawMediaPassedToModel: true
		});

		expect(text).toContain('Analyze this.');
		expect(text).toContain(
			'eligible for attachment metadata/OCR plus ephemeral raw image input'
		);
		expect(text).toContain('untrusted user-provided source material');
		expect(text).toContain('Visible OCR text');
		expect(text).not.toContain('raw image pixels are not passed');
	});

	it('builds provider content parts without altering the durable text payload', () => {
		const content = buildLiveVisionContentParts({
			text: 'Analyze this image with OCR context.',
			images: [{ assetId: 'asset-1', signedUrl: 'https://signed.example/image.png' }]
		});

		expect(content).toEqual([
			{ type: 'text', text: 'Analyze this image with OCR context.' },
			{
				type: 'image_url',
				image_url: { url: 'https://signed.example/image.png', detail: 'auto' }
			}
		]);
	});

	it('normalizes temporary image attachments without exposing storage paths in snapshots', () => {
		const result = normalizeChatAttachmentRefs([
			{
				attachment_kind: 'temporary_file',
				media_type: 'image',
				temporary_attachment_id: 'temp-1',
				storage_bucket: 'onto-assets',
				storage_path: 'users/user-1/chat-temp/temp-1/original.png',
				file_name: 'floating.png',
				content_type: 'image/png',
				file_size_bytes: 1024
			}
		]);

		expect(result.rejected).toBe(0);
		expect(result.attachments[0]).toMatchObject({
			attachment_kind: 'temporary_file',
			temporary_attachment_id: 'temp-1',
			storage_bucket: 'onto-assets',
			storage_path: 'users/user-1/chat-temp/temp-1/original.png',
			ocr_status: 'skipped'
		});

		expect(sanitizeAttachmentRefsForMetadata(result.attachments)[0]).toMatchObject({
			attachment_kind: 'temporary_file',
			temporary_attachment_id: 'temp-1',
			storage_bucket: 'onto-assets'
		});
		expect(JSON.stringify(sanitizeAttachmentRefsForMetadata(result.attachments))).not.toContain(
			'storage_path'
		);
	});

	it('gates live vision images by storage pointer, MIME type, and byte cap', () => {
		expect(
			assessLiveVisionImageEligibility(
				{
					content_type: 'image/png',
					file_size_bytes: 1024,
					storage_bucket: 'onto-assets',
					storage_path: 'projects/p/assets/a/original.png'
				},
				{ maxBytes: 2048 }
			)
		).toEqual({ eligible: true });
		expect(
			assessLiveVisionImageEligibility(
				{
					content_type: 'application/pdf',
					file_size_bytes: 1024,
					storage_bucket: 'onto-assets',
					storage_path: 'projects/p/assets/a/original.pdf'
				},
				{ maxBytes: 2048 }
			)
		).toEqual({ eligible: false, reason: 'unsupported_content_type' });
		expect(
			assessLiveVisionImageEligibility(
				{
					content_type: 'image/png',
					file_size_bytes: 4096,
					storage_bucket: 'onto-assets',
					storage_path: 'projects/p/assets/a/original.png'
				},
				{ maxBytes: 2048 }
			)
		).toEqual({ eligible: false, reason: 'file_too_large' });
		expect(
			assessLiveVisionImageEligibility(
				{
					content_type: 'image/png',
					file_size_bytes: 1024,
					storage_bucket: null,
					storage_path: null
				},
				{ maxBytes: 2048 }
			)
		).toEqual({ eligible: false, reason: 'missing_storage_pointer' });
	});

	it('rejects new uploads when rate, byte, or project storage caps would be exceeded', () => {
		const caps = {
			max_image_attachments_per_turn: 4,
			max_file_size_bytes: 10_000,
			upload_window_seconds: 86_400,
			max_uploads_per_window: 2,
			max_upload_bytes_per_window: 12_000,
			project_storage_cap_bytes: 20_000
		};

		expect(
			evaluateChatAttachmentUploadQuota({
				caps,
				usage: { uploadCount: 1, uploadBytes: 4_000, projectStorageBytes: 8_000 },
				incomingBytes: 2_000
			})
		).toEqual({ allowed: true });
		expect(
			evaluateChatAttachmentUploadQuota({
				caps,
				usage: { uploadCount: 2, uploadBytes: 4_000, projectStorageBytes: 8_000 },
				incomingBytes: 2_000
			})
		).toMatchObject({ allowed: false, reason: 'upload_count_limit' });
		expect(
			evaluateChatAttachmentUploadQuota({
				caps: { ...caps, max_uploads_per_window: 10 },
				usage: { uploadCount: 1, uploadBytes: 11_000, projectStorageBytes: 8_000 },
				incomingBytes: 2_000
			})
		).toMatchObject({ allowed: false, reason: 'upload_bytes_limit' });
		expect(
			evaluateChatAttachmentUploadQuota({
				caps: {
					...caps,
					max_uploads_per_window: 10,
					max_upload_bytes_per_window: 100_000
				},
				usage: { uploadCount: 1, uploadBytes: 4_000, projectStorageBytes: 19_000 },
				incomingBytes: 2_000
			})
		).toMatchObject({ allowed: false, reason: 'project_storage_limit' });
	});
});
