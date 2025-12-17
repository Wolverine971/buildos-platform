// apps/web/src/lib/utils/email-config.ts
import { createTransport } from 'nodemailer';

import { PRIVATE_DJ_GMAIL_APP_PASSWORD } from '$env/static/private';

export interface EmailSender {
	email: string;
	password: string;
	name?: string;
}

// Email sender configurations
export const EMAIL_SENDERS = {
	dj: {
		email: 'dj@build-os.com',
		password: PRIVATE_DJ_GMAIL_APP_PASSWORD,
		name: 'DJ from BuildOS'
	}
} as const;

export type SenderType = keyof typeof EMAIL_SENDERS;

/**
 * Get sender configuration by email address
 */
export function getSenderByEmail(email: string): EmailSender | null {
	if (email === EMAIL_SENDERS.dj.email) {
		return EMAIL_SENDERS.dj;
	}

	return EMAIL_SENDERS.dj;
}

/**
 * Get sender configuration by sender type
 */
export function getSenderByType(senderType: SenderType): EmailSender {
	return EMAIL_SENDERS[senderType];
}

/**
 * Create Gmail transporter for specific sender
 */
export function createGmailTransporter(senderType: SenderType = 'dj') {
	const sender = getSenderByType(senderType);

	if (!sender.password) {
		throw new Error(`Gmail app password not configured for ${senderType}`);
	}

	return createTransport({
		service: 'gmail',
		auth: {
			user: sender.email,
			pass: sender.password
		}
	});
}

/**
 * Create Gmail transporter by email address
 */
export function createGmailTransporterByEmail(email: string) {
	const sender = getSenderByEmail(email);

	if (!sender) {
		throw new Error(`No sender configuration found for email: ${email}`);
	}

	if (!sender.password) {
		throw new Error(`Gmail app password not configured for ${email}`);
	}

	return createTransport({
		service: 'gmail',
		auth: {
			user: sender.email,
			pass: sender.password
		}
	});
}

/**
 * Get default sender (DJ)
 */
export function getDefaultSender(): EmailSender {
	return EMAIL_SENDERS.dj;
}

/**
 * Check if sender credentials are available
 */
export function isSenderConfigured(senderType: SenderType): boolean {
	const sender = getSenderByType(senderType);
	return !!(sender.email && sender.password);
}

/**
 * Get all available senders
 */
export function getAvailableSenders(): Array<{
	type: SenderType;
	email: string;
	name: string;
	configured: boolean;
}> {
	return (Object.entries(EMAIL_SENDERS) as Array<[SenderType, EmailSender]>).map(
		([type, config]) => ({
			type: type as SenderType,
			email: config.email,
			name: config.name || config.email,
			configured: !!(config.email && config.password)
		})
	);
}

/**
 * Send email using Gmail
 */
export async function sendEmail(options: {
	to: string;
	subject: string;
	html?: string;
	text?: string;
	from?: SenderType;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
	try {
		const senderType = options.from || 'dj';
		const transporter = createGmailTransporter(senderType);
		const sender = getSenderByType(senderType);

		const mailOptions = {
			from: `${sender.name || 'BuildOS'} <${sender.email}>`,
			to: options.to,
			subject: options.subject,
			text: options.text || '',
			html: options.html || options.text || ''
		};

		const info = await transporter.sendMail(mailOptions);

		return {
			success: true,
			messageId: info.messageId
		};
	} catch (error) {
		console.error('Error sending email:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to send email'
		};
	}
}
