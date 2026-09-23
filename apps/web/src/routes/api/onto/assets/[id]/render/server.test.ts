// apps/web/src/routes/api/onto/assets/[id]/render/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	ensureAssetAccessMock,
	createAdminSupabaseClientMock,
	storageFromMock,
	createSignedUrlMock
} = vi.hoisted(() => ({
	ensureAssetAccessMock: vi.fn(),
	createAdminSupabaseClientMock: vi.fn(),
	storageFromMock: vi.fn(),
	createSignedUrlMock: vi.fn()
}));

vi.mock('../../shared', () => ({
	ensureAssetAccess: ensureAssetAccessMock
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

import { GET } from './+server';

const BASE_ASSET = {
	id: 'asset-1',
	project_id: 'project-1',
	storage_bucket: 'onto-assets',
	storage_path: 'projects/project-1/assets/asset-1/original.png'
};

function createSessionLocals(userId: string | null = 'user-1') {
	return {
		supabase: {
			storage: {
				from: vi.fn(() => {
					throw new Error('render route should use admin storage');
				})
			}
		},
		safeGetSession: vi.fn().mockResolvedValue(userId ? { user: { id: userId } } : null)
	};
}

describe('/api/onto/assets/[id]/render', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ensureAssetAccessMock.mockResolvedValue({ asset: BASE_ASSET, actorId: 'actor-1' });
		createSignedUrlMock.mockResolvedValue({
			data: { signedUrl: 'https://storage.example/signed-image' },
			error: null
		});
		storageFromMock.mockReturnValue({ createSignedUrl: createSignedUrlMock });
		createAdminSupabaseClientMock.mockReturnValue({
			storage: {
				from: storageFromMock
			}
		});
	});

	it('returns 401 when unauthenticated', async () => {
		const response = await GET({
			params: { id: 'asset-1' },
			url: new URL('http://localhost/api/onto/assets/asset-1/render?width=160'),
			locals: createSessionLocals(null)
		} as any);

		expect(response.status).toBe(401);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
	});

	it('creates the render signed URL with admin storage after asset access passes', async () => {
		const response = await GET({
			params: { id: 'asset-1' },
			url: new URL('http://localhost/api/onto/assets/asset-1/render?width=160&format=webp'),
			locals: createSessionLocals()
		} as any);

		expect(response.status).toBe(302);
		expect(response.headers.get('Location')).toBe('https://storage.example/signed-image');
		expect(ensureAssetAccessMock).toHaveBeenCalledWith(
			expect.anything(),
			'asset-1',
			'user-1',
			'read'
		);
		expect(storageFromMock).toHaveBeenCalledWith('onto-assets');
		expect(createSignedUrlMock).toHaveBeenCalledWith(
			'projects/project-1/assets/asset-1/original.png',
			1800,
			{ transform: { width: 160, format: 'webp', resize: 'contain' } }
		);
	});

	it('serves the original as a download named after the image', async () => {
		ensureAssetAccessMock.mockResolvedValue({
			asset: {
				...BASE_ASSET,
				caption: 'Redline: Logo / Final & #2',
				original_filename: 'IMG_0042.PNG',
				content_type: 'image/png'
			},
			actorId: 'actor-1'
		});

		const response = await GET({
			params: { id: 'asset-1' },
			url: new URL('http://localhost/api/onto/assets/asset-1/render?download=1&width=160'),
			locals: createSessionLocals()
		} as any);

		expect(response.status).toBe(302);
		expect(createSignedUrlMock).toHaveBeenCalledWith(
			'projects/project-1/assets/asset-1/original.png',
			1800,
			{ download: 'Redline Logo Final 2.png' }
		);
	});

	it('falls back to the uploaded filename, then the content type, for downloads', async () => {
		ensureAssetAccessMock.mockResolvedValue({
			asset: {
				...BASE_ASSET,
				caption: '  ',
				original_filename: 'brand mark.webp',
				content_type: 'image/webp'
			},
			actorId: 'actor-1'
		});
		await GET({
			params: { id: 'asset-1' },
			url: new URL('http://localhost/api/onto/assets/asset-1/render?download=1'),
			locals: createSessionLocals()
		} as any);
		expect(createSignedUrlMock).toHaveBeenLastCalledWith(expect.any(String), 1800, {
			download: 'brand mark.webp'
		});

		ensureAssetAccessMock.mockResolvedValue({
			asset: {
				...BASE_ASSET,
				caption: null,
				original_filename: null,
				content_type: 'image/jpeg'
			},
			actorId: 'actor-1'
		});
		await GET({
			params: { id: 'asset-1' },
			url: new URL('http://localhost/api/onto/assets/asset-1/render?download=1'),
			locals: createSessionLocals()
		} as any);
		expect(createSignedUrlMock).toHaveBeenLastCalledWith(expect.any(String), 1800, {
			download: 'image.jpg'
		});
	});

	it('keeps an explicit resize mode and omits the transform when no size is asked for', async () => {
		await GET({
			params: { id: 'asset-1' },
			url: new URL(
				'http://localhost/api/onto/assets/asset-1/render?width=64&height=64&resize=cover'
			),
			locals: createSessionLocals()
		} as any);
		expect(createSignedUrlMock).toHaveBeenLastCalledWith(expect.any(String), 1800, {
			transform: { width: 64, height: 64, resize: 'cover' }
		});

		await GET({
			params: { id: 'asset-1' },
			url: new URL('http://localhost/api/onto/assets/asset-1/render'),
			locals: createSessionLocals()
		} as any);
		expect(createSignedUrlMock).toHaveBeenLastCalledWith(expect.any(String), 1800, {
			transform: undefined
		});
	});
});
