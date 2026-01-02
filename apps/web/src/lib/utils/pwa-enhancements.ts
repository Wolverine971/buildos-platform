// apps/web/src/lib/utils/pwa-enhancements.ts

/**
 * PWA Enhancement utilities for better mobile experience
 * Especially for iOS/Safari PWA integration
 */

import { browser } from '$app/environment';

const THEME_COLORS = {
	light: '#f9fafb',
	dark: '#0f172a'
} as const;

/**
 * Update theme colors dynamically based on dark mode
 */
export function updateThemeColors(isDarkMode: boolean) {
	if (!browser) return;

	// Update meta theme-color tags
	const lightThemeMetaTag = document.querySelector(
		'meta[name="theme-color"][media="(prefers-color-scheme: light)"]'
	);
	const darkThemeMetaTag = document.querySelector(
		'meta[name="theme-color"][media="(prefers-color-scheme: dark)"]'
	);
	const defaultThemeMetaTag = document.querySelector('meta[name="theme-color"]:not([media])');
	const themeColor = isDarkMode ? THEME_COLORS.dark : THEME_COLORS.light;

	if (lightThemeMetaTag) {
		lightThemeMetaTag.setAttribute('content', THEME_COLORS.light);
	}
	if (darkThemeMetaTag) {
		darkThemeMetaTag.setAttribute('content', THEME_COLORS.dark);
	}
	if (defaultThemeMetaTag) {
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

	// Handle theme changes
	const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

	// Initial setup
	updateThemeColors(darkModeMediaQuery.matches);

	// Store handler references for cleanup
	const handleDarkModeChange = (e: MediaQueryListEvent) => {
		updateThemeColors(e.matches);
	};

	// Also listen for manual theme changes if you have a theme toggle
	// This assumes you store theme preference in localStorage
	const handleStorageChange = () => {
		const theme = localStorage.getItem('theme');
		if (theme) {
			updateThemeColors(theme === 'dark');
		}
	};

	// Prevent pull-to-refresh on iOS PWA (optional)
	let lastTouchY = 0;
	let preventPullToRefresh = false;

	const handleTouchStart = (e: TouchEvent) => {
		if (e.touches.length !== 1) return;
		lastTouchY = e.touches[0].clientY;
		preventPullToRefresh = window.scrollY === 0;
	};

	const handleTouchMove = (e: TouchEvent) => {
		if (!preventPullToRefresh || e.touches.length !== 1) return;

		const touchY = e.touches[0].clientY;
		const touchYDelta = touchY - lastTouchY;
		lastTouchY = touchY;

		if (touchYDelta > 0 && window.scrollY === 0) {
			e.preventDefault();
		}
	};

	// Add event listeners
	darkModeMediaQuery.addEventListener('change', handleDarkModeChange);
	window.addEventListener('storage', handleStorageChange);
	document.addEventListener('touchstart', handleTouchStart, { passive: false });
	document.addEventListener('touchmove', handleTouchMove, { passive: false });

	// Add PWA-specific body class for custom styling
	if (isInstalledPWA()) {
		document.body.classList.add('pwa-installed');
	}

	// Add viewport meta tag adjustments for notch handling
	adjustViewportForNotch();

	// Return cleanup function
	return () => {
		darkModeMediaQuery.removeEventListener('change', handleDarkModeChange);
		window.removeEventListener('storage', handleStorageChange);
		document.removeEventListener('touchstart', handleTouchStart);
		document.removeEventListener('touchmove', handleTouchMove);
	};
}

/**
 * Adjust viewport for devices with notches (iPhone X and later)
 */
function adjustViewportForNotch() {
	if (!browser) return;

	const viewport = document.querySelector('meta[name="viewport"]');
	if (viewport) {
		viewport.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
	}
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
