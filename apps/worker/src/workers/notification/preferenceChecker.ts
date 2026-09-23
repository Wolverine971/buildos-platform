// apps/worker/src/workers/notification/preferenceChecker.ts
/**
 * Notification Preference Checker
 *
 * Validates user preferences before sending notifications.
 * Used across worker, adapters, and webhooks to ensure we respect user preferences
 * even if they change after a delivery is queued.
 *
 * Returns both validation result and reason for logging/debugging.
 */

import { createServiceClient } from '@buildos/supabase-client';
import type { NotificationChannel } from '@buildos/shared-types';
import type { Logger } from '@buildos/shared-utils';

const supabase = createServiceClient();

// PostgREST `.single()` code for "no row": the user genuinely has no preferences.
const NO_ROWS_ERROR_CODE = 'PGRST116';

export interface PreferenceCheckResult {
	allowed: boolean;
	reason: string;
	preferences?: {
		push_enabled?: boolean | null;
		in_app_enabled?: boolean | null;
		email_enabled?: boolean | null;
		sms_enabled?: boolean | null;
		quiet_hours_enabled?: boolean | null;
		quiet_hours_start?: string | null;
		quiet_hours_end?: string | null;
	};
}

/**
 * Check if user preferences allow sending notification on this channel
 *
 * Checks:
 * 1. user_notification_preferences table for channel-specific settings
 * 2. For SMS: Also checks user_sms_preferences for opt-out and verification
 *
 * @param userId - Recipient user ID
 * @param eventType - Event type (e.g., 'brief.completed') - used for logging only
 * @param channel - Notification channel ('push', 'in_app', 'email', 'sms')
 * @param logger - Logger instance for tracking
 * @returns PreferenceCheckResult with allowed flag and reason
 */
export async function checkUserPreferences(
	userId: string,
	eventType: string,
	channel: NotificationChannel,
	logger: Logger
): Promise<PreferenceCheckResult> {
	const prefLogger = logger.child('preferences');

	try {
		prefLogger.debug('Checking user preferences', {
			userId,
			eventType,
			channel
		});

		// Get global notification preferences (applies to all event types)
		const { data: prefs, error: prefError } = await supabase
			.from('user_notification_preferences')
			.select(
				'push_enabled, in_app_enabled, email_enabled, sms_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, should_email_daily_brief, should_sms_daily_brief'
			)
			.eq('user_id', userId)
			.single();

		if (prefError) {
			// A transient read failure is not a user opt-out: callers cancel on
			// allowed:false, so throw and let the queue retry instead.
			if (prefError.code !== NO_ROWS_ERROR_CODE) {
				throw new Error(`Failed to load notification preferences: ${prefError.message}`);
			}
			prefLogger.warn('No preferences found for user', {
				userId,
				eventType,
				error: prefError.message
			});
			return {
				allowed: false,
				reason: `No preferences found for user`
			};
		}

		if (!prefs) {
			return {
				allowed: false,
				reason: 'User preferences not found'
			};
		}

		const isDailyBriefEvent = eventType === 'brief.completed' || eventType === 'brief.failed';

		// Check channel-specific preference
		let channelEnabled = false;
		switch (channel) {
			case 'push':
				channelEnabled = prefs.push_enabled || false;
				break;
			case 'in_app':
				channelEnabled = prefs.in_app_enabled || false;
				break;
			case 'email':
				// For daily brief events, also check should_email_daily_brief
				if (isDailyBriefEvent) {
					channelEnabled = prefs.should_email_daily_brief ?? false;
				} else {
					channelEnabled = prefs.email_enabled || false;
				}
				break;
			case 'sms':
				// For daily brief events, also check should_sms_daily_brief
				if (isDailyBriefEvent) {
					channelEnabled = prefs.should_sms_daily_brief ?? false;
				} else {
					channelEnabled = prefs.sms_enabled || false;
				}
				break;
			default:
				prefLogger.error('Unknown notification channel', undefined, {
					channel
				});
				return {
					allowed: false,
					reason: `Unknown notification channel: ${channel}`
				};
		}

		if (!channelEnabled) {
			prefLogger.info('Notification not allowed - channel disabled', {
				userId,
				eventType,
				channel
			});
			return {
				allowed: false,
				reason: `${channel} notifications disabled by user preferences`,
				preferences: prefs
			};
		}

		// Additional checks for SMS channel
		if (channel === 'sms') {
			const { data: smsPrefs, error: smsError } = await supabase
				.from('user_sms_preferences')
				.select('opted_out, phone_verified, phone_number')
				.eq('user_id', userId)
				.single();

			if (smsError && smsError.code !== NO_ROWS_ERROR_CODE) {
				throw new Error(`Failed to load SMS preferences: ${smsError.message}`);
			}
			if (smsError || !smsPrefs) {
				prefLogger.warn('SMS preferences not found', {
					userId,
					error: smsError?.message
				});
				return {
					allowed: false,
					reason: 'SMS preferences not configured',
					preferences: prefs
				};
			}

			// Explicit null checks - opted_out === true means user explicitly opted out
			if (smsPrefs.opted_out === true) {
				prefLogger.info('SMS not allowed - user opted out', {
					userId
				});
				return {
					allowed: false,
					reason: 'User opted out of SMS notifications',
					preferences: prefs
				};
			}

			// Explicit check - phone_verified must be explicitly true
			if (smsPrefs.phone_verified !== true) {
				prefLogger.info('SMS not allowed - phone not verified', {
					userId
				});
				return {
					allowed: false,
					reason: 'Phone number not verified',
					preferences: prefs
				};
			}

			if (!smsPrefs.phone_number) {
				prefLogger.warn('SMS not allowed - no phone number', {
					userId
				});
				return {
					allowed: false,
					reason: 'No phone number on file',
					preferences: prefs
				};
			}
		}

		// All checks passed
		prefLogger.debug('Notification allowed', {
			userId,
			eventType,
			channel
		});

		return {
			allowed: true,
			reason: 'User preferences allow this notification',
			preferences: prefs
		};
	} catch (error) {
		prefLogger.error('Error checking user preferences', error, {
			userId,
			eventType,
			channel
		});
		// Still fail closed (nothing is sent), but as a retryable error rather than
		// allowed:false, which callers turn into a permanent cancellation.
		throw error;
	}
}
