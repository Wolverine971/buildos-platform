/**
 * Haptic feedback utility for mobile devices
 *
 * Provides tactile feedback for key user actions on supported devices.
 * Uses the Vibration API which is supported on most mobile browsers.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API
 */

import { browser } from '$app/environment';

type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

// Vibration patterns in milliseconds
// Single values = vibration duration; arrays = [vibrate, pause, vibrate, ...]
const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
	light: 10, // Quick tap - button press, toggle
	medium: 25, // Standard feedback - send message, confirm action
	heavy: 50, // Strong feedback - important action completed
	success: [15, 50, 15], // Double tap - success confirmation
	warning: [30, 30, 30], // Triple short - warning/attention
	error: [50, 30, 50, 30, 50] // Long pattern - error feedback
};

/**
 * Check if haptic feedback is available on the current device
 */
export function isHapticSupported(): boolean {
	return browser && 'vibrate' in navigator;
}

/**
 * Trigger haptic feedback with the specified pattern
 *
 * @param pattern - The haptic pattern to use (default: 'light')
 * @returns true if vibration was triggered, false if not supported
 *
 * @example
 * // Light tap for button press
 * haptic('light');
 *
 * // Medium feedback for sending a message
 * haptic('medium');
 *
 * // Success pattern for completed action
 * haptic('success');
 */
export function haptic(pattern: HapticPattern = 'light'): boolean {
	if (!isHapticSupported()) {
		return false;
	}

	try {
		const vibrationPattern = HAPTIC_PATTERNS[pattern];
		return navigator.vibrate(vibrationPattern);
	} catch {
		// Vibration API might throw in some edge cases
		return false;
	}
}

/**
 * Cancel any ongoing vibration
 */
export function cancelHaptic(): void {
	if (isHapticSupported()) {
		try {
			navigator.vibrate(0);
		} catch {
			// Ignore errors
		}
	}
}
