// apps/web/src/lib/utils/performance-monitor.ts
/**
 * Performance monitoring utility for tracking key metrics
 * Based on the audit recommendations for monitoring:
 * - Page initialization time
 * - Memory usage during navigation
 * - Component loading performance
 * - Store operation timing
 */

import { dev } from '$app/environment';
interface PerformanceMetric {
	name: string;
	startTime: number;
	endTime?: number;
	duration?: number;
	metadata?: Record<string, any>;
}

interface MemorySnapshot {
	timestamp: number;
	heapUsed?: number;
	heapTotal?: number;
	external?: number;
	rss?: number;
	url?: string;
	action?: string;
}

class PerformanceMonitor {
	private metrics: Map<string, PerformanceMetric> = new Map();
	private memorySnapshots: MemorySnapshot[] = [];
	private maxSnapshots = 20; // Keep last 20 memory snapshots
	private isEnabled = true;

	constructor() {
		// Enable only in development or when explicitly enabled
		this.isEnabled =
			dev ||
			(typeof window !== 'undefined' &&
				window.localStorage?.getItem('performance-monitor') === 'true');
	}

	/**
	 * Start timing a performance metric
	 */
	startTimer(name: string, metadata?: Record<string, any>): void {
		if (!this.isEnabled) return;

		this.metrics.set(name, {
			name,
			startTime: performance.now(),
			metadata
		});
	}

	/**
	 * End timing a performance metric and log results
	 */
	endTimer(name: string, metadata?: Record<string, any>): number | null {
		if (!this.isEnabled) return null;

		const metric = this.metrics.get(name);
		if (!metric) {
			return null;
		}

		const endTime = performance.now();
		const duration = endTime - metric.startTime;

		metric.endTime = endTime;
		metric.duration = duration;
		if (metadata) {
			metric.metadata = { ...metric.metadata, ...metadata };
		}

		// Log performance metric
		console.log(`[PerformanceMonitor] ${name}: ${duration.toFixed(2)}ms`, metric.metadata);

		// Warn if duration exceeds thresholds
		this.checkThresholds(name, duration);

		return duration;
	}

	/**
	 * Take a memory snapshot
	 */
	takeMemorySnapshot(action?: string, url?: string): void {
		if (!this.isEnabled || typeof window === 'undefined') return;

		// Use performance.memory if available (Chrome)
		const memory = (performance as any).memory;
		const snapshot: MemorySnapshot = {
			timestamp: Date.now(),
			action,
			url
		};

		if (memory) {
			snapshot.heapUsed = memory.usedJSHeapSize;
			snapshot.heapTotal = memory.totalJSHeapSize;
		}

		this.memorySnapshots.push(snapshot);

		// Trim old snapshots
		if (this.memorySnapshots.length > this.maxSnapshots) {
			this.memorySnapshots = this.memorySnapshots.slice(-this.maxSnapshots);
		}

		console.log(`[PerformanceMonitor] Memory snapshot`, snapshot);
	}

	/**
	 * Check performance thresholds and warn if exceeded
	 */
	private checkThresholds(name: string, duration: number): void {
		const thresholds: Record<string, number> = {
			'page-initialization': 3000, // 3 seconds
			'component-loading': 1000, // 1 second
			'store-operation': 500, // 500ms
			'data-loading': 2000, // 2 seconds
			navigation: 1500 // 1.5 seconds
		};

		for (const [pattern, threshold] of Object.entries(thresholds)) {
			if (name.includes(pattern) && duration > threshold) {
				console.warn(
					`[PerformanceMonitor] ⚠️ Slow operation: ${name} took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`
				);
				break;
			}
		}
	}

	/**
	 * Get performance summary
	 */
	getSummary(): { metrics: PerformanceMetric[]; memorySnapshots: MemorySnapshot[] } {
		return {
			metrics: Array.from(this.metrics.values()),
			memorySnapshots: [...this.memorySnapshots]
		};
	}

	/**
	 * Clear all metrics and snapshots
	 */
	clear(): void {
		this.metrics.clear();
		this.memorySnapshots = [];
	}

	/**
	 * Enable/disable monitoring
	 */
	setEnabled(enabled: boolean): void {
		this.isEnabled = enabled;
		if (typeof window !== 'undefined') {
			if (enabled) {
				window.localStorage?.setItem('performance-monitor', 'true');
			} else {
				window.localStorage?.removeItem('performance-monitor');
			}
		}
	}

	/**
	 * Monitor a function execution
	 */
	monitor<T>(name: string, fn: () => T, metadata?: Record<string, any>): T {
		if (!this.isEnabled) return fn();

		this.startTimer(name, metadata);
		try {
			const result = fn();

			// Handle async functions
			if (result instanceof Promise) {
				return result.finally(() => {
					this.endTimer(name);
				}) as T;
			}

			this.endTimer(name);
			return result;
		} catch (error) {
			this.endTimer(name, { error: error instanceof Error ? error.message : String(error) });
			throw error;
		}
	}

	/**
	 * Monitor an async function execution
	 */
	async monitorAsync<T>(
		name: string,
		fn: () => Promise<T>,
		metadata?: Record<string, any>
	): Promise<T> {
		if (!this.isEnabled) return fn();

		this.startTimer(name, metadata);
		try {
			const result = await fn();
			this.endTimer(name);
			return result;
		} catch (error) {
			this.endTimer(name, { error: error instanceof Error ? error.message : String(error) });
			throw error;
		}
	}
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Convenience functions
export const startTimer = (name: string, metadata?: Record<string, any>) =>
	performanceMonitor.startTimer(name, metadata);
export const endTimer = (name: string, metadata?: Record<string, any>) =>
	performanceMonitor.endTimer(name, metadata);
export const takeMemorySnapshot = (action?: string, url?: string) =>
	performanceMonitor.takeMemorySnapshot(action, url);
export const monitor = <T>(name: string, fn: () => T, metadata?: Record<string, any>): T =>
	performanceMonitor.monitor(name, fn, metadata);
export const monitorAsync = <T>(
	name: string,
	fn: () => Promise<T>,
	metadata?: Record<string, any>
): Promise<T> => performanceMonitor.monitorAsync(name, fn, metadata);

// Browser globals for debugging
if (typeof window !== 'undefined') {
	(window as any).performanceMonitor = performanceMonitor;
}
