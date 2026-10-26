// apps/web/src/routes/api/admin/email-campaigns/[id]/cancel/+server.ts
// Stop for good: everyone still waiting is dropped.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { cancelCampaign } from '$lib/server/email-campaigns/campaigns';
import { campaignErrorResponse, requireAdmin } from '$lib/server/email-campaigns/http';

export const POST: RequestHandler = async ({ params, locals }) => {
	const admin = await requireAdmin(locals);
	if (!admin.ok) return admin.response;

	try {
		return ApiResponse.success(await cancelCampaign(admin.supabase, params.id));
	} catch (error) {
		return campaignErrorResponse(error, 'Failed to cancel the campaign');
	}
};
