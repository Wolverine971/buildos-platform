// apps/web/src/routes/api/email-tracking/[tracking_id]/unsubscribe/+server.ts

import type { RequestHandler } from './$types';
import { createLogger } from '@buildos/shared-utils';

import { createAdminSupabaseClient } from '$lib/supabase/admin';

type SuppressionSource = 'email_link' | 'list_header';

function getClientIp(request: Request): string {
	const forwardedFor = request.headers.get('x-forwarded-for');
	const realIp = request.headers.get('x-real-ip');
	return forwardedFor?.split(',')[0]?.trim() || realIp || '';
}

function unsubscribeResponse(status = 200): Response {
	return new Response(
		`<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>BuildOS email preferences</title>
	</head>
	<body>
		<p>You will not receive these BuildOS emails anymore.</p>
	</body>
</html>`,
		{
			status,
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'no-store'
			}
		}
	);
}

async function handleUnsubscribe({
	trackingId,
	request,
	source
}: {
	trackingId: string;
	request: Request;
	source: SuppressionSource;
}): Promise<Response> {
	const supabase = createAdminSupabaseClient();
	const logger = createLogger('web:api:email-unsubscribe', supabase);
	const userAgent = request.headers.get('user-agent') || '';
	const ipAddress = getClientIp(request);

	if (!trackingId?.trim()) {
		return unsubscribeResponse();
	}

	try {
		const { data: email, error: emailError } = await (supabase.from('emails') as any)
			.select(
				`
				id,
				subject,
				template_data,
				email_recipients (
					id,
					recipient_email,
					recipient_id
				)
			`
			)
			.eq('tracking_id', trackingId)
			.maybeSingle();

		if (emailError) {
			logger.error('Failed to load email for unsubscribe', emailError, {
				trackingId
			});
			return unsubscribeResponse();
		}

		if (!email) {
			logger.warn('Email not found for unsubscribe', {
				trackingId
			});
			return unsubscribeResponse();
		}

		const recipients = Array.isArray(email.email_recipients) ? email.email_recipients : [];
		const now = new Date().toISOString();

		for (const recipient of recipients) {
			const recipientEmail =
				typeof recipient?.recipient_email === 'string'
					? recipient.recipient_email.trim().toLowerCase()
					: '';

			if (!recipientEmail) {
				continue;
			}

			const metadata = {
				tracking_id: trackingId,
				email_id: email.id,
				email_subject: email.subject,
				recipient_id: recipient.id,
				recipient_user_id: recipient.recipient_id ?? null,
				source,
				template_data: email.template_data ?? null
			};

			const { error: suppressionError } = await (supabase as any).rpc(
				'upsert_email_suppression',
				{
					p_email: recipientEmail,
					p_scope: 'lifecycle',
					p_reason: 'unsubscribe',
					p_source: source,
					p_metadata: metadata
				}
			);

			if (suppressionError) {
				logger.error('Failed to write email suppression', suppressionError, {
					trackingId,
					recipientEmail
				});
				continue;
			}

			await supabase.from('email_tracking_events').insert({
				email_id: email.id,
				recipient_id: recipient.id ?? null,
				event_type: 'unsubscribed',
				event_data: {
					source,
					tracking_id: trackingId,
					recipient_email: recipientEmail
				},
				user_agent: userAgent,
				ip_address: ipAddress,
				timestamp: now
			});

			if (recipient.recipient_id) {
				await (supabase.from('welcome_email_sequences') as any)
					.update({
						status: 'cancelled',
						completed_at: now,
						last_evaluated_at: now,
						updated_at: now
					})
					.eq('user_id', recipient.recipient_id)
					.eq('status', 'active');
			}
		}

		return unsubscribeResponse();
	} catch (error) {
		logger.error('Unhandled unsubscribe error', error, {
			trackingId
		});
		return unsubscribeResponse();
	}
}

export const GET: RequestHandler = async ({ params, request }) => {
	return handleUnsubscribe({
		trackingId: params.tracking_id,
		request,
		source: 'email_link'
	});
};

export const POST: RequestHandler = async ({ params, request }) => {
	return handleUnsubscribe({
		trackingId: params.tracking_id,
		request,
		source: 'list_header'
	});
};
