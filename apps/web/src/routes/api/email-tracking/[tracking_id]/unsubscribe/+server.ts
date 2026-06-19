// apps/web/src/routes/api/email-tracking/[tracking_id]/unsubscribe/+server.ts

import type { RequestHandler } from './$types';
import { createLogger } from '@buildos/shared-utils';

import { createAdminSupabaseClient } from '$lib/supabase/admin';

type SuppressionSource = 'email_link' | 'list_header';
type SuppressionScope = 'lifecycle' | 'daily_brief';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getClientIp(request: Request): string {
	const forwardedFor = request.headers.get('x-forwarded-for');
	const realIp = request.headers.get('x-real-ip');
	return forwardedFor?.split(',')[0]?.trim() || realIp || '';
}

function unsubscribeResponse(status = 200, dailyBriefDisabled = false): Response {
	const message = dailyBriefDisabled
		? 'Your BuildOS daily briefs have been turned off.'
		: 'You will not receive these BuildOS emails anymore.';

	return new Response(
		`<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>BuildOS email preferences</title>
	</head>
	<body>
		<p>${message}</p>
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

function isDailyBriefEmail(email: Record<string, any>): boolean {
	const templateData =
		email.template_data && typeof email.template_data === 'object'
			? (email.template_data as Record<string, any>)
			: {};

	return (
		email.category === 'daily_brief' ||
		templateData.category === 'daily_brief' ||
		templateData.category === 'daily-brief' ||
		templateData.event_type === 'brief.completed' ||
		templateData.event_type === 'brief.failed' ||
		(typeof templateData.brief_id === 'string' && typeof templateData.brief_date === 'string')
	);
}

function resolveRecipientUserId(email: Record<string, any>, recipient: Record<string, any>) {
	if (typeof recipient.recipient_id === 'string' && recipient.recipient_id.length > 0) {
		return recipient.recipient_id;
	}

	if (typeof email.created_by === 'string' && UUID_PATTERN.test(email.created_by)) {
		return email.created_by;
	}

	const templateData =
		email.template_data && typeof email.template_data === 'object'
			? (email.template_data as Record<string, any>)
			: {};

	if (typeof templateData.user_id === 'string' && UUID_PATTERN.test(templateData.user_id)) {
		return templateData.user_id;
	}

	if (
		typeof templateData.recipient_user_id === 'string' &&
		UUID_PATTERN.test(templateData.recipient_user_id)
	) {
		return templateData.recipient_user_id;
	}

	return null;
}

async function disableDailyBriefsForUser({
	supabase,
	userId,
	now,
	trackingId,
	logger
}: {
	supabase: ReturnType<typeof createAdminSupabaseClient>;
	userId: string;
	now: string;
	trackingId: string;
	logger: ReturnType<typeof createLogger>;
}): Promise<boolean> {
	try {
		const { error: notificationPreferenceError } = await supabase
			.from('user_notification_preferences')
			.upsert(
				{
					user_id: userId,
					should_email_daily_brief: false,
					should_sms_daily_brief: false,
					updated_at: now
				} as any,
				{ onConflict: 'user_id' }
			);

		if (notificationPreferenceError) {
			logger.error(
				'Failed to disable daily brief notification preferences',
				notificationPreferenceError,
				{
					trackingId,
					userId
				}
			);
		}

		const { error: briefPreferenceError } = await supabase
			.from('user_brief_preferences')
			.upsert(
				{
					user_id: userId,
					is_active: false,
					updated_at: now
				} as any,
				{ onConflict: 'user_id' }
			);

		if (briefPreferenceError) {
			logger.error('Failed to deactivate daily brief generation', briefPreferenceError, {
				trackingId,
				userId
			});
		}

		const { error: subscriptionError } = await supabase
			.from('notification_subscriptions')
			.update({
				is_active: false,
				updated_at: now
			} as any)
			.eq('user_id', userId)
			.in('event_type', ['brief.completed', 'brief.failed']);

		if (subscriptionError) {
			logger.error(
				'Failed to deactivate daily brief notification subscriptions',
				subscriptionError,
				{
					trackingId,
					userId
				}
			);
		}

		const { error: queueError } = await supabase
			.from('queue_jobs')
			.update({
				status: 'cancelled',
				error_message: 'Cancelled by daily brief email unsubscribe',
				processed_at: now,
				updated_at: now
			} as any)
			.eq('user_id', userId)
			.eq('job_type', 'generate_daily_brief')
			.in('status', ['pending', 'processing']);

		if (queueError) {
			logger.error(
				'Failed to cancel pending daily brief jobs after unsubscribe',
				queueError,
				{
					trackingId,
					userId
				}
			);
		}

		return !notificationPreferenceError && !briefPreferenceError;
	} catch (error) {
		logger.error('Unhandled daily brief preference disable error', error, {
			trackingId,
			userId
		});
		return false;
	}
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
				category,
				created_by,
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
		const isDailyBrief = isDailyBriefEmail(email);
		const suppressionScope: SuppressionScope = isDailyBrief ? 'daily_brief' : 'lifecycle';
		let disabledDailyBrief = false;

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
				recipient_user_id: resolveRecipientUserId(email, recipient),
				source,
				template_data: email.template_data ?? null
			};

			const { error: suppressionError } = await (supabase as any).rpc(
				'upsert_email_suppression',
				{
					p_email: recipientEmail,
					p_scope: suppressionScope,
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
			} else {
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
			}

			const recipientUserId = resolveRecipientUserId(email, recipient);

			if (isDailyBrief && recipientUserId) {
				const didDisableDailyBrief = await disableDailyBriefsForUser({
					supabase,
					userId: recipientUserId,
					now,
					trackingId,
					logger
				});
				disabledDailyBrief ||= didDisableDailyBrief;
			} else if (recipient.recipient_id) {
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

		return unsubscribeResponse(200, disabledDailyBrief);
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
