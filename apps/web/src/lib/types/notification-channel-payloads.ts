/**
 * Type definitions for channel-specific notification payloads
 * Based on the worker implementation in apps/worker/src/workers/notification/notificationWorker.ts
 */

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';
export type NotificationChannel = 'push' | 'in_app' | 'email' | 'sms';

/**
 * Push notification payload
 * Used by sendPushNotification in notificationWorker.ts
 */
export interface PushNotificationPayload {
	/** Notification title */
	title: string;
	/** Notification body text */
	body: string;
	/** Icon URL - defaults to BuildOS app icon */
	icon_url?: string;
	/** Tag for grouping notifications */
	tag?: string;
	/** Priority level - affects urgency and requireInteraction */
	priority?: NotificationPriority;
	/** URL to navigate to when clicked */
	action_url?: string;
	/** Event type for categorization */
	event_type?: string;
	/** Additional custom data */
	data?: Record<string, any>;
}

/**
 * In-app notification payload
 * Used by sendInAppNotification in notificationWorker.ts
 */
export interface InAppNotificationPayload {
	/** Notification type - affects styling */
	type?: 'info' | 'success' | 'warning' | 'error';
	/** Notification title */
	title: string;
	/** Notification body/message */
	body: string;
	/** Priority level */
	priority?: NotificationPriority;
	/** Optional action URL */
	action_url?: string;
	/** Optional expiration timestamp */
	expires_at?: string;
}

/**
 * Email notification payload
 * Used by sendEmailNotification via emailAdapter.ts
 */
export interface EmailNotificationPayload {
	/** Email subject line */
	title: string;
	/** Email body content (supports HTML) */
	body: string;
	/** Optional CTA button URL */
	action_url?: string;
	/** Optional image to include in email */
	image_url?: string;
	/** Event type for categorization */
	event_type?: string;
}

/**
 * SMS notification payload
 * Used by sendSMSNotification via smsAdapter.ts
 */
export interface SMSNotificationPayload {
	/** Message title (used in formatting) */
	title?: string;
	/** Message body content */
	body?: string;
	/** Priority level */
	priority?: NotificationPriority;
	/** Event type for template lookup */
	event_type?: string;
	/** Additional template variables */
	data?: Record<string, any>;
}

/**
 * Combined payload type that includes all channel-specific payloads
 */
export interface ChannelPayloads {
	push?: PushNotificationPayload;
	in_app?: InAppNotificationPayload;
	email?: EmailNotificationPayload;
	sms?: SMSNotificationPayload;
}

/**
 * Default payloads for each channel type
 */
export const DEFAULT_CHANNEL_PAYLOADS: Record<
	NotificationChannel,
	PushNotificationPayload | InAppNotificationPayload | EmailNotificationPayload | SMSNotificationPayload
> = {
	push: {
		title: 'BuildOS Notification',
		body: '',
		icon_url: '/AppImages/android/android-launchericon-192-192.png',
		priority: 'normal',
		tag: 'notification'
	},
	in_app: {
		type: 'info',
		title: 'Notification',
		body: '',
		priority: 'normal'
	},
	email: {
		title: 'BuildOS Notification',
		body: ''
	},
	sms: {
		title: 'BuildOS Notification',
		body: '',
		priority: 'normal'
	}
};
