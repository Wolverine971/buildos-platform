// apps/worker/src/workers/notification/emailAdapter.ts
/**
 * Email Adapter for Notification System
 *
 * Sends notification emails via existing email infrastructure
 */

import { createServiceClient } from '@buildos/supabase-client';
import type { NotificationDelivery } from '@buildos/shared-types';
import type { Logger } from '@buildos/shared-utils';
import { checkUserPreferences } from './preferenceChecker.js';

const supabase = createServiceClient();

export interface DeliveryResult {
	success: boolean;
	external_id?: string;
	error?: string;
}

/**
 * Rewrite links in HTML for click tracking
 */
function rewriteLinksForTracking(html: string, trackingId: string): string {
	const baseUrl = (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim();

	// Rewrite all <a href="..."> tags to go through click tracking
	return html.replace(
		/<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
		(match, before, url, after) => {
			// Skip if it's already a tracking link or an anchor link
			if (url.startsWith('#') || url.includes('/api/email-tracking/')) {
				return match;
			}

			// Encode the destination URL
			const encodedUrl = encodeURIComponent(url);
			const trackingUrl = `${baseUrl}/api/email-tracking/${trackingId}/click?url=${encodedUrl}`;

			return `<a ${before}href="${trackingUrl}"${after}>`;
		}
	);
}

/**
 * Format notification payload as email HTML
 * Note: payload should have title and body from enrichDeliveryPayload, but we validate for safety
 */
function formatEmailTemplate(delivery: NotificationDelivery): {
	html: string;
	text: string;
} {
	const { payload } = delivery;
	const baseUrl = (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim();

	// Defensive validation - ensure required fields exist
	const title = payload.title || 'Notification';
	const body = payload.body || '';
	const actionUrl = payload.action_url || null;
	const imageUrl = payload.image_url || null;

	const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1A1A1D; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">${title}</h1>
  </div>

  <div style="background: #fff; padding: 30px; border: 1px solid #e1e8ed; border-top: none; border-radius: 0 0 10px 10px;">
    <div style="font-size: 16px; color: #555; margin-bottom: 20px;">
      ${body}
    </div>

    ${
		actionUrl
			? `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${actionUrl}"
           style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                  padding: 12px 30px;
                  text-decoration: none;
                  border-radius: 6px;
                  display: inline-block;
                  font-weight: 600;">
          View Details
        </a>
      </div>
    `
			: ''
	}

    ${
		imageUrl
			? `
      <div style="margin: 20px 0;">
        <img src="${imageUrl}" alt="" style="max-width: 100%; height: auto; border-radius: 6px;">
      </div>
    `
			: ''
	}
  </div>

  <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
    <p>This is an automated notification from BuildOS</p>
    <p>
      <a href="${baseUrl}/profile?tab=notifications" style="color: #667eea;">Manage notification preferences</a>
    </p>
  </div>
</body>
</html>
  `.trim();

	const text = `
${title}

${body}

${actionUrl ? `View details: ${actionUrl}` : ''}

---
This is an automated notification from BuildOS
Manage your notification preferences: ${baseUrl}/profile?tab=notifications
  `.trim();

	return { html, text };
}

/**
 * Send email notification via existing email infrastructure
 */
export async function sendEmailNotification(
	delivery: NotificationDelivery,
	jobLogger: Logger
): Promise<DeliveryResult> {
	const emailLogger = jobLogger.child('email');

	try {
		emailLogger.debug('Sending email notification', {
			notificationDeliveryId: delivery.id,
			recipientUserId: delivery.recipient_user_id
		});

		// ✅ DOUBLE-CHECK USER PREFERENCES
		// This is a safety check in case preferences changed between worker check and adapter execution
		const eventType = delivery.payload.event_type || 'unknown';
		const baseUrl = (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim();
		const prefCheck = await checkUserPreferences(
			delivery.recipient_user_id,
			eventType,
			'email',
			emailLogger
		);

		if (!prefCheck.allowed) {
			emailLogger.info('Email notification cancelled - user preferences do not allow', {
				reason: prefCheck.reason,
				eventType
			});
			return {
				success: false,
				error: `Cancelled: ${prefCheck.reason}`
			};
		}

		// Get user email
		const { data: user, error: userError } = await supabase
			.from('users')
			.select('email, name')
			.eq('id', delivery.recipient_user_id)
			.single();

		if (userError || !user?.email) {
			emailLogger.warn('User email not found', {
				notificationDeliveryId: delivery.id,
				recipientUserId: delivery.recipient_user_id,
				error: userError?.message
			});
			return {
				success: false,
				error: 'User email not found'
			};
		}

		// Format email content - special handling for brief.completed events
		let html: string;
		let text: string;
		let subject: string;

		if (eventType === 'brief.completed' && delivery.payload.data?.brief_id) {
			// Fetch the full brief with LLM analysis
			const { data: brief, error: briefError } = await supabase
				.from('daily_briefs')
				.select('*')
				.eq('id', delivery.payload.data?.brief_id)
				.single();

			if (briefError || !brief) {
				emailLogger.warn(
					'Failed to fetch brief for email - falling back to notification template',
					{
						briefId: delivery.payload.data?.brief_id,
						error: briefError?.message
					}
				);
				const emailContent = formatEmailTemplate(delivery);
				html = emailContent.html;
				text = emailContent.text;
				subject = delivery.payload.title;
			} else {
				// Use the full brief content (LLM analysis or summary)
				const briefContent = brief.llm_analysis || brief.summary_content || '';

				if (!briefContent) {
					emailLogger.warn(
						'Brief has no content - falling back to notification template',
						{
							briefId: delivery.payload.data?.brief_id
						}
					);
					const emailContent = formatEmailTemplate(delivery);
					html = emailContent.html;
					text = emailContent.text;
					subject = delivery.payload.title;
				} else {
					// Format the full brief email (matching webhook format)
					const { renderMarkdown } = await import('../../lib/utils/markdown.js');
					const contentHtml = renderMarkdown(briefContent);

					const briefDate = delivery.payload.data?.brief_date || new Date().toISOString();
					const dateFormatted = new Date(briefDate).toLocaleDateString('en-US', {
						weekday: 'long',
						year: 'numeric',
						month: 'long',
						day: 'numeric'
					});

					subject = `BuildOS Daily Brief - ${dateFormatted}`;

					// Inkprint Design System colors
					const fullContent = `
            <div style="margin: 20px 0;">
              ${contentHtml}
            </div>

            <hr style="border: none; border-top: 1px solid #DCD9D1; margin: 32px 0;">

            <div style="text-align: center; margin-top: 24px;">
              <a href="${baseUrl}/projects?briefDate=${delivery.payload.data?.brief_date || ''}" style="color: #D96C1E; text-decoration: none; font-size: 14px;">View in BuildOS →</a>
              <span style="color: #8C8B91; margin: 0 8px;">|</span>
              <a href="${baseUrl}/profile?tab=notifications" style="color: #D96C1E; text-decoration: none; font-size: 14px;">Manage Preferences</a>
            </div>
          `;

					html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1A1A1D; max-width: 600px; margin: 0 auto; padding: 20px;">
  ${fullContent}
</body>
</html>
          `.trim();

					text = briefContent; // Plain text version
				}
			}
		} else {
			// Use standard notification template for other events
			const emailContent = formatEmailTemplate(delivery);
			html = emailContent.html;
			text = emailContent.text;
			subject = delivery.payload.title;
		}

		// Generate tracking ID
		const trackingId = crypto.randomUUID();

		// Rewrite links for click tracking
		const htmlWithTrackedLinks = rewriteLinksForTracking(html, trackingId);

		// Add tracking pixel to HTML
		const trackingPixel = `<img src="${baseUrl}/api/email-tracking/${trackingId}" width="1" height="1" style="display:none;" alt="" />`;
		const htmlWithTracking = htmlWithTrackedLinks.replace('</body>', `${trackingPixel}</body>`);

		// Create email record
		const { data: emailRecord, error: emailError } = await supabase
			.from('emails')
			.insert({
				created_by: delivery.recipient_user_id,
				from_email: 'noreply@build-os.com',
				from_name: 'BuildOS',
				subject,
				content: htmlWithTracking,
				category: 'notification',
				status: 'scheduled',
				tracking_enabled: true,
				tracking_id: trackingId,
				template_data: {
					delivery_id: delivery.id,
					event_id: delivery.event_id,
					event_type: delivery.payload.event_type
				}
			})
			.select()
			.single();

		if (emailError) {
			return {
				success: false,
				error: `Failed to create email record: ${emailError.message}`
			};
		}

		// Create recipient record
		const { error: recipientError } = await supabase.from('email_recipients').insert({
			email_id: emailRecord.id,
			recipient_email: user.email,
			recipient_type: 'to',
			recipient_name: user.name,
			status: 'pending'
		});

		if (recipientError) {
			emailLogger.error('Failed to create recipient record', recipientError, {
				emailRecordId: emailRecord.id,
				recipientEmail: user.email
			});
		}

		// Send email immediately via webhook to web app
		const webhookUrl = (process.env.PUBLIC_APP_URL || 'https://build-os.com').trim();
		const webhookSecret = process.env.PRIVATE_BUILDOS_WEBHOOK_SECRET;

		if (!webhookSecret) {
			emailLogger.error(
				'PRIVATE_BUILDOS_WEBHOOK_SECRET not configured - cannot send notification emails',
				undefined,
				{
					notificationDeliveryId: delivery.id
				}
			);
			return {
				success: false,
				error: 'Webhook secret not configured'
			};
		}

		try {
			const webhookResponse = await fetch(
				`${webhookUrl}/api/webhooks/send-notification-email`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${webhookSecret}`
					},
					body: JSON.stringify({
						recipientEmail: user.email,
						recipientName: user.name,
						recipientUserId: delivery.recipient_user_id,
						subject,
						htmlContent: htmlWithTracking,
						textContent: text,
						trackingId,
						emailRecordId: emailRecord.id,
						deliveryId: delivery.id,
						eventId: delivery.event_id,
						eventType: delivery.payload.event_type
					})
				}
			);

			if (!webhookResponse.ok) {
				const errorData = (await webhookResponse.json().catch(() => ({}))) as {
					error?: string;
				};
				throw new Error(errorData.error || `Webhook returned ${webhookResponse.status}`);
			}

			const webhookResult = (await webhookResponse.json()) as {
				messageId?: string;
			};

			emailLogger.info('Email sent successfully via webhook', {
				emailRecordId: emailRecord.id,
				notificationDeliveryId: delivery.id,
				messageId: webhookResult.messageId,
				recipientEmail: user.email
			});

			return {
				success: true,
				external_id: emailRecord.id
			};
		} catch (webhookError: any) {
			emailLogger.error('Failed to send email via webhook', webhookError, {
				emailRecordId: emailRecord.id,
				notificationDeliveryId: delivery.id
			});
			return {
				success: false,
				error: `Webhook error: ${webhookError.message}`
			};
		}
	} catch (error: any) {
		emailLogger.error('Failed to send email notification', error, {
			notificationDeliveryId: delivery.id,
			recipientUserId: delivery.recipient_user_id
		});
		return {
			success: false,
			error: error.message || 'Unknown error sending email'
		};
	}
}
