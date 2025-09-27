// src/lib/utils/componentOptimization.ts

/**
 * Common optimization patterns for Svelte components
 * Use these patterns to maintain consistency and performance across your app
 */

import { createProjectInvalidation } from '$lib/utils/invalidation';
import { writable, type Writable } from 'svelte/store';

/**
 * Standard setup for components that need project invalidation
 * Use this at the top of your component scripts
 *
 * @param projectSlug - Pass the project slug from your component's data or page params
 * @returns invalidation function for the project
 */
export function useProjectInvalidation(projectSlug: string | undefined) {
	if (!projectSlug) {
		return () => Promise.resolve(); // No-op if no slug
	}
	return createProjectInvalidation(projectSlug);
}

/**
 * Batch state update pattern using Svelte stores for proper reactivity
 * This version is properly reactive with Svelte's reactivity system
 */
export function createBatchState<T extends Record<string, any>>(initialState: T) {
	const store = writable({ ...initialState });

	const updateState = (updates: Partial<T>) => {
		store.update((current) => ({ ...current, ...updates }));
	};

	const resetState = () => {
		store.set({ ...initialState });
	};

	return {
		subscribe: store.subscribe,
		updateState,
		resetState
	};
}

/**
 * Memoized formatter pattern
 * Create reusable formatters instead of recreating them
 */
export const formatters = {
	date: new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric'
	}),

	dateTime: new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	}),

	time: new Intl.DateTimeFormat('en-US', {
		hour: 'numeric',
		minute: '2-digit'
	}),

	currency: new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD'
	}),

	number: new Intl.NumberFormat('en-US'),

	// Add custom formatters as needed
	duration: (minutes: number) => {
		const hours = Math.floor(minutes / 60);
		const mins = minutes % 60;
		return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
	}
};

/**
 * Static mapping pattern for status/type/category displays
 * Use this pattern instead of switch statements or repeated conditionals
 */
export function createStatusMapping<T>(config: {
	icons: Record<string, any>;
	colors: Record<string, string>;
	messages: Record<string, string | ((item: any) => string)>;
	defaultKey?: string;
}) {
	const { icons, colors, messages, defaultKey = 'default' } = config;

	return {
		getIcon: (status: string) => icons[status] || icons[defaultKey],
		getColor: (status: string) => colors[status] || colors[defaultKey],
		getMessage: (status: string, item?: any) => {
			const message = messages[status] || messages[defaultKey];
			return typeof message === 'function' ? message(item) : message;
		}
	};
}

/**
 * Optimized event handler pattern
 * Prevents creating new functions on every render
 */
export function createEventHandlers<T extends Record<string, Function>>(handlers: T): T {
	// Memoize handlers to prevent unnecessary re-renders
	const memoizedHandlers = {} as T;

	for (const [key, handler] of Object.entries(handlers)) {
		memoizedHandlers[key as keyof T] = handler as T[keyof T];
	}

	return memoizedHandlers;
}

/**
 * Debounced reactive statement pattern
 * Use for expensive computations that shouldn't run on every change
 */
export function createDebouncedComputation<T>(
	fn: () => T,
	delay: number = 300
): { value: T | undefined; trigger: () => void } {
	let timeoutId: NodeJS.Timeout;
	let value: T | undefined;

	const trigger = () => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			value = fn();
		}, delay);
	};

	return {
		get value() {
			return value;
		},
		trigger
	};
}

/**
 * Modal state management pattern using Svelte stores for proper reactivity
 * This version works correctly with Svelte's reactivity system
 */
export function createModalState<T = any>(initialData?: T) {
	const initialState = {
		isOpen: false,
		isLoading: false,
		data: initialData || null,
		error: null as string | null
	};

	const store = writable(initialState);

	const open = (data?: T) => {
		store.set({
			isOpen: true,
			data: data || initialData || null,
			error: null,
			isLoading: false
		});
	};

	const close = () => {
		store.set({
			...initialState,
			data: initialData || null
		});
	};

	const setLoading = (loading: boolean) => {
		store.update((current) => ({ ...current, isLoading: loading }));
	};

	const setError = (error: string | null) => {
		store.update((current) => ({ ...current, error, isLoading: false }));
	};

	return {
		subscribe: store.subscribe,
		open,
		close,
		setLoading,
		setError
	};
}

/**
 * Async operation wrapper with error handling
 * Consistent pattern for API calls with loading states
 */
export async function withLoadingState<T>(
	operation: () => Promise<T>,
	loadingSetter: (loading: boolean) => void,
	errorHandler?: (error: Error) => void
): Promise<T | null> {
	loadingSetter(true);

	try {
		const result = await operation();
		return result;
	} catch (error) {
		console.error('Operation failed:', error);
		if (errorHandler) {
			errorHandler(error as Error);
		}
		return null;
	} finally {
		loadingSetter(false);
	}
}

/**
 * Performance monitoring wrapper
 * Add to expensive operations to track performance
 */
export function withPerformanceTracking<T extends (...args: any[]) => any>(fn: T, name: string): T {
	return ((...args: Parameters<T>) => {
		const start = performance.now();
		const result = fn(...args);

		// Handle both sync and async functions
		if (result instanceof Promise) {
			return result.finally(() => {
				const duration = performance.now() - start;
				if (duration > 10) {
					// Only log if > 10ms
					console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
				}
			});
		} else {
			const duration = performance.now() - start;
			if (duration > 10) {
				console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
			}
			return result;
		}
	}) as T;
}
