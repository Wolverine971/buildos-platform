// apps/web/static/sw.js
/**
 * Service Worker for Push Notifications
 *
 * Handles push notification events and displays notifications to users
 */

// Service Worker version - increment to force update
const SW_VERSION = '1.1.0';

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
	const options = {
		body: data.body || '',
		icon: data.icon || '/AppImages/android/android-launchericon-192-192.png',
		badge: data.badge || '/AppImages/android/android-launchericon-96-96.png',
		tag: data.tag || 'buildos-notification',
		requireInteraction: data.requireInteraction || false,
		data: data.data || {}
	};

	event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
	console.log('[ServiceWorker] Notification clicked:', event.notification);

	event.notification.close();

	const urlToOpen = event.notification.data?.url || '/';
	const deliveryId = event.notification.data?.delivery_id;
	const action = event.action; // For action buttons on notifications

	// Track click event via API (non-blocking)
	if (deliveryId) {
		console.log('[ServiceWorker] Tracking notification click, delivery_id:', deliveryId);

		event.waitUntil(
			fetch(`/api/notification-tracking/click/${deliveryId}`, {
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
						console.error('[ServiceWorker] Click tracking failed:', response.status);
					}
				})
				.catch((error) => {
					console.error('[ServiceWorker] Failed to track notification click:', error);
				})
		);
	}

	// Navigate to URL
	event.waitUntil(
		self.clients
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
			})
	);
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
	console.log('[ServiceWorker] Notification closed:', event.notification);
	// Could track dismissal here if needed
});

console.log(`[ServiceWorker v${SW_VERSION}] Loaded`);
