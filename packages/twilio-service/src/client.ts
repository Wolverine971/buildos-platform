// packages/twilio-service/src/client.ts
import twilio from 'twilio';
import type { Twilio } from 'twilio';
import type { MessageInstance } from 'twilio/lib/rest/api/v2010/account/message';

export interface TwilioConfig {
	accountSid: string;
	authToken: string;
	messagingServiceSid: string;
	verifyServiceSid?: string;
	statusCallbackUrl?: string;
	/** Fail-closed gate for every operation that sends a text message. */
	sendingEnabled?: boolean;
}

/** Twilio error codes BuildOS maps to user-facing messages. */
const TWILIO_INVALID_TO_NUMBER = 21211;
const TWILIO_RECIPIENT_UNSUBSCRIBED = 21610; // Recipient replied STOP
const TWILIO_NOT_SMS_CAPABLE = 21614;
const TWILIO_RESOURCE_NOT_FOUND = 20404; // Verify check: expired, used, or never sent

type TwilioErrorFields = { code?: number; status?: number; moreInfo?: string };

/**
 * Replace the message but keep Twilio's code/status so callers can branch on them.
 * The original error is not attached as `cause`: Twilio's text for these codes quotes the
 * recipient's phone number, and callers log and persist the mapped error.
 */
function withTwilioFields(message: string, original: TwilioErrorFields): Error {
	const mapped = new Error(message) as Error & TwilioErrorFields;
	if (original.code !== undefined) mapped.code = original.code;
	if (original.status !== undefined) mapped.status = original.status;
	if (original.moreInfo !== undefined) mapped.moreInfo = original.moreInfo;
	return mapped;
}

/**
 * Normalize user-entered phone numbers to E.164. Input that already carries a
 * leading '+' is international and keeps its own country code; bare 10-digit
 * input is assumed to be US/Canada.
 */
export function formatPhoneNumber(phone: string): string {
	const trimmed = phone.trim();
	// Remove all non-numeric characters
	const cleaned = trimmed.replace(/\D/g, '');

	if (trimmed.startsWith('+')) {
		return `+${cleaned}`;
	}

	// Add US country code if not present
	if (cleaned.length === 10) {
		return `+1${cleaned}`;
	}

	return `+${cleaned}`;
}

export class TwilioClient {
	private client: Twilio;
	private config: TwilioConfig;

	constructor(config: TwilioConfig) {
		this.config = config;
		this.client = twilio(config.accountSid, config.authToken);
	}

	async sendSMS(params: {
		to: string;
		body: string;
		scheduledAt?: Date;
		metadata?: Record<string, any>;
	}): Promise<MessageInstance> {
		this.assertSendingEnabled();

		const messageParams: any = {
			messagingServiceSid: this.config.messagingServiceSid,
			to: this.formatPhoneNumber(params.to),
			body: params.body
		};

		// Handle scheduling (Twilio supports up to 7 days)
		if (params.scheduledAt) {
			const now = new Date();
			const diffHours = (params.scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60);

			if (diffHours > 0 && diffHours <= 168) {
				// Within 7 days
				messageParams.sendAt = params.scheduledAt.toISOString();
				messageParams.scheduleType = 'fixed';
			}
		}

		// Add status callback for delivery tracking
		if (this.config.statusCallbackUrl) {
			messageParams.statusCallback = this.config.statusCallbackUrl;

			// Pass metadata through status callback
			if (params.metadata) {
				const callbackUrl = new URL(this.config.statusCallbackUrl);
				Object.entries(params.metadata).forEach(([key, value]) => {
					callbackUrl.searchParams.append(key, String(value));
				});
				messageParams.statusCallback = callbackUrl.toString();
			}
		}

		try {
			return await this.client.messages.create(messageParams);
		} catch (error: any) {
			// Handle Twilio-specific errors
			if (error?.code === TWILIO_INVALID_TO_NUMBER) {
				throw withTwilioFields('Invalid phone number', error);
			} else if (error?.code === TWILIO_RECIPIENT_UNSUBSCRIBED) {
				throw withTwilioFields('Recipient has opted out of SMS (replied STOP)', error);
			} else if (error?.code === TWILIO_NOT_SMS_CAPABLE) {
				throw withTwilioFields('Phone number is not SMS capable', error);
			}
			throw error;
		}
	}

	async verifyPhoneNumber(phoneNumber: string): Promise<{ verificationSid: string }> {
		this.assertSendingEnabled();

		if (!this.config.verifyServiceSid) {
			throw new Error('Verify service SID not configured');
		}

		const verification = await this.client.verify.v2
			.services(this.config.verifyServiceSid)
			.verifications.create({
				to: this.formatPhoneNumber(phoneNumber),
				channel: 'sms'
			});

		return { verificationSid: verification.sid };
	}

	async checkVerification(phoneNumber: string, code: string): Promise<boolean> {
		if (!this.config.verifyServiceSid) {
			throw new Error('Verify service SID not configured');
		}

		try {
			const verificationCheck = await this.client.verify.v2
				.services(this.config.verifyServiceSid)
				.verificationChecks.create({
					to: this.formatPhoneNumber(phoneNumber),
					code
				});

			return verificationCheck.status === 'approved';
		} catch (error: any) {
			// 20404: no pending verification (expired, already used, or never
			// sent) — the code cannot be valid. Anything else (auth, outage, rate
			// limit) is not the user's typo and must not read as "Invalid code".
			if (error?.code === TWILIO_RESOURCE_NOT_FOUND) {
				return false;
			}
			throw error;
		}
	}

	async getMessageStatus(messageSid: string): Promise<string> {
		const message = await this.client.messages(messageSid).fetch();
		return message.status;
	}

	async cancelScheduledMessage(messageSid: string): Promise<void> {
		await this.client.messages(messageSid).update({ status: 'canceled' });
	}

	private assertSendingEnabled(): void {
		if (this.config.sendingEnabled !== true) {
			throw new Error('SMS sending is disabled');
		}
	}

	private formatPhoneNumber(phone: string): string {
		return formatPhoneNumber(phone);
	}
}
