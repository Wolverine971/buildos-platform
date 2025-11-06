// apps/web/src/routes/api/admin/feedback/overview/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFeedbackOverview } from '$lib/services/admin/dashboard-analytics.service';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return json({ error: 'Admin access required' }, { status: 403 });
	}

	try {
		const data = await getFeedbackOverview(supabase);
		return json(data);
	} catch (error) {
		console.error('Error fetching feedback overview:', error);
		return json({ error: 'Failed to fetch feedback overview' }, { status: 500 });
	}
};
