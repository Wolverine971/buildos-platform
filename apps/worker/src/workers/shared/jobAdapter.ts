// apps/worker/src/workers/shared/jobAdapter.ts
// Type-safe adapter for converting between Supabase queue jobs and legacy BullMQ interface
// This addresses Critical Issue #1 in QUEUE_FIXES_DESIGN.md

import { JobProgress, ProcessingJob } from '../../lib/supabaseQueue';

/**
 * Legacy BullMQ-compatible job interface that our existing workers expect
 */
export interface LegacyJob<T = any> {
	id: string;
	data: T & { userId: string };
	opts: {
		priority?: number;
	};
	timestamp: number;
	attemptsMade: number;
	updateProgress: (progress: number | object) => Promise<void>;
	log: (message: string) => Promise<void>;
}

/**
 * Type-safe adapter that converts ProcessingJob to LegacyJob format
 */
export class JobAdapter<T = any> {
	private processingJob: ProcessingJob<T>;
	private legacyJob: LegacyJob<T>;

	constructor(processingJob: ProcessingJob<T>) {
		this.processingJob = processingJob;
		this.legacyJob = this.createLegacyInterface();
	}

	/**
	 * Get the legacy-compatible job interface
	 */
	getLegacyJob(): LegacyJob<T> {
		return this.legacyJob;
	}

	/**
	 * Create the legacy job interface with proper type safety
	 */
	private createLegacyInterface(): LegacyJob<T> {
		return {
			id: this.processingJob.id,
			data: {
				...this.processingJob.data,
				userId: this.processingJob.userId // Ensure userId is at top level
			},
			opts: {
				priority: (this.processingJob.data as any)?.priority || 10
			},
			timestamp: Date.now(),
			attemptsMade: this.processingJob.attempts,
			updateProgress: this.createProgressUpdater(),
			log: this.processingJob.log
		};
	}

	/**
	 * Create a type-safe progress updater that handles both number and object formats
	 */
	private createProgressUpdater() {
		return async (progress: number | object): Promise<void> => {
			try {
				let progressData: JobProgress;

				if (typeof progress === 'number') {
					// Convert number to standard progress object
					progressData = {
						current: progress,
						total: 100,
						message: `${progress}% complete`
					};
				} else if (progress && typeof progress === 'object') {
					// Validate and normalize object progress
					progressData = this.normalizeProgressObject(progress);
				} else {
					throw new Error('Invalid progress data: must be number or object');
				}

				await this.processingJob.updateProgress(progressData);
			} catch (error) {
				// Log error but don't throw - progress updates should not crash jobs
				await this.processingJob.log(
					`Warning: Progress update failed: ${error instanceof Error ? error.message : 'Unknown error'}`
				);
			}
		};
	}

	/**
	 * Normalize and validate progress objects
	 */
	private normalizeProgressObject(progress: any): JobProgress {
		// Ensure we have at least current and total
		const normalized: JobProgress = {
			current: 0,
			total: 100,
			...progress
		};

		// Validate required fields
		if (typeof normalized.current !== 'number' || normalized.current < 0) {
			throw new Error('Progress current must be a non-negative number');
		}

		if (typeof normalized.total !== 'number' || normalized.total <= 0) {
			throw new Error('Progress total must be a positive number');
		}

		// Ensure current doesn't exceed total
		if (normalized.current > normalized.total) {
			normalized.current = normalized.total;
		}

		return normalized;
	}
}

/**
 * Utility function to create a type-safe legacy job from ProcessingJob
 */
export function createLegacyJob<T>(processingJob: ProcessingJob<T>): LegacyJob<T> {
	const adapter = new JobAdapter(processingJob);
	return adapter.getLegacyJob();
}

/**
 * Type guard to check if an object is a valid ProcessingJob
 */
export function isProcessingJob(obj: any): obj is ProcessingJob {
	return (
		obj &&
		typeof obj.id === 'string' &&
		typeof obj.userId === 'string' &&
		obj.data !== undefined &&
		typeof obj.attempts === 'number' &&
		typeof obj.updateProgress === 'function' &&
		typeof obj.log === 'function'
	);
}

/**
 * Type guard to check if an object is a valid LegacyJob
 */
export function isLegacyJob(obj: any): obj is LegacyJob {
	return (
		obj &&
		typeof obj.id === 'string' &&
		obj.data &&
		typeof obj.data.userId === 'string' &&
		obj.opts &&
		typeof obj.timestamp === 'number' &&
		typeof obj.attemptsMade === 'number' &&
		typeof obj.updateProgress === 'function' &&
		typeof obj.log === 'function'
	);
}
