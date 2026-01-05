// apps/web/src/lib/services/notification-preferences.service.ts
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
	 * Get user notification preferences (global preferences for all event types)
	 * Returns global user preferences or defaults if not set
	 */
	async get(): Promise<UserNotificationPreferences> {
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
			.maybeSingle();

		if (error) {
			throw error;
		}

		// Return preferences or defaults
		return data || this.getDefaults();
	}

	/**
	 * @deprecated Use get() instead - preferences are now global per user, not per event type
	 * Get all notification preferences for current user (returns single row)
	 */
	async getAll(): Promise<UserNotificationPreferences[]> {
		const prefs = await this.get();
		return [prefs];
	}

	/**
	 * Update global notification preferences
	 * @param updates - Partial updates to notification preferences
	 */
	async update(updates: Partial<UserNotificationPreferences>): Promise<void> {
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
				...updates,
				updated_at: new Date().toISOString()
			},
			{
				onConflict: 'user_id'
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
				admin_only: false,
				created_by: user.id,
				updated_at: new Date().toISOString(),
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
			.update({ is_active: false, updated_at: new Date().toISOString() })
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
	 * Get default global notification preferences
	 */
	private getDefaults(): UserNotificationPreferences {
		// Default global channel preferences (apply to all event types)
		// Note: timezone removed from preferences table, now stored in users table
		return {
			push_enabled: false,
			email_enabled: false,
			sms_enabled: false,
			in_app_enabled: false,
			priority: 'normal',
			batch_enabled: false,
			quiet_hours_enabled: false,
			quiet_hours_start: '22:00:00',
			quiet_hours_end: '08:00:00',
			should_email_daily_brief: false,
			should_sms_daily_brief: false
		};
	}
}

export const notificationPreferencesService = new NotificationPreferencesService();
