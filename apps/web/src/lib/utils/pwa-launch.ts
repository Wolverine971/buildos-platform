// apps/web/src/lib/utils/pwa-launch.ts
/**
 * Page side of the instant app launch (see static/sw.js).
 *
 * The service worker shows the saved Today screen, or a breathing Brain Bolt, the
 * moment the installed app opens. It only exists after registration, which used to
 * happen only when someone turned on push notifications.
 */
import { browser } from '$app/environment';

// Keep in sync with LAUNCH_CACHE / SNAPSHOT_KEY in static/sw.js.
export const LAUNCH_CACHE_NAME = 'buildos-launch-v1';
export const LAUNCH_SNAPSHOT_KEY = '/__buildos/launch/today-snapshot';

let registration: Promise<void> | null = null;

/** Register the app's service worker once per page load (same options as push). */
export function registerAppServiceWorker(): Promise<void> {
	if (!browser || !('serviceWorker' in navigator)) return Promise.resolve();
	registration ??= navigator.serviceWorker
		.register('/sw.js', { updateViaCache: 'none' })
		.then(() => undefined)
		.catch((error) => {
			registration = null;
			console.warn('[PWA] Service worker registration failed:', error);
		});
	return registration;
}

/**
 * Forget the saved Today screen, so the next person to open the app on this device
 * never sees the previous account's tasks. Safe to call when nothing is saved.
 */
export async function clearLaunchSnapshot(): Promise<void> {
	if (!browser || typeof caches === 'undefined') return;
	try {
		if (!(await caches.has(LAUNCH_CACHE_NAME))) return;
		const cache = await caches.open(LAUNCH_CACHE_NAME);
		await cache.delete(LAUNCH_SNAPSHOT_KEY);
	} catch (error) {
		console.warn('[PWA] Could not clear the saved Today screen:', error);
	}
}
