// apps/web/src/routes/api/public/site-icon/+server.ts
//
// GET ?host=example.com → that site's icon for link and project tiles on builder pages.
// Our server asks Google's favicon service, so visitors' browsers never contact Google,
// and the edge caches each icon for a week. 404 when a site has no icon; the page then
// shows its letter tile. Only a validated host name is ever sent, and only raster
// images come back (no SVG, which could carry script on our origin).

import type { RequestHandler } from './$types';

const HOST = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const IMAGE_TYPES = new Set([
	'image/png',
	'image/x-icon',
	'image/vnd.microsoft.icon',
	'image/jpeg',
	'image/gif',
	'image/webp'
]);
const MAX_BYTES = 100_000;

function missing(maxAge: number) {
	return new Response(null, {
		status: 404,
		headers: { 'cache-control': `public, max-age=${maxAge}, s-maxage=${maxAge}` }
	});
}

export const GET: RequestHandler = async ({ url }) => {
	const host = (url.searchParams.get('host') ?? '')
		.trim()
		.toLowerCase()
		.replace(/^www\./, '');
	if (!HOST.test(host)) return new Response(null, { status: 400 });

	let res: Response;
	try {
		res = await fetch(
			`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`,
			{ signal: AbortSignal.timeout(4000), redirect: 'follow' }
		);
	} catch {
		return missing(300);
	}
	const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
	if (!res.ok || !IMAGE_TYPES.has(type)) return missing(86_400);
	const bytes = await res.arrayBuffer();
	if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return missing(86_400);

	return new Response(bytes, {
		headers: {
			'content-type': type,
			'cache-control':
				'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
			'content-security-policy': "default-src 'none'",
			'x-content-type-options': 'nosniff'
		}
	});
};
