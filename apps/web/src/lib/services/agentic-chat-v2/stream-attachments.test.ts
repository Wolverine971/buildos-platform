// apps/web/src/lib/services/agentic-chat-v2/stream-attachments.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatAttachmentRef } from '@buildos/shared-types';
import {
	createLiveVisionSignedImages,
	loadValidatedChatAttachments,
	resolveChatAttachmentProjectId
} from './stream-attachments';
import type { ChatAttachmentAssetRow } from './attachments';

type Row = Record<string, any>;

function createInsertSupabaseMock() {
	const insertedRows: Record<string, Row[]> = {};

	return {
		insertedRows,
		from: vi.fn((table: string) => ({
			insert: vi.fn(async (value: Row | Row[]) => {
				const values = Array.isArray(value) ? value : [value];
				insertedRows[table] ??= [];
				insertedRows[table].push(...values.map((row) => ({ ...row })));
				return { data: values, error: null };
			})
		}))
	};
}

function temporaryAttachment(overrides: Partial<ChatAttachmentRef> = {}): ChatAttachmentRef {
	return {
		attachment_kind: 'temporary_file',
		media_type: 'image',
		temporary_attachment_id: 'temp-1',
		storage_bucket: 'onto-assets',
		storage_path: 'users/user-1/chat-temp/temp-1/image.png',
		file_name: 'image.png',
		content_type: 'image/png',
		file_size_bytes: 1024,
		width: 640,
		height: 480,
		...overrides
	};
}

function imageAsset(overrides: Partial<ChatAttachmentAssetRow> = {}): ChatAttachmentAssetRow {
	return {
		id: 'asset-1',
		project_id: 'project-1',
		storage_bucket: 'onto-assets',
		storage_path: 'projects/project-1/asset-1.png',
		original_filename: 'asset-1.png',
		content_type: 'image/png',
		file_size_bytes: 1024,
		width: 640,
		height: 480,
		checksum_sha256: 'checksum',
		ocr_status: 'complete',
		extraction_summary: null,
		extracted_text: null,
		...overrides
	};
}

describe('stream attachment helpers', () => {
	it('resolves project scope for attachment validation', () => {
		expect(
			resolveChatAttachmentProjectId('project', {
				entity_id: 'project-1',
				projectFocus: null
			})
		).toBe('project-1');
		expect(
			resolveChatAttachmentProjectId('global', {
				entity_id: 'project-1',
				projectFocus: null
			})
		).toBeNull();
	});

	it('rejects project image attachments outside project chat context', async () => {
		const result = await loadValidatedChatAttachments({
			supabase: {} as any,
			userId: 'user-1',
			projectId: null,
			attachments: [
				{
					attachment_kind: 'onto_asset',
					media_type: 'image',
					asset_id: 'asset-1'
				}
			],
			endpoint: '/api/agent/v2/stream',
			httpMethod: 'POST',
			maxExtractedTextChars: 2000,
			tempAttachmentPathPrefix: 'users',
			storageBucket: 'onto-assets',
			maxTempImageBytes: 1024 * 1024
		});

		expect('error' in result).toBe(true);
		if ('error' in result) {
			expect(result.error.status).toBe(400);
		}
	});

	it('validates temporary image uploads against the expected storage path', async () => {
		const list = vi.fn(async () => ({ data: [{ name: 'image.png' }], error: null }));
		const admin = {
			storage: {
				from: vi.fn(() => ({ list }))
			}
		};

		const result = await loadValidatedChatAttachments({
			supabase: {} as any,
			userId: 'user-1',
			projectId: null,
			attachments: [temporaryAttachment()],
			endpoint: '/api/agent/v2/stream',
			httpMethod: 'POST',
			maxExtractedTextChars: 2000,
			tempAttachmentPathPrefix: 'users',
			storageBucket: 'onto-assets',
			maxTempImageBytes: 1024 * 1024,
			createAdminClient: () => admin as any
		});

		expect('error' in result).toBe(false);
		if ('error' in result) return;
		expect(admin.storage.from).toHaveBeenCalledWith('onto-assets');
		expect(list).toHaveBeenCalledWith('users/user-1/chat-temp/temp-1', {
			limit: 1,
			search: 'image.png'
		});
		expect(result.assets).toEqual([
			expect.objectContaining({
				id: 'temp-1',
				project_id: null,
				storage_path: 'users/user-1/chat-temp/temp-1/image.png',
				ocr_status: 'skipped'
			})
		]);
		expect(result.attachments).toEqual([
			expect.objectContaining({
				temporary_attachment_id: 'temp-1',
				role: 'analysis_target',
				display_order: 0
			})
		]);
	});

	it('creates live-vision signed URLs and records media events', async () => {
		const supabase = createInsertSupabaseMock();
		const createSignedUrl = vi.fn(async () => ({
			data: { signedUrl: 'https://signed.example/asset-1.png' },
			error: null
		}));
		const admin = {
			storage: {
				from: vi.fn(() => ({ createSignedUrl }))
			}
		};

		const result = await createLiveVisionSignedImages({
			supabase: supabase as any,
			userId: 'user-1',
			projectId: 'project-1',
			sessionId: 'session-1',
			assets: [
				imageAsset({ id: 'asset-1' }),
				imageAsset({ id: 'asset-2', storage_path: 'projects/project-1/asset-2.png' }),
				imageAsset({ id: 'asset-3', file_size_bytes: 5_000 })
			],
			maxImages: 1,
			maxImageBytes: 2_000,
			renderWidth: 1600,
			ttlSeconds: 900,
			createAdminClient: () => admin as any,
			logger: { warn: vi.fn() }
		});

		expect(result).toEqual({
			images: [{ assetId: 'asset-1', signedUrl: 'https://signed.example/asset-1.png' }],
			failedAssetIds: ['asset-3'],
			skippedByLimit: 1
		});
		expect(createSignedUrl).toHaveBeenCalledWith('projects/project-1/asset-1.png', 900, {
			transform: { width: 1600 }
		});
		expect(supabase.insertedRows.agent_chat_media_events).toEqual([
			expect.objectContaining({
				asset_id: 'asset-3',
				event_type: 'live_vision_failed',
				metadata: expect.objectContaining({ reason: 'file_too_large' })
			}),
			expect.objectContaining({
				asset_id: 'asset-1',
				event_type: 'live_vision_requested',
				metadata: expect.objectContaining({
					ttl_seconds: 900,
					mode: 'current_turn_visual_reasoning'
				})
			})
		]);
	});
});
