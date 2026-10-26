// apps/web/src/routes/api/admin/email-campaigns/[id]/tailor/+server.ts
// POST: AI-tailor up to TAILOR_BATCH_SIZE people of a campaign (the page loops in
// chunks and shows progress). Paid model call, only ever triggered by DJ.

// Each person is one model call (~3–8 s); a chunk of 4 at concurrency 2 needs more
// than the 10 s default.
export const config = {
	maxDuration: 60
};

import type { RequestHandler } from './$types';
import { z } from 'zod';

import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { TAILOR_BATCH_SIZE } from '$lib/email-campaigns/types';
import {
	TAILORABLE_STATUSES,
	tailorRecipients,
	toBasicRecipientView
} from '$lib/server/email-campaigns/tailor';

const tailorSchema = z
	.object({
		recipient_ids: z.array(z.string().uuid()).min(1).max(TAILOR_BATCH_SIZE),
		instructions: z.string().max(4000).nullable().optional()
	})
	.strict();

export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const parsed = await parseJsonRequest(request, tailorSchema);
	if (!parsed.ok) return parsed.response;
	const { recipient_ids, instructions } = parsed.data;

	try {
		const { data: campaign, error: campaignError } = await supabase
			.from('email_campaigns')
			.select(
				'id, name, status, subject_template, body_template, from_name, tailoring_instructions'
			)
			.eq('id', params.id)
			.maybeSingle();
		if (campaignError) throw campaignError;
		if (!campaign) return ApiResponse.notFound('Campaign');
		if (campaign.status !== 'draft' && campaign.status !== 'paused') {
			return ApiResponse.badRequest('Pause the campaign before tailoring more emails.');
		}

		const effectiveInstructions =
			instructions !== undefined ? instructions : campaign.tailoring_instructions;
		if (instructions !== undefined && instructions !== campaign.tailoring_instructions) {
			const { error: saveError } = await supabase
				.from('email_campaigns')
				.update({ tailoring_instructions: instructions })
				.eq('id', campaign.id);
			if (saveError) throw saveError;
		}

		const { data: rows, error: recipientsError } = await supabase
			.from('email_campaign_recipients')
			.select('*')
			.eq('campaign_id', campaign.id)
			.in('id', recipient_ids);
		if (recipientsError) throw recipientsError;

		const targets = (rows ?? []).filter((row) =>
			(TAILORABLE_STATUSES as string[]).includes(row.status)
		);
		if (targets.length === 0) {
			return ApiResponse.badRequest(
				'None of these people can be tailored (already sent or sending).'
			);
		}

		await tailorRecipients({
			supabase,
			campaign,
			recipients: targets,
			instructions: effectiveInstructions,
			adminUserId: user.id
		});

		const { data: updated, error: reloadError } = await supabase
			.from('email_campaign_recipients')
			.select('*')
			.eq('campaign_id', campaign.id)
			.in('id', recipient_ids);
		if (reloadError) throw reloadError;

		const order = new Map(recipient_ids.map((id, index) => [id, index]));
		const recipients = (updated ?? [])
			.map(toBasicRecipientView)
			.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

		return ApiResponse.success({ recipients });
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to tailor emails');
	}
};
