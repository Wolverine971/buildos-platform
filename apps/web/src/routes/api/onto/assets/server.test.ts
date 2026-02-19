// apps/web/src/routes/api/onto/assets/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureProjectAccessMock, getFileExtensionMock, createAdminSupabaseClientMock } = vi.hoisted(
	() => ({
		ensureProjectAccessMock: vi.fn(),
		getFileExtensionMock: vi.fn(() => 'png'),
		createAdminSupabaseClientMock: vi.fn()
	})
);

vi.mock('./shared', () => ({
	ensureProjectAccess: ensureProjectAccessMock,
	getFileExtension: getFileExtensionMock,
	isEntityKind: vi.fn(() => true),
	parsePositiveInt: vi.fn((value: string | null, fallback: number) => {
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) return fallback;
		return Math.max(1, Math.floor(parsed));
	})
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

import { GET, POST } from './+server';

type AssetRow = {
	id: string;
	project_id: string;
	caption: string | null;
	alt_text: string | null;
	ocr_status: string;
	storage_bucket: string;
	storage_path: string;
};

function createListSupabase(assets: AssetRow[]) {
	const queryResult = {
		data: assets,
		error: null,
		count: assets.length
	};

	const queryBuilder: any = {
		select: vi.fn(() => queryBuilder),
		eq: vi.fn(() => queryBuilder),
		is: vi.fn(() => queryBuilder),
		order: vi.fn(() => queryBuilder),
		range: vi.fn(() => queryBuilder),
		in: vi.fn(() => queryBuilder),
		then: (onFulfilled: any, onRejected: any) =>
			Promise.resolve(queryResult).then(onFulfilled, onRejected)
	};

	return {
		from: vi.fn((table: string) => {
			if (table === 'onto_assets') return queryBuilder;
			throw new Error(`Unexpected table: ${table}`);
		})
	};
}

function createCreateSupabase(insertedAsset: AssetRow) {
	const insertSingle = vi.fn().mockResolvedValue({ data: insertedAsset, error: null });
	const insertSelectChain: any = {
		select: vi.fn(() => insertSelectChain),
		single: insertSingle
	};

	const deleteEq = vi.fn().mockResolvedValue({ data: null, error: null });

	const assetsTable = {
		insert: vi.fn(() => insertSelectChain),
		delete: vi.fn(() => ({ eq: deleteEq }))
	};

	return {
		from: vi.fn((table: string) => {
			if (table === 'onto_assets') return assetsTable;
			throw new Error(`Unexpected table: ${table}`);
		})
	};
}

function createSessionLocals(supabase: any, userId: string | null = 'user-1') {
	return {
		supabase,
		safeGetSession: vi.fn().mockResolvedValue(userId ? { user: { id: userId } } : null)
	};
}

describe('/api/onto/assets', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ensureProjectAccessMock.mockResolvedValue({ actorId: 'actor-1' });
	});

	it('GET returns 401 when unauthenticated', async () => {
		const response = await GET({
			url: new URL('http://localhost/api/onto/assets?project_id=project-1'),
			locals: createSessionLocals(createListSupabase([]), null)
		} as any);

		expect(response.status).toBe(401);
	});

	it('GET returns project assets for authorized users', async () => {
		const assets: AssetRow[] = [
			{
				id: 'asset-1',
				project_id: 'project-1',
				caption: 'Site photo',
				alt_text: 'Site',
				ocr_status: 'complete',
				storage_bucket: 'onto-assets',
				storage_path: 'projects/project-1/assets/asset-1/original.png'
			}
		];

		const response = await GET({
			url: new URL('http://localhost/api/onto/assets?project_id=project-1&limit=10'),
			locals: createSessionLocals(createListSupabase(assets))
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.assets).toHaveLength(1);
		expect(ensureProjectAccessMock).toHaveBeenCalledWith(
			expect.anything(),
			'project-1',
			'user-1',
			'read'
		);
	});

	it('POST creates an asset row and signed upload URL', async () => {
		const insertedAsset: AssetRow = {
			id: 'asset-created',
			project_id: 'project-1',
			caption: null,
			alt_text: null,
			ocr_status: 'pending',
			storage_bucket: 'onto-assets',
			storage_path: 'projects/project-1/assets/asset-created/original.png'
		};

		createAdminSupabaseClientMock.mockReturnValue({
			storage: {
				from: vi.fn(() => ({
					createSignedUploadUrl: vi.fn().mockResolvedValue({
						data: {
							signedUrl: 'https://storage.example/upload',
							path: insertedAsset.storage_path,
							token: 'upload-token'
						},
						error: null
					})
				}))
			}
		});

		const request = new Request('http://localhost/api/onto/assets', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				project_id: 'project-1',
				file_name: 'capture.png',
				content_type: 'image/png',
				file_size_bytes: 2048
			})
		});

		const response = await POST({
			request,
			locals: createSessionLocals(createCreateSupabase(insertedAsset))
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(201);
		expect(payload.success).toBe(true);
		expect(payload.data.asset.id).toBe('asset-created');
		expect(payload.data.upload.signed_url).toBe('https://storage.example/upload');
		expect(ensureProjectAccessMock).toHaveBeenCalledWith(
			expect.anything(),
			'project-1',
			'user-1',
			'write'
		);
	});

	it('POST returns access error when project write access is denied', async () => {
		ensureProjectAccessMock.mockResolvedValueOnce({
			error: new Response(JSON.stringify({ success: false }), { status: 403 })
		});

		const request = new Request('http://localhost/api/onto/assets', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				project_id: 'project-1',
				file_name: 'capture.png',
				content_type: 'image/png',
				file_size_bytes: 2048
			})
		});

		const response = await POST({
			request,
			locals: createSessionLocals(
				createCreateSupabase({
					id: 'asset-created',
					project_id: 'project-1',
					caption: null,
					alt_text: null,
					ocr_status: 'pending',
					storage_bucket: 'onto-assets',
					storage_path: 'projects/project-1/assets/asset-created/original.png'
				})
			)
		} as any);

		expect(response.status).toBe(403);
	});
});
