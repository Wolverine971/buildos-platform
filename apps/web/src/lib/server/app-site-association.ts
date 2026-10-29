// apps/web/src/lib/server/app-site-association.ts
/**
 * Universal links (iOS) and App Links (Android): the trust files that let build-os.com links
 * open in the installed BuildOS app. Both are driven by environment, so nothing ships until
 * the Apple Team ID / bundle ID and the Android signing fingerprints exist:
 *
 *   PRIVATE_IOS_APP_IDS                 "TEAMID.com.buildos.app" (comma-separated for more)
 *   PRIVATE_ANDROID_PACKAGE             "com.buildos.app"
 *   PRIVATE_ANDROID_SHA256_FINGERPRINTS "AA:BB:…" (comma-separated for debug + release)
 *
 * Only the paths the app renders natively are claimed. Everything else (blog, docs, public
 * pages) keeps opening in the browser, where it works today.
 */

export const APP_LINK_PATHS = [
	'/today',
	'/projects',
	'/projects/*',
	'/briefs',
	'/briefs/*',
	'/invites/*',
	'/join/*'
] as const;

function parseList(value: string | undefined): string[] {
	return (value ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
}

export function buildAppleAppSiteAssociation(env: { PRIVATE_IOS_APP_IDS?: string }) {
	const appIDs = parseList(env.PRIVATE_IOS_APP_IDS).filter((id) =>
		/^[A-Z0-9]{10}\.[\w.-]+$/.test(id)
	);
	if (appIDs.length === 0) return null;
	return {
		applinks: {
			details: [
				{
					appIDs,
					components: APP_LINK_PATHS.map((path) => ({
						'/': path,
						comment: `BuildOS ${path}`
					}))
				}
			]
		},
		webcredentials: { apps: appIDs }
	};
}

export function buildAndroidAssetLinks(env: {
	PRIVATE_ANDROID_PACKAGE?: string;
	PRIVATE_ANDROID_SHA256_FINGERPRINTS?: string;
}) {
	const packageName = env.PRIVATE_ANDROID_PACKAGE?.trim();
	const fingerprints = parseList(env.PRIVATE_ANDROID_SHA256_FINGERPRINTS).filter((fp) =>
		/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(fp)
	);
	if (!packageName || fingerprints.length === 0) return null;
	return [
		{
			relation: ['delegate_permission/common.handle_all_urls'],
			target: {
				namespace: 'android_app',
				package_name: packageName,
				sha256_cert_fingerprints: fingerprints.map((fp) => fp.toUpperCase())
			}
		}
	];
}

export function trustFileResponse(body: unknown | null): Response {
	if (!body) {
		return new Response('Not configured', {
			status: 404,
			headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' }
		});
	}
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400'
		}
	});
}
