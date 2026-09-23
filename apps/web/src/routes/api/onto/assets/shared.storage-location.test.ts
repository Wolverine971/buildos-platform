// apps/web/src/routes/api/onto/assets/shared.storage-location.test.ts
import { describe, expect, it } from 'vitest';
import { isCanonicalAssetStorageLocation } from './shared';

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
