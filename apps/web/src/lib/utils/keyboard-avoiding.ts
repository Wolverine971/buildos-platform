// apps/web/src/lib/utils/keyboard-avoiding.ts
/**
 * Keyboard Avoiding Utility
 *
 * Uses the visualViewport API to handle mobile keyboard appearance/disappearance.
 * Sets a --keyboard-height CSS custom property on documentElement so any element
 * can react via calc(100dvh - var(--keyboard-height, 0px)).
 *
 * Why this approach:
 * - iOS Safari does NOT resize the layout viewport when the keyboard opens
 * - dvh/svh units do NOT respond to the keyboard on iOS
 * - position:fixed elements get pushed behind the keyboard on iOS
 * - The only reliable iOS approach is visualViewport API + CSS custom property
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
	/** Whether to set --keyboard-height CSS custom property on documentElement (default: true) */
	setCSSProperty?: boolean;
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

	const {
		element,
		onKeyboardChange,
		minHeightChange = 100,
		applyTransform = true,
		setCSSProperty = true
	} = options;

	let isKeyboardVisible = false;

	function handleViewportResize() {
		if (!window.visualViewport) return;

		const currentHeight = window.visualViewport.height;
		// Use window.innerHeight as reference — it's the layout viewport height,
		// which stays constant on iOS when the keyboard opens.
		// This is more reliable than a stored initial value which can become stale
		// after orientation changes or address bar state changes.
		const keyboardHeight = window.innerHeight - currentHeight;
		const keyboardNowVisible = keyboardHeight > minHeightChange;

		// Set CSS custom property on every resize event (not just state changes)
		// so height tracks smoothly during keyboard animation
		if (setCSSProperty) {
			document.documentElement.style.setProperty(
				'--keyboard-height',
				keyboardNowVisible ? `${keyboardHeight}px` : '0px'
			);
		}

		if (keyboardNowVisible !== isKeyboardVisible) {
			isKeyboardVisible = keyboardNowVisible;

			if (applyTransform) {
				if (isKeyboardVisible) {
					const offsetTop = window.visualViewport.offsetTop || 0;
					element.style.transform = `translateY(${-offsetTop}px)`;
					element.style.transition = 'transform 100ms ease-out';
				} else {
					element.style.transform = '';
					element.style.transition = 'transform 150ms ease-out';
				}
			}

			onKeyboardChange?.(isKeyboardVisible, isKeyboardVisible ? keyboardHeight : 0);
		}
	}

	function handleViewportScroll() {
		if (!window.visualViewport || !isKeyboardVisible || !applyTransform) return;

		const offsetTop = window.visualViewport.offsetTop || 0;
		element.style.transform = `translateY(${-offsetTop}px)`;
	}

	function handleOrientationChange() {
		setTimeout(() => {
			if (window.visualViewport) {
				isKeyboardVisible = false;
				element.style.transform = '';
				if (setCSSProperty) {
					document.documentElement.style.setProperty('--keyboard-height', '0px');
				}
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
		if (setCSSProperty) {
			document.documentElement.style.setProperty('--keyboard-height', '0px');
		}
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
