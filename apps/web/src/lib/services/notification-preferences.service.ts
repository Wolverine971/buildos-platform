/**
 * Notification Preferences Service
 *
 * Manages user preferences for notification subscriptions and delivery channels
 */

import { createSupabaseBrowser } from '@buildos/supabase-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	EventType,
	UserNotificationPreferences,
	NotificationSubscription,
	PushSubscription
} from '@buildos/shared-types';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';

class NotificationPreferencesService {
	private supabase: SupabaseClient;

	constructor(supabase?: SupabaseClient) {
		this.supabase =
			supabase || createSupabaseBrowser(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
	}

	/**
	 * Get user preferences for a specific event type
	 */
	async get(eventType: EventType): Promise<UserNotificationPreferences> {
		// Get current user ID
		const {
			data: { user },
			error: authError
		} = await this.supabase.auth.getUser();

		if (authError || !user) {
			throw new Error('User not authenticated');
		}

		const { data, error } = await this.supabase
			.from('user_notification_preferences')
			.select('*')
			.eq('user_id', user.id)
			.eq('event_type', eventType)
			.single();

		if (error && error.code !== 'PGRST116') {
			// PGRST116 = no rows returned
			throw error;
		}

		// Return preferences or defaults
		return data || this.getDefaults(eventType);
	}

	/**
	 * Get all notification preferences for current user
	 */
	async getAll(): Promise<UserNotificationPreferences[]> {
		// Get current user ID
		const {
			data: { user },
			error: authError
		} = await this.supabase.auth.getUser();

		if (authError || !user) {
			throw new Error('User not authenticated');
		}

		const { data, error } = await this.supabase
			.from('user_notification_preferences')
			.select('*')
			.eq('user_id', user.id)
			.order('event_type');

		if (error) {
			throw error;
		}

		return data || [];
	}

	/**
	 * Update notification preferences for an event type
	 */
	async update(
		eventType: EventType,
		updates: Partial<UserNotificationPreferences>
	): Promise<void> {
		// Get current user ID
		const {
			data: { user },
			error: authError
		} = await this.supabase.auth.getUser();

		if (authError || !user) {
			throw new Error('User not authenticated');
		}

		const { error } = await this.supabase.from('user_notification_preferences').upsert(
			{
				user_id: user.id,
				event_type: eventType,
				...updates,
				updated_at: new Date().toISOString()
			},
			{
				onConflict: 'user_id,event_type'
			}
		);

		if (error) {
			throw error;
		}
	}

	/**
	 * Subscribe to an event type
	 */
	async subscribe(eventType: EventType, filters?: Record<string, any>): Promise<void> {
		// Get current user ID
		const {
			data: { user },
			error: authError
		} = await this.supabase.auth.getUser();

		if (authError || !user) {
			throw new Error('User not authenticated');
		}

		const { error } = await this.supabase.from('notification_subscriptions').upsert(
			{
				user_id: user.id,
				event_type: eventType,
				is_active: true,
				filters: filters || null
			},
			{
				onConflict: 'user_id,event_type'
			}
		);

		if (error) {
			throw error;
		}
	}

	/**
	 * Unsubscribe from an event type
	 */
	async unsubscribe(eventType: EventType): Promise<void> {
		// Get current user ID
		const {
			data: { user },
			error: authError
		} = await this.supabase.auth.getUser();

		if (authError || !user) {
			throw new Error('User not authenticated');
		}

		const { error } = await this.supabase
			.from('notification_subscriptions')
			.update({ is_active: false })
			.eq('user_id', user.id)
			.eq('event_type', eventType);

		if (error) {
			throw error;
		}
	}

	/**
	 * Get all subscriptions for current user
	 */
	async getSubscriptions(): Promise<NotificationSubscription[]> {
		// Get current user ID
		const {
			data: { user },
			error: authError
		} = await this.supabase.auth.getUser();

		if (authError || !user) {
			throw new Error('User not authenticated');
		}

		const { data, error } = await this.supabase
			.from('notification_subscriptions')
			.select('*')
			.eq('user_id', user.id)
			.order('event_type');

		if (error) {
			throw error;
		}

		return data || [];
	}

	/**
	 * Check if user is subscribed to an event type
	 */
	async isSubscribed(eventType: EventType): Promise<boolean> {
		// Get current user ID
		const {
			data: { user },
			error: authError
		} = await this.supabase.auth.getUser();

		if (authError || !user) {
			return false;
		}

		const { data, error } = await this.supabase
			.from('notification_subscriptions')
			.select('is_active')
			.eq('user_id', user.id)
			.eq('event_type', eventType)
			.single();

		if (error) {
			return false;
		}

		return data?.is_active || false;
	}

	/**
	 * Get default preferences for an event type
	 */
	private getDefaults(eventType: EventType): UserNotificationPreferences {
		// Default channel preferences based on event type
		const defaults: Record<
			EventType,
			Pick<
				UserNotificationPreferences,
				'push_enabled' | 'email_enabled' | 'sms_enabled' | 'in_app_enabled'
			>
		> = {
			// Admin events - push and in-app only
			'user.signup': {
				push_enabled: true,
				email_enabled: false,
				sms_enabled: false,
				in_app_enabled: true
			},
			'user.trial_expired': {
				push_enabled: true,
				email_enabled: false,
				sms_enabled: false,
				in_app_enabled: true
			},
			'payment.failed': {
				push_enabled: true,
				email_enabled: true,
				sms_enabled: false,
				in_app_enabled: true
			},
			'error.critical': {
				push_enabled: true,
				email_enabled: true,
				sms_enabled: true,
				in_app_enabled: true
			},

			// User events - multiple channels
			'brief.completed': {
				push_enabled: true,
				email_enabled: true,
				sms_enabled: false,
				in_app_enabled: true
			},
			'brief.failed': {
				push_enabled: true,
				email_enabled: false,
				sms_enabled: false,
				in_app_enabled: true
			},
			'brain_dump.processed': {
				push_enabled: true,
				email_enabled: false,
				sms_enabled: false,
				in_app_enabled: true
			},
			'task.due_soon': {
				push_enabled: true,
				email_enabled: false,
				sms_enabled: true,
				in_app_enabled: true
			},
			'project.phase_scheduled': {
				push_enabled: true,
				email_enabled: false,
				sms_enabled: false,
				in_app_enabled: true
			},
			'calendar.sync_failed': {
				push_enabled: true,
				email_enabled: false,
				sms_enabled: false,
				in_app_enabled: true
			}
		};

		const channelDefaults = defaults[eventType] || {
			push_enabled: true,
			email_enabled: false,
			sms_enabled: false,
			in_app_enabled: true
		};

		return {
			event_type: eventType,
			...channelDefaults,
			priority: 'normal',
			batch_enabled: false,
			quiet_hours_enabled: false,
			quiet_hours_start: '22:00:00',
			quiet_hours_end: '08:00:00',
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
		};
	}
}

export const notificationPreferencesService = new NotificationPreferencesService();
