// apps/web/src/routes/api/admin/email-campaigns/[id]/follow-up/+server.ts
// New draft for everyone who got this campaign and didn't reply, unsubscribe, or bounce.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createFollowUp } from '$lib/server/email-campaigns/campaigns';
import { campaignErrorResponse, requireAdmin } from '$lib/server/email-campaigns/http';

export const POST: RequestHandler = async ({ params, locals }) => {
	const admin = await requireAdmin(locals);
	if (!admin.ok) return admin.response;

	try {
		const campaign = await createFollowUp(admin.supabase, params.id, admin.userId);
		return ApiResponse.created({ campaign });
	} catch (error) {
		return campaignErrorResponse(error, 'Failed to start a follow-up');
	}
};
