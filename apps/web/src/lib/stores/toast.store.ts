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
	EXTENDED: 10000
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

export const toasts = writable<Toast[]>([]);

// Track timeout IDs to prevent memory leaks
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

export const toastService = {
	add: (toast: Omit<Toast, 'id'>) => {
		const id = crypto.randomUUID();
		const newToast: Toast = {
			id,
			duration: 5000,
			dismissible: true,
			...toast
		};

		toasts.update((currentToasts) => [...currentToasts, newToast]);

		// Auto remove after duration
		if (newToast.duration && newToast.duration > 0) {
			const timeoutId = setTimeout(() => {
				toastTimeouts.delete(id);
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
		toasts.update((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
	},

	clear: () => {
		// Clear all pending timeouts to prevent memory leaks
		toastTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
		toastTimeouts.clear();
		toasts.set([]);
	},

	// Convenience methods
	success: (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'type'>>) => {
		return toastService.add({ message, type: 'success', ...options });
	},

	error: (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'type'>>) => {
		return toastService.add({ message, type: 'error', ...options });
	},

	warning: (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'type'>>) => {
		return toastService.add({ message, type: 'warning', ...options });
	},

	info: (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'type'>>) => {
		return toastService.add({ message, type: 'info', ...options });
	}
};
