// apps/web/src/routes/api/admin/email-campaigns/[id]/recipients/[rid]/retry/+server.ts
// Put a failed email back in line to go out on the next cron run.

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { retryRecipient } from '$lib/server/email-campaigns/campaigns';
import { campaignErrorResponse, requireAdmin } from '$lib/server/email-campaigns/http';

export const POST: RequestHandler = async ({ params, locals }) => {
	const admin = await requireAdmin(locals);
	if (!admin.ok) return admin.response;

	try {
		const recipient = await retryRecipient(admin.supabase, params.id, params.rid);
		return ApiResponse.success({ recipient });
	} catch (error) {
		return campaignErrorResponse(error, 'Failed to retry this email');
	}
};
