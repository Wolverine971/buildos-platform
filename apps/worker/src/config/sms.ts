// apps/worker/src/config/sms.ts
import 'dotenv/config';
import type { TypedSupabaseClient } from '@buildos/supabase-client';

/**
 * Global, fail-closed SMS delivery switch.
 *
 * Credentials alone must never enable outbound text messages. Both the web and
 * worker services must explicitly opt in with PRIVATE_SMS_SENDING_ENABLED=true.
 */
export const SMS_SENDING_ENABLED =
	String(process.env.PRIVATE_SMS_SENDING_ENABLED ?? 'false').toLowerCase() === 'true';

export const SMS_SENDING_DISABLED_REASON = 'SMS sending is disabled by PRIVATE_SMS_SENDING_ENABLED';

/**
 * Notification admission and delivery share the database flag; the environment
 * switch remains an additional emergency stop for every SMS path. No cache:
 * disabling notification SMS takes effect on the next job, including deferred jobs.
 */
export async function isNotificationSmsSendingEnabled(
	client: Pick<TypedSupabaseClient, 'rpc'>
): Promise<boolean> {
	if (!SMS_SENDING_ENABLED) return false;
	// Local RPC boundary until generated database types include the new migration.
	const readSetting = client.rpc.bind(client) as unknown as (
		name: 'get_notification_sms_sending_enabled'
	) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
	const { data, error } = await readSetting('get_notification_sms_sending_enabled');
	if (error) throw new Error(`Failed to read notification SMS switch: ${error.message}`);
	return data === true;
}
