// apps/web/src/routes/api/admin/email-campaigns/[id]/test/+server.ts
// POST: send DJ a test of one person's version (or the template filled with DJ's
// name) so he sees exactly what lands in an inbox. Subject is prefixed [Test].

import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { z } from 'zod';

import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { validateEmail } from '$lib/utils/email-validation';
import { EmailService } from '$lib/services/email-service';
import { sendCampaignTest } from '$lib/server/email-campaigns/sender';

const testSchema = z
	.object({
		recipient_id: z.string().uuid().nullable().optional(),
		to: z.string().nullable().optional()
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

	const parsed = await parseJsonRequest(request, testSchema);
	if (!parsed.ok) return parsed.response;
	const { recipient_id, to } = parsed.data;

	const destination = to?.trim() || user.email;
	if (!destination) {
		return ApiResponse.badRequest('Add an address to send the test to.');
	}
	const validated = validateEmail(destination);
	if (!validated.success || !validated.email) {
		return ApiResponse.badRequest(validated.error || 'That test address is not valid.');
	}

	try {
		const { data: campaign, error: campaignError } = await supabase
			.from('email_campaigns')
			.select('id, name, subject_template, body_template, from_name')
			.eq('id', params.id)
			.maybeSingle();
		if (campaignError) throw campaignError;
		if (!campaign) return ApiResponse.notFound('Campaign');

		let recipient: Parameters<typeof sendCampaignTest>[0]['recipient'] = null;
		if (recipient_id) {
			const { data, error } = await supabase
				.from('email_campaign_recipients')
				.select('id, first_name, context, subject_override, body_override')
				.eq('campaign_id', campaign.id)
				.eq('id', recipient_id)
				.maybeSingle();
			if (error) throw error;
			if (!data) return ApiResponse.notFound('Person');
			recipient = data;
		}

		const result = await sendCampaignTest({
			emailService: new EmailService(supabase),
			campaign,
			recipient,
			to: validated.email,
			adminUserId: user.id,
			adminName: user.name
		});

		if (!result.success) {
			return result.empty
				? ApiResponse.badRequest(result.error)
				: ApiResponse.internalError(
						new Error(result.error),
						`Test send failed: ${result.error}`
					);
		}

		// Local dev shares the production DB, so EmailService logs campaign mail instead of sending it.
		return ApiResponse.success({ sent_to: result.sentTo, logged_only: dev });
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to send the test email');
	}
};
