// src/routes/api/health/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals: { safeGetSession } }) => {
	// This endpoint forces the server to check the current auth state
	const { user } = await safeGetSession();

	return json({
		status: 'ok',
		timestamp: new Date().toISOString(),
		authenticated: !!user,
		userId: user?.id || null
	});
};
