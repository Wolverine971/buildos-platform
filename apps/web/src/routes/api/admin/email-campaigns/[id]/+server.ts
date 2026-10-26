// apps/web/src/routes/api/admin/email-campaigns/[id]/+server.ts
// GET the full campaign (people, results, who was left out); PATCH the draft; DELETE a draft.

import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { WAVE_INTERVAL_RANGE, WAVE_SIZE_RANGE } from '$lib/email-campaigns/types';
import {
	deleteCampaign,
	getCampaignDetail,
	updateCampaign
} from '$lib/server/email-campaigns/campaigns';
import { campaignErrorResponse, requireAdmin } from '$lib/server/email-campaigns/http';

const isoDate = z
	.string()
	.refine((value) => !Number.isNaN(Date.parse(value)), 'Pick a valid date and time.');

const updateCampaignSchema = z
	.object({
		name: z.string().max(200).optional(),
		subject_template: z.string().max(500).optional(),
		body_template: z.string().max(200_000).optional(),
		from_name: z.string().max(100).optional(),
		tailoring_instructions: z.string().max(4000).nullable().optional(),
		wave_size: z.number().int().min(WAVE_SIZE_RANGE.min).max(WAVE_SIZE_RANGE.max).optional(),
		wave_interval_minutes: z
			.number()
			.int()
			.min(WAVE_INTERVAL_RANGE.min)
			.max(WAVE_INTERVAL_RANGE.max)
			.optional(),
		starts_at: isoDate.nullable().optional()
	})
	.strict();

export const GET: RequestHandler = async ({ params, locals }) => {
	const admin = await requireAdmin(locals);
	if (!admin.ok) return admin.response;

	try {
		return ApiResponse.success(await getCampaignDetail(admin.supabase, params.id));
	} catch (error) {
		return campaignErrorResponse(error, 'Failed to load campaign');
	}
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const admin = await requireAdmin(locals);
	if (!admin.ok) return admin.response;

	const parsed = await parseJsonRequest(request, updateCampaignSchema);
	if (!parsed.ok) return parsed.response;

	try {
		const campaign = await updateCampaign(admin.supabase, params.id, parsed.data);
		return ApiResponse.success({ campaign });
	} catch (error) {
		return campaignErrorResponse(error, 'Failed to save campaign');
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const admin = await requireAdmin(locals);
	if (!admin.ok) return admin.response;

	try {
		await deleteCampaign(admin.supabase, params.id);
		return ApiResponse.success({ deleted: true });
	} catch (error) {
		return campaignErrorResponse(error, 'Failed to delete campaign');
	}
};
