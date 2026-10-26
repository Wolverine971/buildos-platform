// apps/web/src/routes/api/admin/email-campaigns/segments/+server.ts
// Live counts for the one-click audience cards.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { getSegmentCounts } from '$lib/server/email-campaigns/audience';
import { campaignErrorResponse, requireAdmin } from '$lib/server/email-campaigns/http';

export const GET: RequestHandler = async ({ locals }) => {
	const admin = await requireAdmin(locals);
	if (!admin.ok) return admin.response;

	try {
		const segments = await getSegmentCounts(admin.supabase);
		return ApiResponse.success({ segments });
	} catch (error) {
		return campaignErrorResponse(error, 'Failed to count audiences');
	}
};
