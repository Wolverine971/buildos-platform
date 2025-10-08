// apps/web/src/routes/api/webhooks/send-notification-email/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PRIVATE_BUILDOS_WEBHOOK_SECRET } from '$env/static/private';
import { EmailService } from '$lib/services/email-service';
import { createServiceClient } from '@buildos/supabase-client';

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
			console.error('[NotificationEmailWebhook] PRIVATE_BUILDOS_WEBHOOK_SECRET not configured');
			return json({ error: 'Webhook not configured' }, { status: 500 });
		}

		if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
			console.warn('[NotificationEmailWebhook] Invalid or missing authorization header');
			return json({ error: 'Unauthorized' }, { status: 401 });
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
			return json(
				{ error: 'Missing required fields: recipientEmail, recipientUserId, subject' },
				{ status: 400 }
			);
		}

		console.log(
			`[NotificationEmailWebhook] Sending notification email to ${body.recipientEmail} (delivery: ${body.deliveryId})`
		);

		// Create Supabase client and EmailService
		const supabase = createServiceClient();
		const emailService = new EmailService(supabase);

		// Send email immediately via Gmail
		const result = await emailService.sendEmail({
			to: body.recipientEmail,
			subject: body.subject,
			body: body.textContent || body.subject,
			html: body.htmlContent,
			from: 'buildos',
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

			return json(
				{
					success: false,
					error: result.error || 'Failed to send email'
				},
				{ status: 500 }
			);
		}

		const duration = Date.now() - startTime;
		console.log(
			`[NotificationEmailWebhook] ✅ Email sent successfully in ${duration}ms (messageId: ${result.messageId}, delivery: ${body.deliveryId})`
		);

		return json({
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

		return json(
			{
				success: false,
				error: error.message || 'Internal server error'
			},
			{ status: 500 }
		);
	}
};
