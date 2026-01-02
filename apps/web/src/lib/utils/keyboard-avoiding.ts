// apps/web/src/lib/utils/keyboard-avoiding.ts
/**
 * Keyboard Avoiding Utility
 *
 * Uses the visualViewport API to handle mobile keyboard appearance/disappearance
 * more smoothly than CSS-only solutions. This provides real-time viewport updates
 * as the keyboard animates in/out.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
 */

import { browser } from '$app/environment';

export interface KeyboardAvoidingOptions {
	/** Element to keep visible above keyboard (typically an input container) */
	element: HTMLElement;
	/** Callback when keyboard visibility changes */
	onKeyboardChange?: (isVisible: boolean, keyboardHeight: number) => void;
	/** Minimum height change to consider as keyboard (default: 100px) */
	minHeightChange?: number;
	/** Whether to apply transform to element (default: true) */
	applyTransform?: boolean;
}

export interface KeyboardAvoidingState {
	isKeyboardVisible: boolean;
	keyboardHeight: number;
	viewportHeight: number;
}

/**
 * Initialize keyboard avoiding behavior for an element
 *
 * @returns Cleanup function to remove event listeners
 *
 * @example
 * ```ts
 * onMount(() => {
 *   const cleanup = initKeyboardAvoiding({
 *     element: composerElement,
 *     onKeyboardChange: (isVisible, height) => {
 *       console.log('Keyboard:', isVisible, height);
 *     }
 *   });
 *   return cleanup;
 * });
 * ```
 */
export function initKeyboardAvoiding(options: KeyboardAvoidingOptions): () => void {
	if (!browser || !window.visualViewport) {
		return () => {};
	}

	const { element, onKeyboardChange, minHeightChange = 100, applyTransform = true } = options;

	// Store initial viewport height to detect keyboard
	let initialViewportHeight = window.visualViewport.height;
	let isKeyboardVisible = false;

	function handleViewportResize() {
		if (!window.visualViewport) return;

		const currentHeight = window.visualViewport.height;
		const heightDiff = initialViewportHeight - currentHeight;

		// Detect keyboard visibility based on significant height change
		const keyboardNowVisible = heightDiff > minHeightChange;

		// Only update if state changed
		if (keyboardNowVisible !== isKeyboardVisible) {
			isKeyboardVisible = keyboardNowVisible;

			if (applyTransform) {
				if (isKeyboardVisible) {
					// Keyboard is visible - adjust element position
					// The visualViewport.offsetTop gives us the offset from layout viewport
					const offsetTop = window.visualViewport.offsetTop || 0;
					element.style.transform = `translateY(${-offsetTop}px)`;
					element.style.transition = 'transform 100ms ease-out';
				} else {
					// Keyboard hidden - reset position
					element.style.transform = '';
					element.style.transition = 'transform 150ms ease-out';
				}
			}

			onKeyboardChange?.(isKeyboardVisible, isKeyboardVisible ? heightDiff : 0);
		}
	}

	function handleViewportScroll() {
		if (!window.visualViewport || !isKeyboardVisible || !applyTransform) return;

		// When viewport scrolls (user scrolling while keyboard is open), adjust position
		const offsetTop = window.visualViewport.offsetTop || 0;
		element.style.transform = `translateY(${-offsetTop}px)`;
	}

	// Reset initial height on orientation change
	function handleOrientationChange() {
		// Delay to allow viewport to settle
		setTimeout(() => {
			if (window.visualViewport) {
				initialViewportHeight = window.visualViewport.height;
				isKeyboardVisible = false;
				element.style.transform = '';
			}
		}, 100);
	}

	// Attach event listeners
	window.visualViewport.addEventListener('resize', handleViewportResize);
	window.visualViewport.addEventListener('scroll', handleViewportScroll);
	window.addEventListener('orientationchange', handleOrientationChange);

	// Cleanup function
	return () => {
		window.visualViewport?.removeEventListener('resize', handleViewportResize);
		window.visualViewport?.removeEventListener('scroll', handleViewportScroll);
		window.removeEventListener('orientationchange', handleOrientationChange);
		element.style.transform = '';
		element.style.transition = '';
	};
}

/**
 * Svelte action for keyboard avoiding behavior
 *
 * @example
 * ```svelte
 * <div use:keyboardAvoiding={{ onKeyboardChange: handleKeyboard }}>
 *   <input type="text" />
 * </div>
 * ```
 */
export function keyboardAvoiding(
	node: HTMLElement,
	options: Omit<KeyboardAvoidingOptions, 'element'> = {}
) {
	const cleanup = initKeyboardAvoiding({ ...options, element: node });

	return {
		destroy() {
			cleanup();
		},
		update(newOptions: Omit<KeyboardAvoidingOptions, 'element'>) {
			// For simplicity, recreate on options change
			cleanup();
			const newCleanup = initKeyboardAvoiding({ ...newOptions, element: node });
			return { destroy: newCleanup };
		}
	};
}

/**
 * Check if visualViewport API is supported
 */
export function isVisualViewportSupported(): boolean {
	return browser && 'visualViewport' in window && window.visualViewport !== null;
}

/**
 * Get current keyboard state
 */
export function getKeyboardState(): KeyboardAvoidingState {
	if (!browser || !window.visualViewport) {
		return {
			isKeyboardVisible: false,
			keyboardHeight: 0,
			viewportHeight: browser ? window.innerHeight : 0
		};
	}

	const viewportHeight = window.visualViewport.height;
	const windowHeight = window.innerHeight;
	const heightDiff = windowHeight - viewportHeight;
	const isKeyboardVisible = heightDiff > 100;

	return {
		isKeyboardVisible,
		keyboardHeight: isKeyboardVisible ? heightDiff : 0,
		viewportHeight
	};
}
