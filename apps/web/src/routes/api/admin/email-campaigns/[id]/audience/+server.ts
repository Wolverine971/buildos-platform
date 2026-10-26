// apps/web/src/routes/api/admin/email-campaigns/[id]/audience/+server.ts
// Save who the campaign goes to and rebuild the people list (draft or paused only).

import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { setAudience } from '$lib/server/email-campaigns/campaigns';
import { campaignErrorResponse, requireAdmin } from '$lib/server/email-campaigns/http';

const manualPersonSchema = z
	.object({
		email: z.string().trim().min(3).max(320),
		name: z.string().max(200).nullable().optional(),
		user_id: z.string().uuid().nullable().optional(),
		beta_signup_id: z.string().uuid().nullable().optional()
	})
	.strict();

const audienceSchema = z
	.object({
		audience: z
			.object({
				segments: z.array(z.enum(['no_project', 'went_quiet', 'beta_no_account'])).max(3),
				people: z.array(manualPersonSchema).max(2000),
				removed_emails: z.array(z.string().max(320)).max(5000)
			})
			.strict()
	})
	.strict();

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const admin = await requireAdmin(locals);
	if (!admin.ok) return admin.response;

	const parsed = await parseJsonRequest(request, audienceSchema);
	if (!parsed.ok) return parsed.response;

	try {
		const detail = await setAudience(admin.supabase, params.id, parsed.data.audience);
		return ApiResponse.success(detail);
	} catch (error) {
		return campaignErrorResponse(error, 'Failed to update the audience');
	}
};
