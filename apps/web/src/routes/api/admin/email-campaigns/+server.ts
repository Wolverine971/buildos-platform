// apps/web/src/routes/api/admin/email-campaigns/+server.ts
// GET: every campaign with counts. POST: start a new draft.

import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { parseOptionalJsonRequest } from '$lib/utils/request-validation';
import { createCampaign, listCampaigns } from '$lib/server/email-campaigns/campaigns';
import { campaignErrorResponse, requireAdmin } from '$lib/server/email-campaigns/http';

const createCampaignSchema = z
	.object({
		name: z.string().max(200).nullable().optional()
	})
	.strict();

export const GET: RequestHandler = async ({ locals }) => {
	const admin = await requireAdmin(locals);
	if (!admin.ok) return admin.response;

	try {
		const campaigns = await listCampaigns(admin.supabase);
		return ApiResponse.success({ campaigns });
	} catch (error) {
		return campaignErrorResponse(error, 'Failed to load campaigns');
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const admin = await requireAdmin(locals);
	if (!admin.ok) return admin.response;

	const parsed = await parseOptionalJsonRequest(request, createCampaignSchema, {});
	if (!parsed.ok) return parsed.response;

	try {
		const campaign = await createCampaign(admin.supabase, {
			name: parsed.data.name,
			createdBy: admin.userId
		});
		return ApiResponse.created({ campaign });
	} catch (error) {
		return campaignErrorResponse(error, 'Failed to create campaign');
	}
};
