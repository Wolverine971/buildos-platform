// apps/web/src/lib/services/email-service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

import { dev } from '$app/environment';
import { PUBLIC_APP_URL } from '$env/static/public';

import {
	createGmailTransporter,
	getSenderByType,
	type EmailSender,
	type SenderType
} from '$lib/utils/email-config';
import { generateMinimalEmailHTML } from '$lib/utils/emailTemplate';

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
	constructor(private supabase: SupabaseClient) {}

	/**
	 * Send an email through Gmail with database + open tracking.
	 */
	async sendEmail(
		data: EmailData
	): Promise<{ success: boolean; messageId?: string; error?: string }> {
		const sentAt = new Date().toISOString();
		const senderType = data.from || 'dj';
		const trackingEnabled = data.trackingEnabled ?? true;
		const trackingId = trackingEnabled ? randomUUID() : null;
		const sender = getSenderByType(senderType);
		const baseUrl = PUBLIC_APP_URL || (dev ? 'http://localhost:5173' : 'https://build-os.com');
		const trackingPixel = trackingId
			? `<img src="${baseUrl}/api/email-tracking/${trackingId}" width="1" height="1" style="display:none;" alt="" />`
			: '';

		const transporter = createGmailTransporter(senderType);
		const textBody = data.body;
		const htmlBody = this.composeHtmlBody({
			subject: data.subject,
			html: data.html,
			textBody,
			trackingPixel
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
				replyTo: data.replyTo
			});

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
				metadata: data.metadata,
				sender
			});

			await this.supabase.from('email_logs').insert({
				to_email: data.to,
				subject: data.subject,
				body: textBody,
				cc: data.cc,
				bcc: data.bcc,
				reply_to: data.replyTo,
				status: 'sent',
				sent_at: sentAt,
				user_id: data.userId ?? null,
				metadata: {
					...data.metadata,
					message_id: info.messageId,
					sender_type: senderType,
					tracking_id: trackingId,
					email_id: emailRecordId,
					user_id: data.userId ?? null
				}
			});

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

			await this.supabase.from('email_logs').insert({
				to_email: data.to,
				subject: data.subject,
				body: textBody,
				cc: data.cc,
				bcc: data.bcc,
				reply_to: data.replyTo,
				status: 'failed',
				error_message: errorMessage,
				sent_at: sentAt,
				user_id: data.userId ?? null,
				metadata: {
					...data.metadata,
					tracking_id: trackingId,
					sender_type: senderType,
					user_id: data.userId ?? null
				}
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
		trackingPixel
	}: {
		subject: string;
		html?: string;
		textBody: string;
		trackingPixel: string;
	}): string {
		if (html) {
			return trackingPixel ? this.appendTrackingPixel(html, trackingPixel) : html;
		}

		const content = textBody.replace(/\n/g, '<br>');
		return generateMinimalEmailHTML({
			subject,
			content,
			trackingPixel
		});
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
		try {
			const { recipientEmail, recipientId, sentAt, errorMessage } = options;
			const status = errorMessage ? 'failed' : 'sent';
			const { data: existing } = await this.supabase
				.from('email_recipients')
				.select('id')
				.eq('email_id', emailId)
				.eq('recipient_email', recipientEmail)
				.maybeSingle();

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
