// apps/web/src/routes/api/onto/assets/shared.storage-location.test.ts
import { describe, expect, it, vi } from 'vitest';
import { isCanonicalAssetStorageLocation, ensureAssetAccess } from './shared';

const ASSET = {
	id: 'asset-1',
	project_id: 'project-1',
	storage_bucket: 'onto-assets',
	storage_path: 'projects/project-1/assets/asset-1/original.png'
};

describe('isCanonicalAssetStorageLocation', () => {
	it('accepts the location every writer builds', () => {
		expect(isCanonicalAssetStorageLocation(ASSET)).toBe(true);
	});

	it.each([
		['another project', 'projects/project-2/assets/asset-9/original.png'],
		['another asset in the same project', 'projects/project-1/assets/asset-2/original.png'],
		['a traversal out of the asset folder', 'projects/project-1/assets/asset-1/../../x.png'],
		['a prefix look-alike', 'projects/project-1/assets/asset-10/original.png']
	])('rejects %s', (_label, storage_path) => {
		expect(isCanonicalAssetStorageLocation({ ...ASSET, storage_path })).toBe(false);
	});

	it('rejects other buckets', () => {
		expect(isCanonicalAssetStorageLocation({ ...ASSET, storage_bucket: 'avatars' })).toBe(
			false
		);
	});
});

it('keeps a moved asset canonical at its immutable upload path', () => {
	expect(
		isCanonicalAssetStorageLocation({
			...ASSET,
			project_id: 'destination',
			storage_project_id: 'project-1'
		})
	).toBe(true);
	expect(
		isCanonicalAssetStorageLocation({
			...ASSET,
			project_id: 'destination',
			storage_project_id: 'unrelated'
		})
	).toBe(false);
});
it('authorizes the new project while rendering the original storage path', async () => {
	const asset = { ...ASSET, project_id: 'destination', storage_project_id: 'project-1' };
	const query: any = {
		select: () => query,
		eq: () => query,
		is: () => query,
		maybeSingle: async () => ({ data: asset, error: null })
	};
	const client: any = {
		from: () => query,
		rpc: vi.fn(async (name: string) => ({
			data: name === 'ensure_actor_for_user' ? 'actor' : true,
			error: null
		}))
	};
	expect(await ensureAssetAccess(client, 'asset-1', 'user', 'read')).toMatchObject({ asset });
	expect(client.rpc).toHaveBeenCalledWith('current_actor_has_project_member_access', {
		p_project_id: 'destination',
		p_required_access: 'read'
	});
});
