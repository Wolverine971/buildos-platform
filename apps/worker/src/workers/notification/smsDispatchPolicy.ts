// apps/worker/src/workers/notification/smsDispatchPolicy.ts
// Final notification SMS checks, after queue delay but before provider dispatch.
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database } from '@buildos/shared-types';
import { getNotificationString, isNotificationJsonObject } from '@buildos/shared-types';
import { isNotificationSmsSendingEnabled } from '../../config/sms';
import { PermanentQueueError } from '../../lib/queueErrors';
import { checkQuietHours } from '../../lib/utils/smsPreferenceChecks';
import { getStaleBriefJobDecision } from '../brief/briefDateGuard';

type SmsMessage = Database['public']['Tables']['sms_messages']['Row'];
export type NotificationSmsDispatchDecision =
	| { kind: 'send'; notificationDeliveryId?: string }
	| { kind: 'cancel'; reason: string; deliveryId: string; cancelDelivery: boolean }
	| { kind: 'defer'; until: string };

export async function checkNotificationSmsDispatch(
	client: TypedSupabaseClient,
	message: SmsMessage,
	userId: string,
	phoneNumber: string,
	now = new Date()
): Promise<NotificationSmsDispatchDecision> {
	const metadata = isNotificationJsonObject(message.metadata) ? message.metadata : {};
	const deliveryId =
		message.notification_delivery_id ||
		getNotificationString(metadata, 'notification_delivery_id');
	if (!deliveryId) return { kind: 'send' }; // Direct/calendar SMS retain their own policy.
	const { data: delivery, error } = await client
		.from('notification_deliveries')
		.select('id, recipient_user_id, channel, status, payload, event_id, external_id')
		.eq('id', deliveryId)
		.maybeSingle();
	if (error) throw new Error(`Failed to read SMS notification: ${error.message}`);
	const cancel = (reason: string, cancelDelivery = true): NotificationSmsDispatchDecision => ({
		kind: 'cancel',
		reason: `cancelled: ${reason}`,
		deliveryId,
		cancelDelivery
	});
	if (!delivery) return cancel('notification_missing', false);
	if (
		delivery.channel !== 'sms' ||
		delivery.recipient_user_id !== userId ||
		message.user_id !== userId ||
		message.phone_number !== phoneNumber
	) {
		throw new PermanentQueueError(
			'sms_notification_identity_mismatch',
			'SMS notification identity does not match the queued message'
		);
	}
	if (delivery.status !== 'pending') return cancel('notification_terminal', false);
	if (delivery.external_id && delivery.external_id !== message.id)
		return cancel('notification_replaced', false);
	if (!(await isNotificationSmsSendingEnabled(client))) return cancel('sms_disabled');
	const payload = isNotificationJsonObject(delivery.payload) ? delivery.payload : {};
	const expiresAt = getNotificationString(payload, 'expires_at');
	const expiresMs = expiresAt ? Date.parse(expiresAt) : null;
	if (expiresMs !== null && !Number.isFinite(expiresMs))
		throw new PermanentQueueError('sms_invalid_expiry', 'Invalid notification SMS expiry');
	if (expiresMs !== null && expiresMs <= now.getTime()) return cancel('expired');
	let eventType =
		getNotificationString(payload, 'event_type') ||
		getNotificationString(metadata, 'event_type');
	if (!eventType && delivery.event_id) {
		const event = await client
			.from('notification_events')
			.select('event_type')
			.eq('id', delivery.event_id)
			.single();
		if (event.error || !event.data)
			throw new Error(`Failed to read SMS event: ${event.error?.message ?? 'missing event'}`);
		eventType = event.data.event_type;
	}
	const [preferences, smsPreferences, user] = await Promise.all([
		client
			.from('user_notification_preferences')
			.select('sms_enabled, should_sms_daily_brief')
			.eq('user_id', userId)
			.maybeSingle(),
		client
			.from('user_sms_preferences')
			.select('phone_number, phone_verified, opted_out, quiet_hours_start, quiet_hours_end')
			.eq('user_id', userId)
			.maybeSingle(),
		client.from('users').select('timezone').eq('id', userId).maybeSingle()
	]);
	for (const result of [preferences, smsPreferences, user]) {
		if (result.error)
			throw new Error(`Failed to read SMS dispatch preferences: ${result.error.message}`);
	}
	const isBrief = eventType === 'brief.completed' || eventType === 'brief.failed';
	const enabled = isBrief
		? preferences.data?.should_sms_daily_brief
		: preferences.data?.sms_enabled;
	const sms = smsPreferences.data;
	if (
		!enabled ||
		!sms ||
		sms.opted_out === true ||
		sms.phone_verified !== true ||
		sms.phone_number !== phoneNumber
	)
		return cancel('preferences_changed');
	if (!user.data) return cancel('recipient_missing');
	const timezone = user.data.timezone || 'UTC';
	const briefTimezone = getNotificationString(payload, 'timezone') || timezone;
	// Do not inherit the legacy quiet-hours helper's fail-open behavior for invalid zones.
	new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(now);
	const briefDate = getNotificationString(payload, 'brief_date');
	const staleAt = (date: Date) =>
		Boolean(
			isBrief &&
				briefDate &&
				getStaleBriefJobDecision({ briefDate, timezone: briefTimezone, now: date })
					.shouldSkip
		);
	if (staleAt(now)) return cancel('stale_brief');
	const quiet = checkQuietHours(now, sms.quiet_hours_start, sms.quiet_hours_end, timezone);
	if (quiet.inQuietHours) {
		const until = quiet.rescheduleTime;
		if (!until || !Number.isFinite(until.getTime()) || until <= now)
			throw new Error('SMS deferral requires a future quiet-hours end');
		if ((expiresMs !== null && expiresMs <= until.getTime()) || staleAt(until))
			return cancel('stale_after_quiet_hours');
		return { kind: 'defer', until: until.toISOString() };
	}
	// The notification adapter already reserved the daily quota. Do not charge it twice.
	return { kind: 'send', notificationDeliveryId: deliveryId };
}
