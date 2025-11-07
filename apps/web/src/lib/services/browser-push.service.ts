// apps/web/src/lib/services/browser-push.service.ts
/**
 * Browser Push Service
 *
 * Manages browser push notification subscriptions
 * Uses Web Push API (https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
 */

import { createSupabaseBrowser } from '@buildos/supabase-client';
import type { CreatePushSubscriptionRequest } from '@buildos/shared-types';
import {
	PUBLIC_SUPABASE_ANON_KEY,
	PUBLIC_SUPABASE_URL,
	PUBLIC_VAPID_PUBLIC_KEY
} from '$env/static/public';

// VAPID public key must match the private key in worker
// You need to generate these using: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');

	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);

	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}

class BrowserPushService {
	private supabase = createSupabaseBrowser(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
	private registration: ServiceWorkerRegistration | null = null;

	/**
	 * Check if browser supports push notifications
	 */
	isSupported(): boolean {
		return 'serviceWorker' in navigator && 'PushManager' in window;
	}

	/**
	 * Check if user has granted push notification permission
	 */
	hasPermission(): boolean {
		return Notification.permission === 'granted';
	}

	/**
	 * Request push notification permission
	 */
	async requestPermission(): Promise<boolean> {
		if (!this.isSupported()) {
			throw new Error('Push notifications are not supported in this browser');
		}

		const permission = await Notification.requestPermission();
		return permission === 'granted';
	}

	/**
	 * Register service worker for push notifications
	 */
	private async registerServiceWorker(): Promise<ServiceWorkerRegistration> {
		if (this.registration) {
			return this.registration;
		}

		try {
			this.registration = await navigator.serviceWorker.register('/sw.js');
			await navigator.serviceWorker.ready;
			return this.registration;
		} catch (error) {
			console.error('Service worker registration failed:', error);
			throw error;
		}
	}

	/**
	 * Subscribe to push notifications
	 */
	async subscribe(): Promise<void> {
		if (!VAPID_PUBLIC_KEY) {
			throw new Error('VAPID public key not configured');
		}

		if (!this.hasPermission()) {
			const granted = await this.requestPermission();
			if (!granted) {
				throw new Error('Push notification permission denied');
			}
		}

		try {
			// Register service worker
			const registration = await this.registerServiceWorker();

			// Subscribe to push notifications
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer
			});

			// Convert subscription to JSON
			const subscriptionJSON = subscription.toJSON();

			if (!subscriptionJSON.endpoint || !subscriptionJSON.keys) {
				throw new Error('Invalid push subscription');
			}

			// Save subscription to database
			const request: CreatePushSubscriptionRequest = {
				endpoint: subscriptionJSON.endpoint,
				keys: {
					p256dh: subscriptionJSON.keys.p256dh!,
					auth: subscriptionJSON.keys.auth!
				},
				user_agent: navigator.userAgent
			};

			// Get current user ID
			const {
				data: { user }
			} = await this.supabase.auth.getUser();

			if (!user) {
				throw new Error('User not authenticated');
			}

			const { error } = await this.supabase.from('push_subscriptions').upsert(
				{
					user_id: user.id, // Explicitly set user_id
					endpoint: request.endpoint,
					p256dh_key: request.keys.p256dh,
					auth_key: request.keys.auth,
					user_agent: request.user_agent,
					is_active: true
				},
				{
					onConflict: 'endpoint'
				}
			);

			if (error) {
				throw error;
			}

			console.log('[BrowserPush] Subscription successful');
		} catch (error) {
			console.error('[BrowserPush] Subscription failed:', error);
			throw error;
		}
	}

	/**
	 * Unsubscribe from push notifications
	 */
	async unsubscribe(): Promise<void> {
		try {
			const registration = await navigator.serviceWorker.ready;
			const subscription = await registration.pushManager.getSubscription();

			if (subscription) {
				// Unsubscribe from push manager
				await subscription.unsubscribe();

				// Deactivate in database
				const { error } = await this.supabase
					.from('push_subscriptions')
					.update({ is_active: false })
					.eq('endpoint', subscription.endpoint);

				if (error) {
					console.error('[BrowserPush] Failed to deactivate subscription:', error);
				}
			}

			console.log('[BrowserPush] Unsubscribed successfully');
		} catch (error) {
			console.error('[BrowserPush] Unsubscribe failed:', error);
			throw error;
		}
	}

	/**
	 * Get current subscription status
	 */
	async getSubscription(): Promise<PushSubscription | null> {
		try {
			const registration = await navigator.serviceWorker.ready;
			return await registration.pushManager.getSubscription();
		} catch (error) {
			console.error('[BrowserPush] Failed to get subscription:', error);
			return null;
		}
	}

	/**
	 * Check if user is currently subscribed
	 */
	async isSubscribed(): Promise<boolean> {
		const subscription = await this.getSubscription();
		return subscription !== null;
	}
}

export const browserPushService = new BrowserPushService();
