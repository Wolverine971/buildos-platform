// apps/web/src/routes/api/agent/chat-attachments/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	list: vi.fn(),
	createSignedUploadUrl: vi.fn()
}));

vi.mock('../../onto/assets/shared', () => ({
	ensureProjectAccess: vi.fn(async () => ({ actorId: 'actor-1' })),
	getFileExtension: vi.fn(() => 'png')
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: vi.fn(() => ({
		storage: {
			from: vi.fn(() => ({
				list: mocks.list,
				createSignedUploadUrl: mocks.createSignedUploadUrl
			}))
		}
	}))
}));

import { POST } from './+server';

const PROJECT_ID = 'project-1';
const ASSET_ID = 'asset-1';
const CHECKSUM = 'a'.repeat(64);
const STORAGE_PATH = `projects/${PROJECT_ID}/assets/${ASSET_ID}/original.png`;

function existingAsset(ocrStatus: string) {
	return {
		id: ASSET_ID,
		project_id: PROJECT_ID,
		kind: 'image',
		storage_bucket: 'onto-assets',
		storage_path: STORAGE_PATH,
		original_filename: 'shot.png',
		content_type: 'image/png',
		file_size_bytes: 1024,
		width: null,
		height: null,
		checksum_sha256: CHECKSUM,
		ocr_status: ocrStatus,
		extraction_summary: null
	};
}

function createEvent(asset: ReturnType<typeof existingAsset>) {
	const assetQuery: any = {
		select: vi.fn(() => assetQuery),
		eq: vi.fn(() => assetQuery),
		is: vi.fn(() => assetQuery),
		maybeSingle: vi.fn(async () => ({ data: asset, error: null }))
	};
	const mediaEvents = { insert: vi.fn(async () => ({ error: null })) };
	return {
		mediaEvents,
		event: {
			request: new Request('http://localhost/api/agent/chat-attachments', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					project_id: PROJECT_ID,
					file_name: 'shot.png',
					content_type: 'image/png',
					file_size_bytes: 1024,
					checksum_sha256: CHECKSUM
				})
			}),
			locals: {
				safeGetSession: vi.fn(async () => ({ user: { id: 'user-1' } })),
				supabase: {
					from: vi.fn((table: string) =>
						table === 'onto_assets' ? assetQuery : mediaEvents
					)
				}
			}
		} as any
	};
}

describe('POST /api/agent/chat-attachments dedupe', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createSignedUploadUrl.mockResolvedValue({
			data: { signedUrl: 'https://upload.local', path: STORAGE_PATH, token: 'token' },
			error: null
		});
	});

	it('re-issues an upload when the deduped row never received its bytes', async () => {
		mocks.list.mockResolvedValue({ data: [], error: null });
		const { event, mediaEvents } = createEvent(existingAsset('pending'));

		const response = await POST(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(mocks.list).toHaveBeenCalledWith(`projects/${PROJECT_ID}/assets/${ASSET_ID}`, {
			limit: 1,
			search: 'original.png'
		});
		expect(mocks.createSignedUploadUrl).toHaveBeenCalledWith(STORAGE_PATH);
		expect(payload.data).toMatchObject({
			deduped: true,
			upload: { signed_url: 'https://upload.local', path: STORAGE_PATH, token: 'token' }
		});
		expect(mediaEvents.insert).toHaveBeenCalledWith(
			expect.objectContaining({ event_type: 'upload_requested' })
		);
	});

	it('keeps the plain dedupe answer when the object is already stored', async () => {
		mocks.list.mockResolvedValue({ data: [{ name: 'original.png' }], error: null });
		const { event } = createEvent(existingAsset('pending'));

		const payload = await (await POST(event)).json();

		expect(payload.data).toMatchObject({ deduped: true, upload: null });
		expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
	});

	it('skips the storage check for an asset whose OCR already completed', async () => {
		const { event } = createEvent(existingAsset('complete'));

		const payload = await (await POST(event)).json();

		expect(payload.data).toMatchObject({ deduped: true, upload: null });
		expect(mocks.list).not.toHaveBeenCalled();
	});

	it('never signs an upload outside the asset folder', async () => {
		mocks.list.mockResolvedValue({ data: [], error: null });
		const foreign = {
			...existingAsset('pending'),
			storage_path: 'projects/other-project/assets/x/original.png'
		};
		const { event } = createEvent(foreign);

		const payload = await (await POST(event)).json();

		expect(payload.data).toMatchObject({ deduped: true, upload: null });
		expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
	});
});
