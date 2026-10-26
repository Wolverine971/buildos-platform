// apps/web/src/routes/api/admin/email-campaigns/[id]/queue/+server.ts
// Queue a draft: everyone included goes out in paced waves from the start time.

import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { WAVE_INTERVAL_RANGE, WAVE_SIZE_RANGE } from '$lib/email-campaigns/types';
import { queueCampaign } from '$lib/server/email-campaigns/campaigns';
import { campaignErrorResponse, requireAdmin } from '$lib/server/email-campaigns/http';

const queueSchema = z
	.object({
		starts_at: z
			.string()
			.refine((value) => !Number.isNaN(Date.parse(value)), 'Pick a valid start time.')
			.nullable()
			.optional(),
		wave_size: z.number().int().min(WAVE_SIZE_RANGE.min).max(WAVE_SIZE_RANGE.max),
		wave_interval_minutes: z
			.number()
			.int()
			.min(WAVE_INTERVAL_RANGE.min)
			.max(WAVE_INTERVAL_RANGE.max)
	})
	.strict();

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const admin = await requireAdmin(locals);
	if (!admin.ok) return admin.response;

	const parsed = await parseJsonRequest(request, queueSchema);
	if (!parsed.ok) return parsed.response;

	try {
		const detail = await queueCampaign(admin.supabase, params.id, parsed.data);
		return ApiResponse.success(detail);
	} catch (error) {
		return campaignErrorResponse(error, 'Failed to queue the campaign');
	}
};
