// apps/worker/src/config/sms.ts
import 'dotenv/config';

/**
 * Global, fail-closed SMS delivery switch.
 *
 * Credentials alone must never enable outbound text messages. Both the web and
 * worker services must explicitly opt in with PRIVATE_SMS_SENDING_ENABLED=true.
 */
export const SMS_SENDING_ENABLED =
	String(process.env.PRIVATE_SMS_SENDING_ENABLED ?? 'false').toLowerCase() === 'true';

export const SMS_SENDING_DISABLED_REASON = 'SMS sending is disabled by PRIVATE_SMS_SENDING_ENABLED';
