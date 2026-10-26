// apps/web/src/routes/api/admin/email-campaigns/[id]/resume/+server.ts
// Pick up where it left off: the next wave goes out now.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { resumeCampaign } from '$lib/server/email-campaigns/campaigns';
import { campaignErrorResponse, requireAdmin } from '$lib/server/email-campaigns/http';

export const POST: RequestHandler = async ({ params, locals }) => {
	const admin = await requireAdmin(locals);
	if (!admin.ok) return admin.response;

	try {
		return ApiResponse.success(await resumeCampaign(admin.supabase, params.id));
	} catch (error) {
		return campaignErrorResponse(error, 'Failed to resume the campaign');
	}
};
