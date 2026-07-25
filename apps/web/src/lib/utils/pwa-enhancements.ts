// apps/web/src/lib/utils/pwa-enhancements.ts

/**
 * PWA Enhancement utilities for better mobile experience
 * Especially for iOS/Safari PWA integration
 */

import { browser } from '$app/environment';

const BADGE_SYNC_MIN_INTERVAL_MS = 15000;
let lastBadgeSyncAt = 0;

async function postMessageToServiceWorker(
	messageType: 'BUILDOS_SYNC_BADGE' | 'BUILDOS_CLEAR_BADGE'
) {
	if (!browser || !('serviceWorker' in navigator)) return;

	try {
		const registration =
			(await navigator.serviceWorker.getRegistration('/sw.js')) ??
			(await navigator.serviceWorker.getRegistration());
		if (!registration) {
			return;
		}
		const targetWorker = registration.active || navigator.serviceWorker.controller;
		targetWorker?.postMessage({ type: messageType });
	} catch (error) {
		console.warn('[PWA] Failed to post message to service worker:', error);
	}
}

async function requestBadgeSync(force = false) {
	if (!browser) return;
	const now = Date.now();
	if (!force && now - lastBadgeSyncAt < BADGE_SYNC_MIN_INTERVAL_MS) {
		return;
	}

	lastBadgeSyncAt = now;
	await postMessageToServiceWorker('BUILDOS_SYNC_BADGE');
}

/**
 * Update theme colors dynamically based on dark mode
 */
export function updateThemeColors(isDarkMode: boolean) {
	if (!browser) return;

	// Update meta theme-color tags
	const lightThemeMetaTag = document.querySelector<HTMLMetaElement>(
		'meta[name="theme-color"][media="(prefers-color-scheme: light)"]'
	);
	const darkThemeMetaTag = document.querySelector<HTMLMetaElement>(
		'meta[name="theme-color"][media="(prefers-color-scheme: dark)"]'
	);
	const defaultThemeMetaTag = document.querySelector<HTMLMetaElement>(
		'meta[name="theme-color"]:not([media])'
	);
	const themeColor = (isDarkMode ? darkThemeMetaTag : lightThemeMetaTag)?.content;

	if (defaultThemeMetaTag && themeColor) {
		defaultThemeMetaTag.setAttribute('content', themeColor);
	}

	// Update status bar for iOS
	updateIOSStatusBar(isDarkMode ? 'black-translucent' : 'default');
}

/**
 * Update iOS status bar style
 */
function updateIOSStatusBar(style: 'default' | 'black' | 'black-translucent') {
	if (!browser) return;

	const statusBarMeta = document.querySelector(
		'meta[name="apple-mobile-web-app-status-bar-style"]'
	);
	if (statusBarMeta) {
		statusBarMeta.setAttribute('content', style);
	}
}

/**
 * Check if running as installed PWA
 */
export function isInstalledPWA(): boolean {
	if (!browser) return false;

	// Check for iOS standalone mode
	const isIOSStandalone =
		'standalone' in window.navigator && window.navigator.standalone === true;

	// Check for display-mode media query
	const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

	// Check for Samsung Internet
	const isSamsungStandalone = window.matchMedia('(display-mode: standalone)').matches;

	return isIOSStandalone || isStandalone || isSamsungStandalone;
}

/**
 * Initialize PWA enhancements
 * @returns Cleanup function to remove event listeners
 */
export function initializePWAEnhancements(): (() => void) | void {
	if (!browser) return;

	// ModeWatcher owns theme resolution (system + explicit user choice). Observe
	// its resolved `.dark` class so theme chrome always matches the rendered UI,
	// including same-tab toggles that do not emit a storage event.
	const syncResolvedTheme = () => {
		updateThemeColors(document.documentElement.classList.contains('dark'));
	};
	const themeObserver = new MutationObserver(syncResolvedTheme);
	themeObserver.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['class']
	});
	syncResolvedTheme();

	// Cross-tab preference changes are normally reflected by ModeWatcher; this
	// immediate sync also keeps browser chrome current while that update settles.
	const handleStorageChange = (event: StorageEvent) => {
		if (event.key === 'mode-watcher-mode') {
			queueMicrotask(syncResolvedTheme);
		}
	};

	const handleVisibilityChange = () => {
		if (document.visibilityState === 'visible') {
			void requestBadgeSync();
		}
	};

	const handleWindowFocus = () => {
		void requestBadgeSync();
	};

	// Add event listeners
	window.addEventListener('storage', handleStorageChange);
	window.addEventListener('focus', handleWindowFocus);
	document.addEventListener('visibilitychange', handleVisibilityChange);

	// Add PWA-specific body class for custom styling
	if (isInstalledPWA()) {
		document.body.classList.add('pwa-installed');
	}

	// viewport-fit=cover is set in app.html to avoid FOUC on PWA load
	void requestBadgeSync(true);

	// Return cleanup function
	return () => {
		themeObserver.disconnect();
		window.removeEventListener('storage', handleStorageChange);
		window.removeEventListener('focus', handleWindowFocus);
		document.removeEventListener('visibilitychange', handleVisibilityChange);
	};
}

/**
 * Request app installation (for supported browsers)
 */
export async function requestInstall() {
	if (!browser) return;

	// Check if installation is available
	const beforeInstallPromptEvent = (window as any).deferredPrompt;

	if (beforeInstallPromptEvent) {
		// Show the install prompt
		beforeInstallPromptEvent.prompt();

		// Wait for the user's response
		const { outcome } = await beforeInstallPromptEvent.userChoice;

		// Clear the deferred prompt
		(window as any).deferredPrompt = null;

		return outcome === 'accepted';
	}

	return false;
}

/**
 * Set up install prompt handling
 * @returns Cleanup function to remove event listeners
 */
export function setupInstallPrompt(): (() => void) | void {
	if (!browser) return;

	const handleBeforeInstallPrompt = (e: Event) => {
		// Prevent the default prompt
		e.preventDefault();

		// Store the event for later use
		(window as any).deferredPrompt = e;

		// Optionally show your custom install UI
		document.dispatchEvent(new CustomEvent('pwa-install-available'));
	};

	const handleAppInstalled = () => {
		// Clear any stored prompt
		(window as any).deferredPrompt = null;

		// Optionally track or celebrate the installation
		document.dispatchEvent(new CustomEvent('pwa-installed'));
	};

	window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
	window.addEventListener('appinstalled', handleAppInstalled);

	// Return cleanup function
	return () => {
		window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
		window.removeEventListener('appinstalled', handleAppInstalled);
	};
}
