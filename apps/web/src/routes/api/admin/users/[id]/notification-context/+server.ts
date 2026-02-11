// apps/web/src/routes/api/admin/users/[id]/notification-context/+server.ts
import type { RequestHandler } from './$types';
import { EmailGenerationService } from '$lib/services/email-generation-service';
import { ApiResponse } from '$lib/utils/api-response';
import type { EventType, NotificationChannel } from '@buildos/shared-types';

export interface NotificationChannelCapability {
	channel: NotificationChannel;
	available: boolean;
	details: string;
	count?: number;
}

export interface UserNotificationContext {
	// Basic user info from email context
	basic: {
		id: string;
		email: string;
		name: string | null;
		created_at: string;
		last_visit: string | null;
		subscription_status: string | null;
		is_admin: boolean;
	};

	// Notification preferences
	preferences: Array<{
		event_type: EventType;
		push_enabled: boolean;
		email_enabled: boolean;
		sms_enabled: boolean;
		in_app_enabled: boolean;
		is_subscribed: boolean;
	}>;

	// Channel capabilities
	channels: NotificationChannelCapability[];

	// Recent notifications
	recent_notifications: Array<{
		id: string;
		event_type: EventType;
		channel: NotificationChannel;
		status: string;
		created_at: string;
		delivered_at: string | null;
		opened_at: string | null;
	}>;

	// Activity summary (from email context)
	activity: {
		project_count: number;
		tasks_created: number;
		tasks_completed: number;
		brain_dump_count: number;
		brief_count: number;
	};

	// Beta info if applicable
	beta?: {
		beta_tier: string | null;
		company_name: string | null;
	};
}

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();

		if (!user?.is_admin) {
			return ApiResponse.forbidden('Admin access required');
		}

		const userId = params.id;

		if (!userId) {
			return ApiResponse.error('User ID is required');
		}

		// Get base user context from email service
		const emailService = new EmailGenerationService(supabase);
		const baseContext = await emailService.getUserContext(userId);

		// Get global notification preferences (Phase 4: one row per user, no event_type)
		const { data: globalPrefs, error: prefsError } = await supabase
			.from('user_notification_preferences')
			.select('push_enabled, email_enabled, sms_enabled, in_app_enabled')
			.eq('user_id', userId)
			.maybeSingle();

		if (prefsError) {
			console.error('Error fetching notification preferences:', prefsError);
		}

		// Get notification subscriptions to check which events user is subscribed to
		const { data: subscriptions, error: subsError } = await supabase
			.from('notification_subscriptions')
			.select('event_type, is_active')
			.eq('user_id', userId);

		if (subsError) {
			console.error('Error fetching notification subscriptions:', subsError);
		}

		// Map subscriptions to preferences format
		// After refactor: preferences are global, so we combine with subscriptions
		const preferencesWithSubscription =
			subscriptions?.map((sub) => ({
				event_type: sub.event_type as EventType,
				// Global preferences apply to ALL subscribed events
				push_enabled: globalPrefs?.push_enabled ?? false,
				email_enabled: globalPrefs?.email_enabled ?? false,
				sms_enabled: globalPrefs?.sms_enabled ?? false,
				in_app_enabled: globalPrefs?.in_app_enabled ?? false,
				is_subscribed: sub.is_active ?? false
			})) ?? [];

		// Get channel capabilities
		const capabilities: NotificationChannelCapability[] = [];

		// Check push subscriptions
		const { data: pushSubs, error: pushError } = await supabase
			.from('push_subscriptions')
			.select('id')
			.eq('user_id', userId)
			.eq('is_active', true);

		if (pushError) {
			console.error('Error fetching push subscriptions:', pushError);
		}

		capabilities.push({
			channel: 'push',
			available: (pushSubs?.length ?? 0) > 0,
			details: pushSubs?.length
				? `${pushSubs.length} active push subscription${pushSubs.length > 1 ? 's' : ''}`
				: 'No active push subscriptions',
			count: pushSubs?.length ?? 0
		});

		// Check email (always available if user has email)
		capabilities.push({
			channel: 'email',
			available: true,
			details: `Email: ${baseContext.basic.email}`
		});

		// Check SMS (check if user has verified phone number)
		const { data: smsPrefs, error: smsError } = await supabase
			.from('user_sms_preferences')
			.select('phone_number, phone_verified, opted_out')
			.eq('user_id', userId)
			.maybeSingle();

		if (smsError) {
			console.error('Error fetching user SMS preferences:', smsError);
		}

		const hasSMS = !!(
			smsPrefs?.phone_number &&
			smsPrefs?.phone_verified &&
			!smsPrefs?.opted_out
		);

		capabilities.push({
			channel: 'sms',
			available: hasSMS,
			details: hasSMS
				? `Phone: ${smsPrefs.phone_number}`
				: smsPrefs?.opted_out
					? 'User opted out of SMS'
					: !smsPrefs?.phone_verified
						? 'Phone not verified'
						: 'No phone number'
		});

		// In-app is always available
		capabilities.push({
			channel: 'in_app',
			available: true,
			details: 'Always available'
		});

		// Get recent notifications (last 5)
		const { data: recentNotifications, error: notifError } = await supabase
			.from('notification_deliveries')
			.select(
				`
				id,
				event_id,
				channel,
				status,
				created_at,
				delivered_at,
				opened_at,
				notification_events!inner(event_type)
			`
			)
			.eq('recipient_user_id', userId)
			.order('created_at', { ascending: false })
			.limit(5);

		if (notifError) {
			console.error('Error fetching recent notifications:', notifError);
		}

		const formattedNotifications =
			recentNotifications?.map((notif) => ({
				id: notif.id,
				event_type: (notif.notification_events as any)?.event_type as EventType,
				channel: notif.channel as NotificationChannel,
				status: notif.status,
				created_at: notif.created_at ?? new Date().toISOString(),
				delivered_at: notif.delivered_at,
				opened_at: notif.opened_at
			})) ?? [];

		// Build complete notification context
		const notificationContext: UserNotificationContext = {
			basic: {
				id: userId,
				email: baseContext.basic.email,
				name: baseContext.basic.name,
				created_at: baseContext.basic.created_at,
				last_visit: baseContext.basic.last_visit,
				subscription_status: baseContext.basic.subscription_status,
				is_admin: baseContext.basic.is_admin ?? false
			},
			preferences: preferencesWithSubscription,
			channels: capabilities,
			recent_notifications: formattedNotifications,
			activity: {
				project_count: baseContext.activity.project_count,
				tasks_created: baseContext.activity.tasks_created,
				tasks_completed: baseContext.activity.tasks_completed,
				brain_dump_count: (baseContext.activity as any).brain_dump_count ?? 0,
				brief_count:
					(baseContext.activity as any).brief_count ??
					baseContext.activity.daily_briefs_count ??
					0
			},
			beta: baseContext.beta
		};

		return ApiResponse.success(notificationContext);
	} catch (error) {
		console.error('Error fetching user notification context:', error);
		return ApiResponse.error(
			error instanceof Error ? error.message : 'Failed to fetch user notification context'
		);
	}
};
