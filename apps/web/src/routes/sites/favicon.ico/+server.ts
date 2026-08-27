// apps/web/src/routes/sites/favicon.ico/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	new Response(null, {
		status: 308,
		headers: {
			'Cache-Control': 'public, max-age=604800, immutable',
			Location: '/favicon.ico'
		}
	});
