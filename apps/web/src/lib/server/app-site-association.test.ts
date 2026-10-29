// apps/web/src/lib/server/app-site-association.test.ts
import { describe, expect, it } from 'vitest';
import {
	APP_LINK_PATHS,
	buildAndroidAssetLinks,
	buildAppleAppSiteAssociation,
	trustFileResponse
} from './app-site-association';

describe('apple-app-site-association', () => {
	it('is absent until the Apple app id is configured', () => {
		expect(buildAppleAppSiteAssociation({})).toBeNull();
		expect(buildAppleAppSiteAssociation({ PRIVATE_IOS_APP_IDS: 'not-an-app-id' })).toBeNull();
	});

	it('claims only the native paths for the configured app ids', () => {
		const body = buildAppleAppSiteAssociation({
			PRIVATE_IOS_APP_IDS: 'ABCDE12345.com.buildos.app, ABCDE12345.com.buildos.app.dev'
		});
		expect(body?.applinks.details[0]?.appIDs).toEqual([
			'ABCDE12345.com.buildos.app',
			'ABCDE12345.com.buildos.app.dev'
		]);
		expect(body?.applinks.details[0]?.components.map((c) => c['/'])).toEqual([
			...APP_LINK_PATHS
		]);
		expect(body?.webcredentials.apps).toEqual([
			'ABCDE12345.com.buildos.app',
			'ABCDE12345.com.buildos.app.dev'
		]);
		expect(APP_LINK_PATHS).not.toContain('/*');
	});
});

describe('assetlinks.json', () => {
	const fingerprint = Array.from({ length: 32 }, () => 'ab').join(':');

	it('is absent until the package and a fingerprint are configured', () => {
		expect(buildAndroidAssetLinks({})).toBeNull();
		expect(buildAndroidAssetLinks({ PRIVATE_ANDROID_PACKAGE: 'com.buildos.app' })).toBeNull();
		expect(
			buildAndroidAssetLinks({
				PRIVATE_ANDROID_PACKAGE: 'com.buildos.app',
				PRIVATE_ANDROID_SHA256_FINGERPRINTS: 'short'
			})
		).toBeNull();
	});

	it('normalizes fingerprints to upper case', () => {
		const body = buildAndroidAssetLinks({
			PRIVATE_ANDROID_PACKAGE: 'com.buildos.app',
			PRIVATE_ANDROID_SHA256_FINGERPRINTS: fingerprint
		});
		expect(body?.[0]?.target.sha256_cert_fingerprints).toEqual([fingerprint.toUpperCase()]);
		expect(body?.[0]?.relation).toEqual(['delegate_permission/common.handle_all_urls']);
	});
});

describe('trustFileResponse', () => {
	it('serves JSON with a public cache when configured and 404 no-store otherwise', async () => {
		const ok = trustFileResponse({ a: 1 });
		expect(ok.status).toBe(200);
		expect(ok.headers.get('content-type')).toBe('application/json');
		expect(ok.headers.get('cache-control')).toContain('public');
		expect(await ok.json()).toEqual({ a: 1 });

		const missing = trustFileResponse(null);
		expect(missing.status).toBe(404);
		expect(missing.headers.get('cache-control')).toBe('no-store');
	});
});
