// src/lib/stores/toast.store.ts
import { writable } from 'svelte/store';

export interface Toast {
	id: string;
	message: string;
	type: 'success' | 'error' | 'warning' | 'info';
	duration?: number; // in milliseconds, default 5000
	dismissible?: boolean;
}

export const toasts = writable<Toast[]>([]);

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
		if (newToast.duration > 0) {
			setTimeout(() => {
				toastService.remove(id);
			}, newToast.duration);
		}

		return id;
	},

	remove: (id: string) => {
		toasts.update((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
	},

	clear: () => {
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
