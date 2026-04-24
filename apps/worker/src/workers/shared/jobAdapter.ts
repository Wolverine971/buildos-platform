// apps/worker/src/workers/shared/jobAdapter.ts
// Type-safe adapter for converting between Supabase queue jobs and legacy BullMQ interface
// This addresses Critical Issue #1 in QUEUE_FIXES_DESIGN.md

import { JobProgress, ProcessingJob } from '../../lib/supabaseQueue';

/**
 * Legacy BullMQ-compatible job interface that our existing workers expect.
 * Callers must pass the concrete metadata type (e.g. `LegacyJob<BriefJobData>`).
 */
export interface LegacyJob<T> {
	id: string;
	processingToken?: string | null;
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
export class JobAdapter<T> {
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
		const data = (this.processingJob.data ?? {}) as Record<string, unknown>;
		const priorityField = data.priority;
		const priority = typeof priorityField === 'number' ? priorityField : 10;

		return {
			id: this.processingJob.id,
			processingToken: this.processingJob.processingToken ?? null,
			data: {
				...(this.processingJob.data as T),
				userId: this.processingJob.userId // Ensure userId is at top level
			},
			opts: { priority },
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
	private normalizeProgressObject(progress: object): JobProgress {
		// Ensure we have at least current and total
		const normalized: JobProgress = {
			current: 0,
			total: 100,
			...(progress as Record<string, unknown>)
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
export function isProcessingJob(obj: unknown): obj is ProcessingJob {
	if (!obj || typeof obj !== 'object') return false;
	const candidate = obj as Record<string, unknown>;
	return (
		typeof candidate.id === 'string' &&
		typeof candidate.userId === 'string' &&
		candidate.data !== undefined &&
		typeof candidate.attempts === 'number' &&
		typeof candidate.updateProgress === 'function' &&
		typeof candidate.log === 'function'
	);
}

/**
 * Type guard to check if an object is a valid LegacyJob
 */
export function isLegacyJob(obj: unknown): obj is LegacyJob<unknown> {
	if (!obj || typeof obj !== 'object') return false;
	const candidate = obj as Record<string, unknown>;
	const data = candidate.data as Record<string, unknown> | undefined;
	return (
		typeof candidate.id === 'string' &&
		!!data &&
		typeof data.userId === 'string' &&
		typeof candidate.opts === 'object' &&
		typeof candidate.timestamp === 'number' &&
		typeof candidate.attemptsMade === 'number' &&
		typeof candidate.updateProgress === 'function' &&
		typeof candidate.log === 'function'
	);
}
