// apps/mobile/tests/chat-images.test.ts
import type { ChatImageAttachmentAsset } from '@buildos/api-client';
import { describe, expect, it } from 'vitest';

import {
	acceptPicks,
	attachedLine,
	type DraftImage,
	draftState,
	imageFileName,
	isAttachmentOnly,
	MAX_IMAGE_BYTES,
	messageImages,
	type PickedImage,
	signedTarget,
	toHex,
	turnAttachment
} from '@/lib/chat/images';

const pick = (over: Partial<PickedImage> = {}): PickedImage => ({
	uri: 'file:///photo.jpg',
	width: 1200,
	height: 900,
	fileName: 'IMG_1.jpg',
	mimeType: 'image/jpeg',
	fileSize: 400_000,
	...over
});

const asset = (over: Partial<ChatImageAttachmentAsset> = {}): ChatImageAttachmentAsset => ({
	id: 'a1',
	project_id: null,
	kind: 'temporary_file',
	storage_bucket: 'onto-assets',
	storage_path: 'temp/u1/a1.jpg',
	original_filename: 'IMG_1.jpg',
	content_type: 'image/jpeg',
	file_size_bytes: 400_000,
	width: 1200,
	height: 900,
	checksum_sha256: 'ab'.repeat(32),
	ocr_status: 'skipped',
	extraction_summary: null,
	expires_at: '2026-11-14T12:00:00.000Z',
	...over
});

describe('picking images', () => {
	it('takes up to four, with the website’s words for the rest', () => {
		expect(acceptPicks(3, [pick(), pick()])).toEqual({
			accepted: [pick()],
			error: 'Attach up to 4 images per message.'
		});
		expect(
			acceptPicks(0, [pick({ fileSize: MAX_IMAGE_BYTES + 1, fileName: 'big.png' })])
		).toEqual({
			accepted: [],
			error: 'big.png exceeds the 25MB limit.'
		});
		expect(acceptPicks(0, [pick({ mimeType: 'video/mp4' })]).error).toBe(
			'Only images can be attached.'
		);
	});

	it('names an unnamed photo from its type', () => {
		expect(imageFileName(pick({ fileName: null, mimeType: 'image/jpeg' }), 1)).toBe(
			'photo-2.jpg'
		);
		expect(imageFileName(pick({ fileName: null, mimeType: 'image/png' }), 0)).toBe(
			'photo-1.png'
		);
	});

	it('holds Send while an image uploads or after one fails', () => {
		const image = (status: DraftImage['status']): DraftImage => ({
			...pick(),
			id: status,
			status,
			error: null,
			attachment: null
		});
		expect(draftState([])).toBe('empty');
		expect(draftState([image('ready'), image('uploading')])).toBe('uploading');
		expect(draftState([image('ready'), image('failed')])).toBe('failed');
		expect(draftState([image('ready')])).toBe('ready');
	});
});

describe('uploading', () => {
	it('hashes to lowercase hex', () => {
		expect(toHex(new Uint8Array([0, 15, 255]).buffer)).toBe('000fff');
	});

	it('reads the signed target, from the URL when the response leaves path or token out', () => {
		expect(
			signedTarget(
				{ signed_url: 'https://x/storage', path: 'p/a.jpg', token: 't' },
				'onto-assets'
			)
		).toEqual({ path: 'p/a.jpg', token: 't' });
		expect(
			signedTarget(
				{
					signed_url:
						'https://x.supabase.co/storage/v1/object/upload/sign/onto-assets/temp/u1/a1.jpg?token=tok',
					path: '',
					token: null
				},
				'onto-assets'
			)
		).toEqual({ path: 'temp/u1/a1.jpg', token: 'tok' });
	});

	it('sends a Workspace image as a temporary file and a project image as its asset', () => {
		expect(turnAttachment(asset(), pick(), 0)).toMatchObject({
			attachmentKind: 'temporary_file',
			temporaryAttachmentId: 'a1',
			storagePath: 'temp/u1/a1.jpg',
			fileSizeBytes: 400_000,
			displayOrder: 0
		});
		expect(turnAttachment(asset({ project_id: 'p1', kind: 'image' }), pick(), 2)).toEqual({
			attachmentKind: 'onto_asset',
			mediaType: 'image',
			assetId: 'a1',
			projectId: 'p1',
			displayOrder: 2
		});
	});
});

describe('sent images', () => {
	it('reads stored previews, and placeholders for expired temporary files', () => {
		expect(
			messageImages({
				id: 'm1',
				attachments: [
					{
						attachment_kind: 'onto_asset',
						asset_id: 'a1',
						file_name: 'IMG_1.jpg',
						metadata: { preview_url: '/api/onto/assets/a1/render?width=160' }
					},
					{
						attachment_kind: 'temporary_file',
						temporary_attachment_id: 't1',
						metadata: {}
					}
				]
			})
		).toEqual([
			{
				key: 'a1',
				uri: '/api/onto/assets/a1/render?width=160',
				remote: true,
				fileName: 'IMG_1.jpg'
			},
			{ key: 't1', uri: null, remote: false, fileName: null }
		]);
		expect(isAttachmentOnly({ attachment_only: true })).toBe(true);
		expect(attachedLine(1)).toBe('Attached 1 image');
		expect(attachedLine(3)).toBe('Attached 3 images');
	});
});
