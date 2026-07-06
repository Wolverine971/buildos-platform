// apps/web/src/routes/api/webhooks/send-notification-email/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { PRIVATE_BUILDOS_WEBHOOK_SECRET } from '$env/static/private';
import { EmailService } from '$lib/services/email-service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { parseJsonRequest } from '$lib/utils/request-validation';

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
	briefId?: string | null;
	briefDate?: string | null;
	engagementStage?: string | null;
}

const notificationEmailRequestSchema = z.object({
	recipientEmail: z.string().email(),
	recipientName: z.string().optional(),
	recipientUserId: z.string().min(1),
	subject: z.string().min(1),
	htmlContent: z.string(),
	textContent: z.string(),
	trackingId: z.string().optional(),
	emailRecordId: z.string().optional(),
	deliveryId: z.string().min(1),
	eventId: z.string().min(1),
	eventType: z.string().optional(),
	briefId: z.string().nullable().optional(),
	briefDate: z.string().nullable().optional(),
	engagementStage: z.string().nullable().optional()
});
// Intentionally not .strict(): the worker deploys independently (Railway vs
// Vercel) and may send newer payload keys before/after this endpoint updates.
// Unknown keys are stripped, known keys stay validated.

const SENT_EMAIL_STATUSES = ['sent', 'delivered', 'opened', 'clicked'] as const;

type SentNotificationEmail = {
	id: string;
	status: string | null;
	tracking_id: string | null;
	sent_at: string | null;
};

function isSentEmailStatus(status: string | null | undefined): boolean {
	return SENT_EMAIL_STATUSES.includes(status as (typeof SENT_EMAIL_STATUSES)[number]);
}

async function findSentEmailForDelivery(
	supabase: ReturnType<typeof createAdminSupabaseClient>,
	deliveryId: string,
	emailRecordId?: string
): Promise<SentNotificationEmail | null> {
	if (emailRecordId) {
		const { data, error } = await supabase
			.from('emails')
			.select('id, status, tracking_id, sent_at')
			.eq('id', emailRecordId)
			.maybeSingle();

		if (error) {
			console.error('[NotificationEmailWebhook] Failed to check email idempotency row', {
				emailRecordId,
				deliveryId,
				error: error.message
			});
		}

		if (data && isSentEmailStatus(data.status)) {
			return data;
		}
	}

	// ->> expression filter matches idx_emails_template_delivery_id
	const { data, error } = await (supabase.from('emails') as any)
		.select('id, status, tracking_id, sent_at')
		.eq('template_data->>delivery_id', deliveryId)
		.in('status', SENT_EMAIL_STATUSES)
		.order('sent_at', { ascending: false, nullsFirst: false })
		.limit(1);

	if (error) {
		console.error('[NotificationEmailWebhook] Failed to check delivery idempotency rows', {
			deliveryId,
			error: error.message
		});
		return null;
	}

	const firstRecord = Array.isArray(data) ? data[0] : data;
	return firstRecord ?? null;
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
		const parsed = await parseJsonRequest(request, notificationEmailRequestSchema);
		if (!parsed.ok) return parsed.response;
		const body = parsed.data as NotificationEmailRequest;

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

		const existingSentEmail = await findSentEmailForDelivery(
			supabase,
			body.deliveryId,
			body.emailRecordId
		);
		if (existingSentEmail) {
			const duration = Date.now() - startTime;
			console.log(
				`[NotificationEmailWebhook] Email already sent for delivery ${body.deliveryId}; skipping Gmail send`
			);
			return ApiResponse.success({
				success: true,
				messageId: null,
				emailId: existingSentEmail.id,
				skipped: 'already_sent',
				duration
			});
		}

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
		const isDailyBriefEvent =
			body.eventType === 'brief.completed' || body.eventType === 'brief.failed';
		let emailAllowed = false;
		if (isDailyBriefEvent) {
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
					checkUsed: isDailyBriefEvent ? 'should_email_daily_brief' : 'email_enabled'
				}
			);
			return ApiResponse.success({
				success: false,
				error: 'Cancelled: User preferences do not allow email notifications'
			});
		}

		// Atomically claim the email row before the Gmail send so two concurrent
		// deliveries of the same email (stalled-job reclaim while the first send
		// is still in flight) cannot both send. A crashed claim self-heals via the
		// 5-minute reclaim window; failed sends reset the status below.
		let claimedEmailRecord = false;
		if (body.emailRecordId) {
			const nowIso = new Date().toISOString();
			const reclaimBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
			const { data: claimed, error: claimError } = await (supabase.from('emails') as any)
				.update({ status: 'sending', updated_at: nowIso })
				.eq('id', body.emailRecordId)
				.not('status', 'in', '(sent,delivered,opened,clicked)')
				.or(`status.neq.sending,updated_at.lt.${reclaimBefore},updated_at.is.null`)
				.select('id')
				.maybeSingle();

			if (claimError) {
				// Fail open (previous behavior) — the SELECT-based idempotency check
				// above already ran; a claim error shouldn't drop the email.
				console.warn(
					'[NotificationEmailWebhook] Email claim failed, proceeding unclaimed',
					{
						emailRecordId: body.emailRecordId,
						error: claimError.message
					}
				);
			} else if (!claimed) {
				console.log(
					`[NotificationEmailWebhook] Email ${body.emailRecordId} already claimed/sent by another sender; skipping (delivery: ${body.deliveryId})`
				);
				return ApiResponse.success({
					success: true,
					messageId: null,
					emailId: body.emailRecordId,
					skipped: 'claimed_by_other_sender',
					duration: Date.now() - startTime
				});
			} else {
				claimedEmailRecord = true;
			}
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
			createdBy: body.recipientUserId,
			emailId: body.emailRecordId,
			trackingEnabled: !!body.trackingId,
			metadata: {
				category: isDailyBriefEvent ? 'daily_brief' : 'notification',
				...(isDailyBriefEvent ? { campaign_type: 'daily_brief' } : {}),
				created_by: body.recipientUserId,
				recipient_user_id: body.recipientUserId,
				delivery_id: body.deliveryId,
				event_id: body.eventId,
				event_type: body.eventType,
				brief_id: body.briefId,
				brief_date: body.briefDate,
				engagement_stage: body.engagementStage,
				notification_type: 'system',
				sent_via: 'webhook',
				// Preserve worker-generated tracking ID so the webhook send path
				// does not rotate tracking IDs and orphan existing tracked links/pixels.
				trackingId: body.trackingId,
				tracking_id: body.trackingId
			}
		});

		if (!result.success) {
			console.error('[NotificationEmailWebhook] Email send failed:', {
				deliveryId: body.deliveryId,
				error: result.error
			});

			// Release the claim so the notification worker's retry can send.
			if (claimedEmailRecord && body.emailRecordId) {
				await (supabase.from('emails') as any)
					.update({ status: 'failed', updated_at: new Date().toISOString() })
					.eq('id', body.emailRecordId)
					.eq('status', 'sending');
			}

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
