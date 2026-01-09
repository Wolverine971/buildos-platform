// apps/web/src/lib/stores/toast.store.ts
import { writable } from 'svelte/store';

/**
 * Standardized toast durations (in milliseconds)
 * Use these constants for consistency across the app
 */
export const TOAST_DURATION = {
	/** Quick confirmations, transitions (e.g., "Signing out...") */
	QUICK: 1500,
	/** Simple confirmations (e.g., "Copied to clipboard") */
	SHORT: 3000,
	/** Standard success/error messages (default) */
	STANDARD: 5000,
	/** Complex messages requiring more reading time */
	LONG: 7000,
	/** Messages requiring user action or attention */
	EXTENDED: 10000,
	/** Persistent toast - won't auto-dismiss (use with dismissible: true) */
	PERSISTENT: 0
} as const;

export interface ToastAction {
	label: string;
	onClick: () => void;
}

export interface Toast {
	id: string;
	message: string;
	type: 'success' | 'error' | 'warning' | 'info';
	duration?: number; // in milliseconds, default TOAST_DURATION.STANDARD (5000)
	dismissible?: boolean;
	action?: ToastAction; // Optional action button
}

// Internal toast state with timing info
interface ToastState {
	toast: Toast;
	startTime: number;
	remainingTime: number;
	isPaused: boolean;
}

export const toasts = writable<Toast[]>([]);

// Track timeout IDs and state for pause/resume support
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const toastStates = new Map<string, ToastState>();

export const toastService = {
	add: (toast: Omit<Toast, 'id'>) => {
		const id = crypto.randomUUID();
		const newToast: Toast = {
			id,
			duration: TOAST_DURATION.STANDARD,
			dismissible: true,
			...toast
		};

		toasts.update((currentToasts) => [...currentToasts, newToast]);

		// Initialize state and auto-remove after duration
		if (newToast.duration && newToast.duration > 0) {
			const state: ToastState = {
				toast: newToast,
				startTime: Date.now(),
				remainingTime: newToast.duration,
				isPaused: false
			};
			toastStates.set(id, state);

			const timeoutId = setTimeout(() => {
				toastTimeouts.delete(id);
				toastStates.delete(id);
				toastService.remove(id);
			}, newToast.duration);
			toastTimeouts.set(id, timeoutId);
		}

		return id;
	},

	remove: (id: string) => {
		// Clear timeout if it exists to prevent memory leak
		const timeoutId = toastTimeouts.get(id);
		if (timeoutId) {
			clearTimeout(timeoutId);
			toastTimeouts.delete(id);
		}
		toastStates.delete(id);
		toasts.update((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
	},

	/**
	 * Pause the auto-dismiss timer for a toast (e.g., on hover)
	 */
	pause: (id: string) => {
		const state = toastStates.get(id);
		if (!state || state.isPaused) return;

		// Clear the current timeout
		const timeoutId = toastTimeouts.get(id);
		if (timeoutId) {
			clearTimeout(timeoutId);
			toastTimeouts.delete(id);
		}

		// Calculate remaining time based on current remaining window
		const elapsed = Date.now() - state.startTime;
		const baseDuration = state.remainingTime || state.toast.duration || 0;
		state.remainingTime = Math.max(0, baseDuration - elapsed);
		state.isPaused = true;
		toastStates.set(id, state);
	},

	/**
	 * Resume the auto-dismiss timer for a toast (e.g., on mouse leave)
	 */
	resume: (id: string) => {
		const state = toastStates.get(id);
		if (!state || !state.isPaused || state.remainingTime <= 0) return;

		state.isPaused = false;
		state.startTime = Date.now();
		toastStates.set(id, state);

		// Set new timeout with remaining time
		const timeoutId = setTimeout(() => {
			toastTimeouts.delete(id);
			toastStates.delete(id);
			toastService.remove(id);
		}, state.remainingTime);
		toastTimeouts.set(id, timeoutId);
	},

	/**
	 * Get the current state of a toast (for progress bar)
	 */
	getState: (id: string): ToastState | undefined => {
		return toastStates.get(id);
	},

	clear: () => {
		// Clear all pending timeouts to prevent memory leaks
		toastTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
		toastTimeouts.clear();
		toastStates.clear();
		toasts.set([]);
	},

	// Convenience methods with sensible defaults
	success: (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'type'>>) => {
		return toastService.add({ message, type: 'success', ...options });
	},

	error: (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'type'>>) => {
		// Errors stay longer by default so users can read them
		return toastService.add({
			message,
			type: 'error',
			duration: TOAST_DURATION.LONG,
			...options
		});
	},

	warning: (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'type'>>) => {
		return toastService.add({
			message,
			type: 'warning',
			duration: TOAST_DURATION.LONG,
			...options
		});
	},

	info: (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'type'>>) => {
		return toastService.add({ message, type: 'info', ...options });
	}
};
