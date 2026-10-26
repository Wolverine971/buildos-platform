// apps/web/src/routes/api/admin/email-campaigns/[id]/pause/+server.ts
// Stop sending after the emails already going out.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { pauseCampaign } from '$lib/server/email-campaigns/campaigns';
import { campaignErrorResponse, requireAdmin } from '$lib/server/email-campaigns/http';

export const POST: RequestHandler = async ({ params, locals }) => {
	const admin = await requireAdmin(locals);
	if (!admin.ok) return admin.response;

	try {
		return ApiResponse.success(await pauseCampaign(admin.supabase, params.id));
	} catch (error) {
		return campaignErrorResponse(error, 'Failed to pause the campaign');
	}
};
