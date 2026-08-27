// apps/web/src/routes/sites/favicon.png/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	new Response(null, {
		status: 308,
		headers: {
			'Cache-Control': 'public, max-age=604800, immutable',
			Location: '/favicon-32x32.png'
		}
	});
