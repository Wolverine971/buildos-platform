// apps/web/src/routes/api/webhooks/send-notification-email/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { PRIVATE_BUILDOS_WEBHOOK_SECRET } from '$env/static/private';
import { EmailService } from '$lib/services/email-service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

/**
 * Webhook endpoint for worker to send notification emails
 *
 * Security: Validates PRIVATE_BUILDOS_WEBHOOK_SECRET (shared with worker)
 * Flow: Worker calls this webhook → Email sent immediately via Gmail
 */

interface NotificationEmailRequest {
	recipientEmail: string;
	recipientName?: string;
	recipientUserId: string;
	subject: string;
	htmlContent: string;
	textContent: string;
	trackingId?: string;
	emailRecordId?: string;
	deliveryId: string;
	eventId: string;
	eventType?: string;
}

export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();

	try {
		// Validate webhook secret
		const authHeader = request.headers.get('authorization');
		const expectedSecret = PRIVATE_BUILDOS_WEBHOOK_SECRET;

		if (!expectedSecret) {
			console.error(
				'[NotificationEmailWebhook] PRIVATE_BUILDOS_WEBHOOK_SECRET not configured'
			);
			return ApiResponse.internalError(null, 'Webhook not configured');
		}

		if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
			console.warn('[NotificationEmailWebhook] Invalid or missing authorization header');
			return ApiResponse.unauthorized('Unauthorized');
		}

		// Parse request body
		const body = (await request.json()) as NotificationEmailRequest;

		// Validate required fields
		if (!body.recipientEmail || !body.recipientUserId || !body.subject) {
			console.error('[NotificationEmailWebhook] Missing required fields', {
				hasEmail: !!body.recipientEmail,
				hasUserId: !!body.recipientUserId,
				hasSubject: !!body.subject
			});
			return ApiResponse.badRequest(
				'Missing required fields: recipientEmail, recipientUserId, subject'
			);
		}

		console.log(
			`[NotificationEmailWebhook] Sending notification email to ${body.recipientEmail} (delivery: ${body.deliveryId})`
		);

		// Create Supabase client and EmailService
		const supabase = createAdminSupabaseClient();

		// ✅ TRIPLE-CHECK USER PREFERENCES
		// Final safety check before sending via SMTP
		// This ensures we respect user preferences even if they changed between queuing and sending
		// Phase 4 (2025-10-16): Updated to use global user preferences (no event_type filter)
		const { data: prefs, error: prefError } = await supabase
			.from('user_notification_preferences')
			.select('email_enabled, should_email_daily_brief')
			.eq('user_id', body.recipientUserId)
			.maybeSingle();

		// Determine which preference to check based on event type
		let emailAllowed = false;
		if (body.eventType === 'brief.completed') {
			// For daily briefs, check should_email_daily_brief
			emailAllowed = prefs?.should_email_daily_brief ?? false;
		} else {
			// For all other events, check email_enabled
			emailAllowed = prefs?.email_enabled ?? false;
		}

		if (prefError || !prefs || !emailAllowed) {
			console.log(
				`[NotificationEmailWebhook] ❌ Email cancelled - user preferences do not allow (delivery: ${body.deliveryId})`,
				{
					eventType: body.eventType,
					userId: body.recipientUserId,
					prefError: prefError?.message,
					emailEnabled: prefs?.email_enabled,
					shouldEmailDailyBrief: prefs?.should_email_daily_brief,
					checkUsed:
						body.eventType === 'brief.completed'
							? 'should_email_daily_brief'
							: 'email_enabled'
				}
			);
			return ApiResponse.success({
				success: false,
				error: 'Cancelled: User preferences do not allow email notifications'
			});
		}

		const emailService = new EmailService(supabase);

		// Send email immediately via Gmail
		const result = await emailService.sendEmail({
			to: body.recipientEmail,
			subject: body.subject,
			body: body.textContent || body.subject,
			html: body.htmlContent,
			from: 'dj', // ✅ Fixed: Use valid sender type (was 'buildos' which doesn't exist)
			userId: body.recipientUserId,
			emailId: body.emailRecordId,
			trackingEnabled: !!body.trackingId,
			metadata: {
				delivery_id: body.deliveryId,
				event_id: body.eventId,
				event_type: body.eventType,
				notification_type: 'system',
				sent_via: 'webhook'
			}
		});

		if (!result.success) {
			console.error('[NotificationEmailWebhook] Email send failed:', {
				deliveryId: body.deliveryId,
				error: result.error
			});

			return ApiResponse.internalError(result.error, result.error || 'Failed to send email');
		}

		const duration = Date.now() - startTime;
		console.log(
			`[NotificationEmailWebhook] ✅ Email sent successfully in ${duration}ms (messageId: ${result.messageId}, delivery: ${body.deliveryId})`
		);

		return ApiResponse.success({
			success: true,
			messageId: result.messageId,
			duration
		});
	} catch (error: any) {
		const duration = Date.now() - startTime;
		console.error('[NotificationEmailWebhook] Unexpected error:', {
			error: error.message,
			stack: error.stack,
			duration
		});

		return ApiResponse.internalError(error, error.message || 'Internal server error');
	}
};
