// apps/web/src/routes/api/admin/email-campaigns/people/+server.ts
// Search users and beta signups by name or email to add someone by hand.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { searchPeople } from '$lib/server/email-campaigns/audience';
import { campaignErrorResponse, requireAdmin } from '$lib/server/email-campaigns/http';

export const GET: RequestHandler = async ({ url, locals }) => {
	const admin = await requireAdmin(locals);
	if (!admin.ok) return admin.response;

	const search = (url.searchParams.get('search') ?? '').trim();
	if (search.length < 2) return ApiResponse.success({ people: [] });

	try {
		const people = await searchPeople(admin.supabase, search.slice(0, 100), 20);
		return ApiResponse.success({ people });
	} catch (error) {
		return campaignErrorResponse(error, 'Failed to search people');
	}
};
