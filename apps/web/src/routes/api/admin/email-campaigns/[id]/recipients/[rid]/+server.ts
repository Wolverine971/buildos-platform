// apps/web/src/routes/api/admin/email-campaigns/[id]/recipients/[rid]/+server.ts
// Edit one person's version, reset it to the template, or include/skip them.

import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { updateRecipient } from '$lib/server/email-campaigns/campaigns';
import { campaignErrorResponse, requireAdmin } from '$lib/server/email-campaigns/http';

const updateRecipientSchema = z
	.object({
		subject_override: z.string().max(500).nullable().optional(),
		body_override: z.string().max(200_000).nullable().optional(),
		included: z.boolean().optional(),
		reset: z.boolean().optional()
	})
	.strict()
	.refine((patch) => Object.keys(patch).length > 0, 'Nothing to change.');

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const admin = await requireAdmin(locals);
	if (!admin.ok) return admin.response;

	const parsed = await parseJsonRequest(request, updateRecipientSchema);
	if (!parsed.ok) return parsed.response;

	try {
		const recipient = await updateRecipient(admin.supabase, params.id, params.rid, parsed.data);
		return ApiResponse.success({ recipient });
	} catch (error) {
		return campaignErrorResponse(error, 'Failed to update this person');
	}
};
