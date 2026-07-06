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

type DailyBriefEngagementStage = 'standard' | 'reengagement' | 'dormant';

const NOTIFICATION_EMAIL_SENDER_EMAIL = 'dj@build-os.com';
const NOTIFICATION_EMAIL_SENDER_NAME = 'DJ from BuildOS';

interface DailyBriefContentCandidate {
	executive_summary?: string | null;
	llm_analysis?: string | null;
	metadata?: unknown;
}

interface ExistingEmailRecord {
	id: string;
	status: string | null;
	tracking_id: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveDailyBriefEngagementStage(metadata: unknown): DailyBriefEngagementStage {
	if (!isRecord(metadata)) {
		return 'standard';
	}

	if (metadata.engagementStage === 'dormant') {
		return 'dormant';
	}

	if (metadata.engagementStage === 'reengagement' || metadata.isReengagement === true) {
		return 'reengagement';
	}

	return 'standard';
}

/**
 * executive_summary holds the ENTIRE assembled brief markdown, including the
 * `## Project Details` concatenation of every project brief. Emails must never
 * ship that tail: it can blow past Gmail's ~102KB clip (hiding the footer's
 * unsubscribe link and the tracking pixel) and is exactly the wall the
 * reengagement/dormant tiers exist to avoid.
 */
function stripProjectDetailsSection(briefMarkdown: string): string {
	const detailsIndex = briefMarkdown.indexOf('\n## Project Details');
	if (detailsIndex === -1) {
		return briefMarkdown;
	}
	return briefMarkdown.slice(0, detailsIndex).trimEnd();
}

function selectDailyBriefEmailContent(
	brief: DailyBriefContentCandidate,
	engagementStage: DailyBriefEngagementStage
): string {
	const executiveSummary = stripProjectDetailsSection(brief.executive_summary?.trim() || '');
	const llmAnalysis = brief.llm_analysis?.trim() || '';

	if (engagementStage === 'standard') {
		return executiveSummary || llmAnalysis;
	}

	return llmAnalysis || executiveSummary;
}

function getDailyBriefEmailSubject(
	dateFormatted: string,
	engagementStage: DailyBriefEngagementStage
): string {
	if (engagementStage === 'dormant') {
		return 'Still want BuildOS daily briefs?';
	}

	if (engagementStage === 'reengagement') {
		return 'A quick check-in on your BuildOS projects';
	}

	return `BuildOS Daily Brief - ${dateFormatted}`;
}

function getDailyBriefPrimaryActionLabel(engagementStage: DailyBriefEngagementStage): string {
	return engagementStage === 'standard' ? 'View in BuildOS →' : 'Resume in BuildOS →';
}

function isSentEmailStatus(status: string | null | undefined): boolean {
	return (
		status === 'sent' || status === 'delivered' || status === 'opened' || status === 'clicked'
	);
}

function getPostalAddress(): string | null {
	const postalAddress = process.env.PRIVATE_POSTAL_ADDRESS?.trim();
	return postalAddress || null;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function getPostalAddressHtml(): string {
	const postalAddress = getPostalAddress();
	if (!postalAddress) {
		return '';
	}

	return `
      <p style="font-size: 12px; color: #8C8B91; margin: 12px 0 0 0;">
        ${escapeHtml(postalAddress)}
      </p>
  `;
}

function getPostalAddressText(): string {
	const postalAddress = getPostalAddress();
	return postalAddress ? `\n\nBuildOS mailing address:\n${postalAddress}` : '';
}

function buildBriefUrl(baseUrl: string, briefDate: string | null | undefined): string {
	if (!briefDate) {
		return `${baseUrl}/projects`;
	}

	return `${baseUrl}/projects?briefDate=${encodeURIComponent(briefDate)}`;
}

function buildDailyBriefTextFooter(options: {
	content: string;
	briefUrl: string;
	managePreferencesUrl: string;
	unsubscribeUrl: string;
	primaryActionLabel: string;
}): string {
	return `${options.content.trimEnd()}

${options.primaryActionLabel}: ${options.briefUrl}
Manage preferences: ${options.managePreferencesUrl}
Turn off daily briefs: ${options.unsubscribeUrl}${getPostalAddressText()}`;
}

async function findExistingEmailForDelivery(
	deliveryId: string,
	emailLogger: Logger
): Promise<ExistingEmailRecord | null> {
	// ->> expression filter matches idx_emails_template_delivery_id
	const { data, error } = await (supabase.from('emails') as any)
		.select('id, status, tracking_id, sent_at, created_at')
		.eq('template_data->>delivery_id', deliveryId)
		.order('sent_at', { ascending: false, nullsFirst: false })
		.order('created_at', { ascending: false })
		.limit(1);

	if (error) {
		emailLogger.warn('Failed to look up existing email record for delivery', {
			notificationDeliveryId: deliveryId,
			error: error.message
		});
		return null;
	}

	const firstRecord = Array.isArray(data) ? data[0] : data;
	return firstRecord ?? null;
}

async function persistPendingEmailRecipient(options: {
	emailRecordId: string;
	recipientEmail: string;
	recipientUserId: string;
	recipientName: string | null | undefined;
	emailLogger: Logger;
}): Promise<void> {
	const { emailRecordId, recipientEmail, recipientUserId, recipientName, emailLogger } = options;

	const { data: existingRecipient, error: lookupError } = await supabase
		.from('email_recipients')
		.select('id')
		.eq('email_id', emailRecordId)
		.eq('recipient_email', recipientEmail)
		.maybeSingle();

	if (lookupError) {
		emailLogger.error('Failed to look up existing email recipient record', lookupError, {
			emailRecordId,
			recipientEmail
		});
	}

	if (existingRecipient?.id) {
		const { error: updateError } = await supabase
			.from('email_recipients')
			.update({
				recipient_id: recipientUserId,
				recipient_type: 'to',
				recipient_name: recipientName,
				status: 'pending',
				error_message: null,
				updated_at: new Date().toISOString()
			})
			.eq('id', existingRecipient.id);

		if (updateError) {
			emailLogger.error('Failed to update recipient record', updateError, {
				emailRecordId,
				recipientEmail
			});
		}

		return;
	}

	const { error: recipientError } = await supabase.from('email_recipients').insert({
		email_id: emailRecordId,
		recipient_email: recipientEmail,
		recipient_id: recipientUserId,
		recipient_type: 'to',
		recipient_name: recipientName,
		status: 'pending'
	});

	if (recipientError) {
		emailLogger.error('Failed to create recipient record', recipientError, {
			emailRecordId,
			recipientEmail
		});
	}
}

async function persistDeliveryEngagementStage(
	delivery: NotificationDelivery,
	engagementStage: DailyBriefEngagementStage,
	emailLogger: Logger
): Promise<void> {
	const existingPayload = isRecord(delivery.payload) ? delivery.payload : {};
	const { error } = await supabase
		.from('notification_deliveries')
		.update({
			payload: {
				...existingPayload,
				engagement_stage: engagementStage,
				engagementStage
			},
			updated_at: new Date().toISOString()
		})
		.eq('id', delivery.id);

	if (error) {
		emailLogger.error('Failed to persist daily brief engagement stage on delivery', error, {
			notificationDeliveryId: delivery.id,
			engagementStage
		});
	}
}

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

	// Inkprint Design System colors
	const inkprint = {
		accent: '#D96C1E', // warm orange-amber
		accentLight: '#FDF4ED',
		foreground: '#1A1A1D', // deep ink black
		mutedForeground: '#6F6E75', // warm gray
		background: '#FAF9F7', // warm off-white
		card: '#F5F4F0',
		border: '#DCD9D1',
		muted: '#EDEBE6'
	};

	const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: ${inkprint.foreground}; background-color: ${inkprint.background}; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: ${inkprint.card}; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(26, 26, 29, 0.08);">
    <!-- Header -->
    <div style="background-color: ${inkprint.foreground}; padding: 24px 32px; text-align: center;">
      <h1 style="color: ${inkprint.background}; margin: 0; font-size: 20px; font-weight: 600;">${title}</h1>
    </div>

    <!-- Content -->
    <div style="padding: 32px;">
      <div style="font-size: 16px; color: ${inkprint.mutedForeground}; margin-bottom: 20px; line-height: 1.6;">
        ${body}
      </div>

      ${
			actionUrl
				? `
      <div style="text-align: center; margin: 32px 0;">
        <a href="${actionUrl}"
           style="background-color: ${inkprint.accent};
                  color: ${inkprint.background};
                  padding: 12px 30px;
                  text-decoration: none;
                  border-radius: 6px;
                  display: inline-block;
                  font-weight: 600;
                  font-size: 16px;">
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

    <!-- Footer -->
    <div style="background-color: ${inkprint.muted}; padding: 20px 32px; text-align: center; border-top: 1px solid ${inkprint.border};">
      <p style="font-size: 14px; color: ${inkprint.mutedForeground}; margin: 0 0 8px 0;">This is an automated notification from BuildOS</p>
      <p style="font-size: 14px; margin: 0;">
        <a href="${baseUrl}/profile?tab=notifications" style="color: ${inkprint.accent}; text-decoration: none;">Manage notification preferences</a>
      </p>
      ${getPostalAddressHtml()}
    </div>
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
Manage your notification preferences: ${baseUrl}/profile?tab=notifications${getPostalAddressText()}
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
		const existingEmailRecord = await findExistingEmailForDelivery(delivery.id, emailLogger);

		if (isSentEmailStatus(existingEmailRecord?.status)) {
			emailLogger.info('Email already sent for notification delivery - reusing record', {
				notificationDeliveryId: delivery.id,
				emailRecordId: existingEmailRecord?.id,
				status: existingEmailRecord?.status
			});
			return {
				success: true,
				external_id: existingEmailRecord?.id
			};
		}

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
		const isDailyBriefEmail = eventType === 'brief.completed';
		const trackingId = existingEmailRecord?.tracking_id || crypto.randomUUID();
		const dailyBriefUnsubscribeUrl = `${baseUrl}/api/email-tracking/${trackingId}/unsubscribe`;
		const managePreferencesUrl = `${baseUrl}/profile?tab=notifications`;
		let dailyBriefId: string | null = null;
		let dailyBriefDate: string | null = null;
		let dailyBriefEngagementStage: DailyBriefEngagementStage = 'standard';

		if (isDailyBriefEmail) {
			const briefId = delivery.payload.data?.brief_id || delivery.payload.brief_id;
			const briefDate =
				delivery.payload.data?.brief_date ||
				delivery.payload.brief_date ||
				new Date().toISOString();
			dailyBriefId = briefId ?? null;
			dailyBriefDate = briefDate;
			const isOntologyBrief = Boolean(
				delivery.payload.is_ontology_brief || delivery.payload.data?.is_ontology_brief
			);

			if (briefId) {
				if (isOntologyBrief) {
					const { data: brief, error: briefError } = await supabase
						.from('ontology_daily_briefs')
						.select('executive_summary, llm_analysis, brief_date, metadata')
						.eq('id', briefId)
						.single();

					if (briefError || !brief) {
						emailLogger.warn(
							'Failed to fetch ontology brief for email - falling back to notification template',
							{
								briefId,
								error: briefError?.message
							}
						);
						const emailContent = formatEmailTemplate(delivery);
						html = emailContent.html;
						text = emailContent.text;
						subject = delivery.payload.title;
					} else {
						dailyBriefEngagementStage = resolveDailyBriefEngagementStage(
							brief.metadata
						);
						const briefContent = selectDailyBriefEmailContent(
							brief,
							dailyBriefEngagementStage
						);

						if (!briefContent) {
							emailLogger.warn(
								'Ontology brief has no content - falling back to notification template',
								{
									briefId
								}
							);
							const emailContent = formatEmailTemplate(delivery);
							html = emailContent.html;
							text = emailContent.text;
							subject = delivery.payload.title;
						} else {
							const { renderMarkdown } = await import('../../lib/utils/markdown.js');
							const contentHtml = renderMarkdown(briefContent);

							const dateFormatted = new Date(
								brief.brief_date || briefDate
							).toLocaleDateString('en-US', {
								timeZone: 'UTC',
								weekday: 'long',
								year: 'numeric',
								month: 'long',
								day: 'numeric'
							});

							subject = getDailyBriefEmailSubject(
								dateFormatted,
								dailyBriefEngagementStage
							);
							const primaryActionLabel =
								getDailyBriefPrimaryActionLabel(dailyBriefEngagementStage);
							const briefUrl = buildBriefUrl(
								baseUrl,
								brief.brief_date || dailyBriefDate || briefDate
							);

							const fullContent = `
	            <div style="margin: 20px 0;">
	              ${contentHtml}
            </div>

            <hr style="border: none; border-top: 1px solid #DCD9D1; margin: 32px 0;">

	            <div style="text-align: center; margin-top: 24px;">
	              <a href="${briefUrl}" style="color: #D96C1E; text-decoration: none; font-size: 14px;">${primaryActionLabel}</a>
	              <span style="color: #8C8B91; margin: 0 8px;">|</span>
	              <a href="${managePreferencesUrl}" style="color: #D96C1E; text-decoration: none; font-size: 14px;">Manage Preferences</a>
              <span style="color: #8C8B91; margin: 0 8px;">|</span>
              <a href="${dailyBriefUnsubscribeUrl}" style="color: #6F6E75; text-decoration: none; font-size: 14px;">Turn off daily briefs</a>
              ${getPostalAddressHtml()}
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

							text = buildDailyBriefTextFooter({
								content: briefContent,
								briefUrl,
								managePreferencesUrl,
								unsubscribeUrl: dailyBriefUnsubscribeUrl,
								primaryActionLabel
							});
						}
					}
				} else {
					// Fetch the full brief with LLM analysis
					const { data: brief, error: briefError } = await supabase
						.from('ontology_daily_briefs')
						.select('*')
						.eq('id', briefId)
						.single();

					if (briefError || !brief) {
						emailLogger.warn(
							'Failed to fetch brief for email - falling back to notification template',
							{
								briefId,
								error: briefError?.message
							}
						);
						const emailContent = formatEmailTemplate(delivery);
						html = emailContent.html;
						text = emailContent.text;
						subject = delivery.payload.title;
					} else {
						// Use the full brief content (LLM analysis or summary)
						dailyBriefEngagementStage = resolveDailyBriefEngagementStage(
							brief.metadata
						);
						const briefContent = selectDailyBriefEmailContent(
							brief,
							dailyBriefEngagementStage
						);

						if (!briefContent) {
							emailLogger.warn(
								'Brief has no content - falling back to notification template',
								{
									briefId
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

							const dateFormatted = new Date(briefDate).toLocaleDateString('en-US', {
								timeZone: 'UTC',
								weekday: 'long',
								year: 'numeric',
								month: 'long',
								day: 'numeric'
							});

							subject = getDailyBriefEmailSubject(
								dateFormatted,
								dailyBriefEngagementStage
							);
							const primaryActionLabel =
								getDailyBriefPrimaryActionLabel(dailyBriefEngagementStage);
							const briefUrl = buildBriefUrl(baseUrl, dailyBriefDate || briefDate);

							// Inkprint Design System colors
							const fullContent = `
            <div style="margin: 20px 0;">
              ${contentHtml}
            </div>

            <hr style="border: none; border-top: 1px solid #DCD9D1; margin: 32px 0;">

	            <div style="text-align: center; margin-top: 24px;">
	              <a href="${briefUrl}" style="color: #D96C1E; text-decoration: none; font-size: 14px;">${primaryActionLabel}</a>
	              <span style="color: #8C8B91; margin: 0 8px;">|</span>
	              <a href="${managePreferencesUrl}" style="color: #D96C1E; text-decoration: none; font-size: 14px;">Manage Preferences</a>
              <span style="color: #8C8B91; margin: 0 8px;">|</span>
              <a href="${dailyBriefUnsubscribeUrl}" style="color: #6F6E75; text-decoration: none; font-size: 14px;">Turn off daily briefs</a>
              ${getPostalAddressHtml()}
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

							text = buildDailyBriefTextFooter({
								content: briefContent,
								briefUrl,
								managePreferencesUrl,
								unsubscribeUrl: dailyBriefUnsubscribeUrl,
								primaryActionLabel
							});
						}
					}
				}
			} else {
				const emailContent = formatEmailTemplate(delivery);
				html = emailContent.html;
				text = emailContent.text;
				subject = delivery.payload.title;
			}
		} else {
			// Use standard notification template for other events
			const emailContent = formatEmailTemplate(delivery);
			html = emailContent.html;
			text = emailContent.text;
			subject = delivery.payload.title;
		}

		if (isDailyBriefEmail) {
			await persistDeliveryEngagementStage(delivery, dailyBriefEngagementStage, emailLogger);
		}

		// Rewrite links for click tracking
		const htmlWithTrackedLinks = rewriteLinksForTracking(html, trackingId);

		// Add tracking pixel to HTML
		const trackingPixel = `<img src="${baseUrl}/api/email-tracking/${trackingId}" width="1" height="1" style="display:none;" alt="" />`;
		const htmlWithTracking = htmlWithTrackedLinks.replace('</body>', `${trackingPixel}</body>`);

		const emailRecordPayload = {
			created_by: delivery.recipient_user_id,
			from_email: NOTIFICATION_EMAIL_SENDER_EMAIL,
			from_name: NOTIFICATION_EMAIL_SENDER_NAME,
			subject,
			content: htmlWithTracking,
			category: isDailyBriefEmail ? 'daily_brief' : 'notification',
			status: 'scheduled',
			tracking_enabled: true,
			tracking_id: trackingId,
			template_data: {
				delivery_id: delivery.id,
				event_id: delivery.event_id,
				event_type: delivery.payload.event_type,
				brief_id: dailyBriefId,
				brief_date: dailyBriefDate,
				engagement_stage: dailyBriefEngagementStage,
				user_id: delivery.recipient_user_id,
				category: isDailyBriefEmail ? 'daily_brief' : 'notification'
			},
			updated_at: new Date().toISOString()
		};

		const emailRecordResult = existingEmailRecord?.id
			? await supabase
					.from('emails')
					.update(emailRecordPayload)
					.eq('id', existingEmailRecord.id)
					.select()
					.single()
			: await supabase.from('emails').insert(emailRecordPayload).select().single();

		const emailRecord = emailRecordResult.data;
		const emailError = emailRecordResult.error;

		if (emailError) {
			return {
				success: false,
				error: `Failed to persist email record: ${emailError.message}`
			};
		}

		if (!emailRecord?.id) {
			return {
				success: false,
				error: 'Failed to persist email record: missing email id'
			};
		}

		await persistPendingEmailRecipient({
			emailRecordId: emailRecord.id,
			recipientEmail: user.email,
			recipientUserId: delivery.recipient_user_id,
			recipientName: user.name,
			emailLogger
		});

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
						eventType: delivery.payload.event_type,
						briefId: dailyBriefId,
						briefDate: dailyBriefDate,
						engagementStage: dailyBriefEngagementStage
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
