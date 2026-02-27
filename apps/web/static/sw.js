// apps/web/static/sw.js
/**
 * Service Worker for Push Notifications
 *
 * Handles push notification events and displays notifications to users
 */

// Service Worker version - increment to force update
const SW_VERSION = '1.2.0';

function normalizeBadgeCount(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		return null;
	}
	return Math.max(0, Math.floor(numeric));
}

async function applyAppBadge(count) {
	const appNavigator = self.navigator;
	if (!appNavigator || typeof appNavigator.setAppBadge !== 'function') {
		return;
	}

	const normalizedCount = normalizeBadgeCount(count) ?? 0;

	try {
		if (normalizedCount > 0) {
			await appNavigator.setAppBadge(normalizedCount);
			return;
		}

		if (typeof appNavigator.clearAppBadge === 'function') {
			await appNavigator.clearAppBadge();
			return;
		}

		await appNavigator.setAppBadge(0);
	} catch (error) {
		console.warn('[ServiceWorker] Failed to update app badge:', error);
	}
}

async function fetchUnreadPushCount() {
	try {
		const response = await fetch('/api/notifications/unread-count?channel=push', {
			method: 'GET',
			credentials: 'include'
		});

		if (!response.ok) {
			return null;
		}

		const payload = await response.json();
		const count =
			typeof payload?.data?.count === 'number'
				? payload.data.count
				: typeof payload?.count === 'number'
					? payload.count
					: null;

		return normalizeBadgeCount(count);
	} catch (error) {
		console.warn('[ServiceWorker] Failed to fetch unread push count:', error);
		return null;
	}
}

async function syncBadgeCount(fallbackCount = null) {
	const unreadCount = await fetchUnreadPushCount();
	const countToApply = unreadCount ?? normalizeBadgeCount(fallbackCount);

	if (countToApply === null) {
		return;
	}

	await applyAppBadge(countToApply);
}

self.addEventListener('install', (_event) => {
	console.log(`[ServiceWorker v${SW_VERSION}] Installing...`);
	self.skipWaiting(); // Activate immediately
});

self.addEventListener('activate', (event) => {
	console.log(`[ServiceWorker v${SW_VERSION}] Activating...`);
	event.waitUntil(self.clients.claim()); // Take control immediately
});

// Handle push events
self.addEventListener('push', (event) => {
	console.log('[ServiceWorker] Push event received', event);

	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch (error) {
		console.error('[ServiceWorker] Failed to parse push data:', error);
		data = {
			title: 'BuildOS Notification',
			body: event.data ? event.data.text() : 'You have a new notification'
		};
	}

	const title = data.title || 'BuildOS';
	const payloadBadgeCount = normalizeBadgeCount(data.badge_count ?? data.badgeCount);
	const options = {
		body: data.body || '',
		icon: data.icon || '/AppImages/android/android-launchericon-192-192.png',
		badge: data.badge || '/AppImages/android/android-launchericon-96-96.png',
		tag: data.tag || 'buildos-notification',
		requireInteraction: data.requireInteraction || false,
		data: data.data || {}
	};

	event.waitUntil(
		Promise.allSettled([
			self.registration.showNotification(title, options),
			syncBadgeCount(payloadBadgeCount ?? 1)
		])
	);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
	console.log('[ServiceWorker] Notification clicked:', event.notification);

	event.notification.close();

	const urlToOpen = event.notification.data?.url || '/';
	const deliveryId = event.notification.data?.delivery_id;
	const action = event.action; // For action buttons on notifications

	// Track click event via API (non-blocking)
	const trackingPromise = deliveryId
		? (() => {
				console.log(
					'[ServiceWorker] Tracking notification click, delivery_id:',
					deliveryId
				);
				return fetch(`/api/notification-tracking/click/${deliveryId}`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						metadata: {
							action: action || 'notification_body',
							user_agent: navigator.userAgent,
							timestamp: new Date().toISOString()
						}
					})
				})
					.then((response) => {
						if (response.ok) {
							console.log('[ServiceWorker] Click tracked successfully');
						} else {
							console.error(
								'[ServiceWorker] Click tracking failed:',
								response.status
							);
						}
					})
					.catch((error) => {
						console.error('[ServiceWorker] Failed to track notification click:', error);
					});
			})()
		: Promise.resolve();

	// Navigate to URL
	const navigatePromise = self.clients
		.matchAll({
			type: 'window',
			includeUncontrolled: true
		})
		.then((clientList) => {
			// Check if there's already a window open
			for (const client of clientList) {
				if (client.url === urlToOpen && 'focus' in client) {
					return client.focus();
				}
			}

			// Open new window if none found
			if (self.clients.openWindow) {
				return self.clients.openWindow(urlToOpen);
			}
		});

	const badgePromise = trackingPromise.finally(() => syncBadgeCount(0));

	event.waitUntil(Promise.allSettled([trackingPromise, badgePromise, navigatePromise]));
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
	console.log('[ServiceWorker] Notification closed:', event.notification);
	// Could track dismissal here if needed
});

self.addEventListener('message', (event) => {
	const messageType = event?.data?.type;

	if (messageType === 'BUILDOS_SYNC_BADGE') {
		event.waitUntil(syncBadgeCount());
		return;
	}

	if (messageType === 'BUILDOS_CLEAR_BADGE') {
		event.waitUntil(applyAppBadge(0));
	}
});

console.log(`[ServiceWorker v${SW_VERSION}] Loaded`);
