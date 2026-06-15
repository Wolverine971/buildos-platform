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
			{ transform: { width: 160, format: 'webp' } }
		);
	});
});
