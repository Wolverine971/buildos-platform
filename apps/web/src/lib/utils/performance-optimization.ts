// apps/web/src/lib/utils/performance-optimization.ts

/**
 * Debounce function to prevent excessive function calls
 */
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number
): (...args: Parameters<T>) => void {
	let timeout: NodeJS.Timeout;
	return (...args: Parameters<T>) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => func(...args), wait);
	};
}

/**
 * Throttle function to limit function call frequency
 */
export function throttle<T extends (...args: any[]) => any>(
	func: T,
	limit: number
): (...args: Parameters<T>) => void {
	let inThrottle: boolean;
	return (...args: Parameters<T>) => {
		if (!inThrottle) {
			func(...args);
			inThrottle = true;
			setTimeout(() => (inThrottle = false), limit);
		}
	};
}

/**
 * Memoization utility for expensive computations
 */
export function memoize<T extends (...args: any[]) => any>(
	fn: T,
	keyGenerator?: (...args: Parameters<T>) => string
): T {
	const cache = new Map<string, ReturnType<T>>();

	return ((...args: Parameters<T>): ReturnType<T> => {
		const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);

		if (cache.has(key)) {
			return cache.get(key)!;
		}

		const result = fn(...args);
		cache.set(key, result);
		return result;
	}) as T;
}

/**
 * Lazy loader for components
 */
export function lazyLoad<T>(importFn: () => Promise<{ default: T }>): () => Promise<T> {
	let componentPromise: Promise<T> | null = null;

	return () => {
		if (!componentPromise) {
			componentPromise = importFn().then((module) => module.default);
		}
		return componentPromise;
	};
}

/**
 * Virtual scrolling helper for large lists
 */
export function createVirtualScroller(
	containerHeight: number,
	itemHeight: number,
	buffer: number = 5
) {
	return {
		getVisibleRange(scrollTop: number, totalItems: number) {
			const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
			const endIndex = Math.min(
				totalItems - 1,
				Math.ceil((scrollTop + containerHeight) / itemHeight) + buffer
			);
			return { startIndex, endIndex };
		},

		getScrollHeight(totalItems: number) {
			return totalItems * itemHeight;
		},

		getOffsetY(startIndex: number) {
			return startIndex * itemHeight;
		}
	};
}

/**
 * Performance monitoring utility
 */
export class PerformanceMonitor {
	private marks = new Map<string, number>();

	mark(name: string) {
		this.marks.set(name, performance.now());
	}

	measure(name: string, startMark?: string): number {
		const endTime = performance.now();
		const startTime = startMark ? this.marks.get(startMark) : this.marks.get(name);

		if (!startTime) {
			console.warn(`Performance mark '${startMark || name}' not found`);
			return 0;
		}

		const duration = endTime - startTime;
		console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
		return duration;
	}

	clearMarks() {
		this.marks.clear();
	}
}

/**
 * Image lazy loading with intersection observer
 */
export function createImageLazyLoader() {
	if (typeof IntersectionObserver === 'undefined') {
		return null;
	}

	return new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					const img = entry.target as HTMLImageElement;
					const src = img.dataset.src;
					if (src) {
						img.src = src;
						img.removeAttribute('data-src');
					}
				}
			});
		},
		{
			rootMargin: '50px'
		}
	);
}

/**
 * Bundle size analyzer for development
 */
export function analyzeBundleImpact(componentName: string) {
	if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
		const startTime = performance.now();

		return {
			finish() {
				const endTime = performance.now();
				console.log(
					`[Bundle] ${componentName} load time: ${(endTime - startTime).toFixed(2)}ms`
				);
			}
		};
	}

	return { finish: () => {} };
}
