// apps/web/src/lib/services/email-service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { PUBLIC_APP_URL } from '$env/static/public';

import {
	createGmailTransporter,
	getSenderByType,
	type EmailSender,
	type SenderType
} from '$lib/utils/email-config';
import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate';
import { ErrorLoggerService } from './errorLogger.service';

export interface EmailData {
	to: string;
	subject: string;
	body: string;
	html?: string;
	cc?: string[];
	bcc?: string[];
	replyTo?: string;
	from?: SenderType;
	metadata?: Record<string, any>;
	/** Associate the send with a user for logging + rate limiting */
	userId?: string | null;
	/** Override the creator stored in the rich email tables */
	createdBy?: string;
	/** Disable open tracking + pixel generation when false */
	trackingEnabled?: boolean;
	/** Update an existing emails.id instead of creating a fresh row */
	emailId?: string;
}

export class EmailService {
	private errorLogger: ErrorLoggerService;

	constructor(private supabase: SupabaseClient) {
		this.errorLogger = ErrorLoggerService.getInstance(supabase);
	}

	/**
	 * Send an email through Gmail with database + open tracking.
	 */
	async sendEmail(
		data: EmailData
	): Promise<{ success: boolean; messageId?: string; error?: string }> {
		const sentAt = new Date().toISOString();
		const senderType = data.from || 'dj';
		const trackingEnabled = data.trackingEnabled ?? true;
		const metadataTrackingId = this.extractTrackingIdFromMetadata(data.metadata);
		const htmlTrackingId = this.extractTrackingIdFromHtml(data.html);
		if (
			trackingEnabled &&
			metadataTrackingId &&
			htmlTrackingId &&
			metadataTrackingId !== htmlTrackingId
		) {
			console.warn('EmailService tracking ID mismatch between metadata and HTML', {
				to: data.to,
				subject: data.subject,
				metadataTrackingId,
				htmlTrackingId
			});
		}
		const trackingId = trackingEnabled
			? metadataTrackingId || htmlTrackingId || randomUUID()
			: null;
		const sender = getSenderByType(senderType);
		const baseUrl = PUBLIC_APP_URL || (dev ? 'http://localhost:5173' : 'https://build-os.com');
		const isLifecycleEmail = this.isLifecycleEmail(data.metadata);
		const unsubscribeUrl =
			isLifecycleEmail && trackingId
				? `${baseUrl}/api/email-tracking/${trackingId}/unsubscribe`
				: null;
		const sendMetadata = unsubscribeUrl
			? {
					...data.metadata,
					unsubscribe_url: unsubscribeUrl
				}
			: data.metadata;
		const trackingPixel = trackingId
			? `<img src="${baseUrl}/api/email-tracking/${trackingId}" width="1" height="1" style="display:none;" alt="" />`
			: '';

		const transporter = createGmailTransporter(senderType);
		const textBody = this.composeTextBody(data.body, unsubscribeUrl);
		const htmlBody = this.composeHtmlBody({
			subject: data.subject,
			html: data.html,
			textBody,
			trackingPixel,
			trackingId,
			unsubscribeUrl
		});
		const replyTo = data.replyTo ?? (isLifecycleEmail ? sender.email : undefined);
		const headers = this.buildLifecycleHeaders({
			sender,
			unsubscribeUrl
		});

		try {
			const info = await transporter.sendMail({
				from: `${sender.name || 'BuildOS'} <${sender.email}>`,
				to: data.to,
				subject: data.subject,
				text: textBody,
				html: htmlBody,
				cc: data.cc?.join(','),
				bcc: data.bcc?.join(','),
				replyTo,
				headers
			});

			try {
				const emailRecordId = await this.logRichEmailData({
					recipientEmail: data.to,
					recipientId: data.userId ?? null,
					subject: data.subject,
					html: htmlBody,
					sentAt,
					trackingEnabled,
					trackingId,
					emailId: data.emailId,
					createdBy: data.createdBy,
					metadata: sendMetadata,
					sender
				});

				await this.supabase.from('email_logs').insert({
					to_email: data.to,
					subject: data.subject,
					body: textBody,
					cc: data.cc,
					bcc: data.bcc,
					reply_to: replyTo,
					status: 'sent',
					sent_at: sentAt,
					user_id: data.userId ?? null,
					metadata: {
						...sendMetadata,
						message_id: info.messageId,
						sender_type: senderType,
						tracking_id: trackingId,
						email_id: emailRecordId,
						user_id: data.userId ?? null
					}
				});
			} catch (loggingError) {
				console.error('Email sent but failed to persist tracking data:', loggingError);
				await this.errorLogger.logError(loggingError, {
					endpoint: '/api/email/send',
					httpMethod: 'POST',
					userId: data.userId ?? undefined,
					operationType: 'persist_sent_email',
					metadata: {
						emailAlreadySent: true,
						recipientEmail: data.to,
						subject: data.subject,
						senderType,
						trackingEnabled,
						messageId: info.messageId
					}
				});
			}

			console.log('Email sent:', {
				to: data.to,
				subject: data.subject,
				messageId: info.messageId,
				trackingId
			});

			return {
				success: true,
				messageId: info.messageId
			};
		} catch (error) {
			console.error('Error sending email:', error);

			const errorMessage = error instanceof Error ? error.message : 'Unknown error';

			// Log to error tracking system
			await this.errorLogger.logAPIError(
				error,
				'/api/email/send',
				'POST',
				data.userId ?? undefined,
				{
					operation: 'sendEmail',
					errorType: 'email_delivery_failure',
					recipientEmail: data.to,
					subject: data.subject,
					senderType,
					trackingEnabled,
					hasHtml: !!data.html,
					ccCount: data.cc?.length || 0,
					bccCount: data.bcc?.length || 0
				}
			);

			await this.supabase.from('email_logs').insert({
				to_email: data.to,
				subject: data.subject,
				body: textBody,
				cc: data.cc,
				bcc: data.bcc,
				reply_to: replyTo,
				status: 'failed',
				error_message: errorMessage,
				sent_at: sentAt,
				user_id: data.userId ?? null,
				metadata: {
					...sendMetadata,
					tracking_id: trackingId,
					sender_type: senderType,
					user_id: data.userId ?? null
				}
			});

			await this.notifyEmailDeliveryFailure({
				errorMessage,
				recipientEmail: data.to,
				subject: data.subject,
				senderType,
				userId: data.userId ?? null,
				trackingId,
				metadata: sendMetadata
			});

			return {
				success: false,
				error: errorMessage
			};
		}
	}

	private composeHtmlBody({
		subject,
		html,
		textBody,
		trackingPixel,
		trackingId,
		unsubscribeUrl
	}: {
		subject: string;
		html?: string;
		textBody: string;
		trackingPixel: string;
		trackingId: string | null;
		unsubscribeUrl: string | null;
	}): string {
		if (html) {
			// Rewrite links for click tracking if tracking is enabled
			let processedHtml = this.appendLifecycleHtmlFooter(html, unsubscribeUrl);
			if (trackingId) {
				processedHtml = this.rewriteLinksForTracking(processedHtml, trackingId);
			}
			// Avoid injecting a duplicate tracking pixel when caller-provided HTML already includes it.
			if (trackingPixel && trackingId && this.hasTrackingPixel(processedHtml, trackingId)) {
				return processedHtml;
			}
			return trackingPixel
				? this.appendTrackingPixel(processedHtml, trackingPixel)
				: processedHtml;
		}

		const content = textBody.replace(/\n/g, '<br>');
		return generateMinimalEmailHTML({
			subject,
			content,
			trackingPixel
		});
	}

	private composeTextBody(textBody: string, unsubscribeUrl: string | null): string {
		if (!unsubscribeUrl) {
			return textBody;
		}

		if (textBody.includes(unsubscribeUrl)) {
			return textBody;
		}

		return `${textBody.trimEnd()}

You can opt out of these BuildOS emails here:
${unsubscribeUrl}`;
	}

	private rewriteLinksForTracking(html: string, trackingId: string): string {
		const baseUrl = PUBLIC_APP_URL || (dev ? 'http://localhost:5173' : 'https://build-os.com');

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

	private appendTrackingPixel(html: string, trackingPixel: string): string {
		if (!trackingPixel) {
			return html;
		}

		if (html.includes('</body>')) {
			return html.replace('</body>', `${trackingPixel}</body>`);
		}

		return `${html}${trackingPixel}`;
	}

	private appendLifecycleHtmlFooter(html: string, unsubscribeUrl: string | null): string {
		if (!unsubscribeUrl || html.includes(unsubscribeUrl)) {
			return html;
		}

		const footer = `
			<hr style="border: 0; border-top: 1px solid #E5E0DA; margin: 28px 0 16px;" />
			<p style="font-size: 12px; line-height: 1.5; color: #6B625C;">
				You can opt out of these BuildOS emails
				<a href="${this.escapeHtml(unsubscribeUrl)}" style="color: #6B625C;">here</a>.
			</p>
		`;

		if (html.includes('</body>')) {
			return html.replace('</body>', `${footer}</body>`);
		}

		return `${html}${footer}`;
	}

	private extractTrackingIdFromMetadata(metadata?: Record<string, any>): string | null {
		if (!metadata || typeof metadata !== 'object') {
			return null;
		}

		const trackingIdValue = metadata.trackingId ?? metadata.tracking_id;
		if (typeof trackingIdValue !== 'string') {
			return null;
		}

		const trackingId = trackingIdValue.trim();
		return trackingId.length > 0 ? trackingId : null;
	}

	private extractTrackingIdFromHtml(html?: string): string | null {
		if (typeof html !== 'string' || html.length === 0) {
			return null;
		}

		const match = html.match(/\/api\/email-tracking\/([a-zA-Z0-9-]+)/i);
		if (!match?.[1]) {
			return null;
		}

		return match[1];
	}

	private hasTrackingPixel(html: string, trackingId: string): boolean {
		const escapedTrackingId = trackingId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		return new RegExp(
			`<img\\s+[^>]*src=["'][^"']*/api/email-tracking/${escapedTrackingId}(?:["'?/])`,
			'i'
		).test(html);
	}

	private isLifecycleEmail(metadata?: Record<string, any>): boolean {
		return (
			metadata?.campaign_type === 'lifecycle' ||
			metadata?.category === 'welcome_sequence' ||
			metadata?.campaign === 'welcome-sequence'
		);
	}

	private buildLifecycleHeaders({
		sender,
		unsubscribeUrl
	}: {
		sender: EmailSender;
		unsubscribeUrl: string | null;
	}): Record<string, string> | undefined {
		if (!unsubscribeUrl) {
			return undefined;
		}

		return {
			'List-ID': 'BuildOS <emails.build-os.com>',
			'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:${sender.email}?subject=unsubscribe>`,
			'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
		};
	}

	private escapeHtml(value: string): string {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
	}

	private async notifyEmailDeliveryFailure({
		errorMessage,
		recipientEmail,
		subject,
		senderType,
		userId,
		trackingId,
		metadata
	}: {
		errorMessage: string;
		recipientEmail: string;
		subject: string;
		senderType: SenderType;
		userId: string | null;
		trackingId: string | null;
		metadata?: Record<string, any>;
	}): Promise<void> {
		const webhookUrl = env.PRIVATE_ALERTS_SLACK_WEBHOOK_URL;
		if (!webhookUrl) {
			return;
		}

		try {
			const response = await fetch(webhookUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					text: `BuildOS email delivery failure: ${subject}`,
					blocks: [
						{
							type: 'section',
							text: {
								type: 'mrkdwn',
								text: '*BuildOS email delivery failure*'
							}
						},
						{
							type: 'section',
							fields: [
								{
									type: 'mrkdwn',
									text: `*Recipient*\n${recipientEmail}`
								},
								{
									type: 'mrkdwn',
									text: `*Sender*\n${senderType}`
								},
								{
									type: 'mrkdwn',
									text: `*Subject*\n${subject}`
								},
								{
									type: 'mrkdwn',
									text: `*Campaign*\n${metadata?.campaign ?? 'unknown'}`
								},
								{
									type: 'mrkdwn',
									text: `*User ID*\n${userId ?? 'unknown'}`
								},
								{
									type: 'mrkdwn',
									text: `*Tracking ID*\n${trackingId ?? 'none'}`
								}
							]
						},
						{
							type: 'section',
							text: {
								type: 'mrkdwn',
								text: `*Error*\n${errorMessage.slice(0, 1500)}`
							}
						}
					]
				})
			});

			if (!response.ok) {
				console.error('Failed to send email delivery failure alert:', {
					status: response.status,
					statusText: response.statusText
				});
			}
		} catch (alertError) {
			console.error('Failed to send email delivery failure alert:', alertError);
		}
	}

	private async logRichEmailData({
		recipientEmail,
		recipientId,
		subject,
		html,
		sentAt,
		trackingEnabled,
		trackingId,
		emailId,
		createdBy,
		metadata,
		sender
	}: {
		recipientEmail: string;
		recipientId: string | null;
		subject: string;
		html: string;
		sentAt: string;
		trackingEnabled: boolean;
		trackingId: string | null;
		emailId?: string;
		createdBy?: string;
		metadata?: Record<string, any>;
		sender: EmailSender;
	}): Promise<string | null> {
		const category = typeof metadata?.category === 'string' ? metadata?.category : null;

		const baseRecord = {
			subject,
			content: html,
			from_email: sender.email,
			from_name: sender.name || sender.email,
			status: 'sent',
			sent_at: sentAt,
			tracking_enabled: trackingEnabled,
			tracking_id: trackingId,
			template_data: metadata ?? null,
			category,
			created_by:
				createdBy || metadata?.created_by || metadata?.sent_by_admin || 'automated-service',
			updated_at: sentAt
		};

		try {
			if (emailId) {
				await this.supabase.from('emails').update(baseRecord).eq('id', emailId);
				await this.persistRecipient(emailId, {
					recipientEmail,
					recipientId,
					sentAt,
					errorMessage: null
				});
				return emailId;
			}

			const { data: emailInsert } = await this.supabase
				.from('emails')
				.insert(baseRecord)
				.select('id')
				.single();

			const newEmailId = emailInsert?.id || null;

			if (newEmailId) {
				await this.persistRecipient(newEmailId, {
					recipientEmail,
					recipientId,
					sentAt,
					errorMessage: null
				});
			}

			return newEmailId;
		} catch (error) {
			console.error('Failed to log rich email data:', error);
			await this.errorLogger.logDatabaseError(
				error,
				emailId ? 'UPDATE' : 'INSERT',
				'emails',
				recipientId || undefined,
				{
					operation: 'logRichEmailData',
					emailId: emailId || 'new',
					recipientEmail,
					subject,
					trackingEnabled,
					category
				}
			);
			return emailId || null;
		}
	}

	private async persistRecipient(
		emailId: string,
		options: {
			recipientEmail: string;
			recipientId: string | null;
			sentAt: string;
			errorMessage: string | null;
		}
	): Promise<void> {
		const { recipientEmail, recipientId, sentAt, errorMessage } = options;
		const status = errorMessage ? 'failed' : 'sent';
		let existing: { id: string } | null = null;

		try {
			const { data } = await this.supabase
				.from('email_recipients')
				.select('id')
				.eq('email_id', emailId)
				.eq('recipient_email', recipientEmail)
				.maybeSingle();

			existing = data;

			if (existing?.id) {
				await this.supabase
					.from('email_recipients')
					.update({
						status,
						sent_at: errorMessage ? null : sentAt,
						error_message: errorMessage,
						updated_at: sentAt
					})
					.eq('id', existing.id);
				return;
			}

			await this.supabase.from('email_recipients').insert({
				email_id: emailId,
				recipient_email: recipientEmail,
				recipient_id: recipientId,
				recipient_type: 'custom',
				status,
				sent_at: errorMessage ? null : sentAt,
				error_message: errorMessage
			});
		} catch (error) {
			console.error('Failed to persist email recipient:', error);
			await this.errorLogger.logDatabaseError(
				error,
				existing?.id ? 'UPDATE' : 'INSERT',
				'email_recipients',
				recipientId || undefined,
				{
					operation: 'persistRecipient',
					emailId,
					recipientEmail,
					status,
					hasExistingRecord: !!existing?.id
				}
			);
		}
	}

	/**
	 * Send a templated email by replacing token placeholders.
	 */
	async sendTemplatedEmail(
		to: string,
		templateId: string,
		variables: Record<string, string>
	): Promise<void> {
		const { data: template } = await this.supabase
			.from('email_templates')
			.select('subject, body')
			.eq('id', templateId)
			.single();

		if (!template) {
			throw new Error(`Email template ${templateId} not found`);
		}

		let subject = template.subject;
		let body = template.body;

		Object.entries(variables).forEach(([key, value]) => {
			const regex = new RegExp(`{{${key}}}`, 'g');
			subject = subject.replace(regex, value);
			body = body.replace(regex, value);
		});

		await this.sendEmail({ to, subject, body });
	}

	async getUserEmailLogs(userId: string, limit = 50): Promise<any[]> {
		const { data } = await this.supabase
			.from('email_logs')
			.select('*')
			.eq('user_id', userId)
			.order('sent_at', { ascending: false })
			.limit(limit);

		return data || [];
	}
}
