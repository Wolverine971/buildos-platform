// apps/worker/src/lib/progressTracker.ts
// This addresses Critical Issue #4 in QUEUE_FIXES_DESIGN.md

import { supabase } from './supabase';
import { JobProgress } from './supabaseQueue';
import { queueConfig } from '../config/queueConfig';

export interface ProgressUpdate {
	jobId: string;
	progress: JobProgress;
	retryCount?: number;
	timestamp?: Date;
}

export interface ProgressTrackingOptions {
	maxRetries?: number;
	retryDelayMs?: number;
	enableAuditLog?: boolean;
}

/**
 * Enhanced progress tracker with error handling, retries, and validation
 */
export class ProgressTracker {
	private maxRetries: number;
	private retryDelayMs: number;
	private enableAuditLog: boolean;

	constructor(options: ProgressTrackingOptions = {}) {
		this.maxRetries = options.maxRetries ?? 3;
		this.retryDelayMs = options.retryDelayMs ?? 1000;
		this.enableAuditLog = options.enableAuditLog ?? true;
	}

	/**
	 * Safely update job progress with validation and error handling
	 */
	async updateProgress(
		jobId: string,
		progress: JobProgress,
		retryCount: number = 0
	): Promise<boolean> {
		try {
			// Validate progress data
			const validatedProgress = this.validateProgress(progress);

			// Get current job metadata
			const { data: currentJob, error: fetchError } = await supabase
				.from('queue_jobs')
				.select('metadata, status')
				.eq('id', jobId)
				.single();

			if (fetchError) {
				console.error(`❌ Failed to fetch job ${jobId} for progress update:`, fetchError);
				return this.handleProgressUpdateError(
					jobId,
					progress,
					retryCount,
					new Error(fetchError.message)
				);
			}

			if (!currentJob) {
				console.warn(`⚠️ Job ${jobId} not found for progress update`);
				return false;
			}

			// Don't update progress for completed/failed/cancelled jobs
			if (!['pending', 'processing'].includes(currentJob.status)) {
				console.warn(
					`⚠️ Skipping progress update for job ${jobId} with status: ${currentJob.status}`
				);
				return false;
			}

			// Merge with existing metadata safely
			const currentMetadata = this.safeParseMetadata(currentJob.metadata);
			const updatedMetadata = {
				...currentMetadata,
				progress: validatedProgress,
				lastProgressUpdate: new Date().toISOString()
			};

			// Update the job with validated progress
			const { error: updateError } = await supabase
				.from('queue_jobs')
				.update({
					metadata: updatedMetadata,
					updated_at: new Date().toISOString()
				})
				.eq('id', jobId)
				.eq('status', currentJob.status); // Ensure status hasn't changed

			if (updateError) {
				console.error(`❌ Failed to update progress for job ${jobId}:`, updateError);
				return this.handleProgressUpdateError(
					jobId,
					progress,
					retryCount,
					new Error(updateError.message)
				);
			}

			// Log successful update
			console.log(
				`📈 Progress updated for job ${jobId}: ${validatedProgress.current}/${validatedProgress.total}`
			);

			// Audit log if enabled
			if (this.enableAuditLog) {
				this.logProgressUpdate(jobId, validatedProgress);
			}

			return true;
		} catch (error) {
			console.error(`❌ Unexpected error updating progress for job ${jobId}:`, error);
			return this.handleProgressUpdateError(
				jobId,
				progress,
				retryCount,
				error instanceof Error ? error : new Error(String(error))
			);
		}
	}

	/**
	 * Validate and normalize progress data
	 */
	private validateProgress(progress: JobProgress): JobProgress {
		if (!progress || typeof progress !== 'object') {
			throw new Error('Progress must be an object');
		}

		const validated: JobProgress = {
			...progress,
			current: 0, // Will be overridden below if valid
			total: 100 // Will be overridden below if valid
		};

		// Validate and set current
		if (typeof progress.current === 'number' && progress.current >= 0) {
			validated.current = progress.current;
		} else {
			console.warn('Invalid progress.current, defaulting to 0');
			validated.current = 0;
		}

		// Validate and set total
		if (typeof progress.total === 'number' && progress.total > 0) {
			validated.total = progress.total;
		} else {
			console.warn('Invalid progress.total, defaulting to 100');
			validated.total = 100;
		}

		// Ensure current doesn't exceed total
		if (validated.current > validated.total) {
			console.warn(
				`Progress current (${validated.current}) exceeds total (${validated.total}), capping to total`
			);
			validated.current = validated.total;
		}

		// Ensure message is string if provided
		if (validated.message && typeof validated.message !== 'string') {
			validated.message = String(validated.message);
		}

		return validated;
	}

	/**
	 * Safely parse job metadata
	 */
	private safeParseMetadata(metadata: unknown): Record<string, unknown> {
		if (!metadata) return {};
		if (typeof metadata === 'object' && metadata !== null)
			return metadata as Record<string, unknown>;

		// Try to parse if it's a string
		if (typeof metadata === 'string') {
			try {
				return JSON.parse(metadata);
			} catch {
				console.warn('Failed to parse metadata as JSON, returning empty object');
				return {};
			}
		}

		return {};
	}

	/**
	 * Handle progress update errors with smart retry logic
	 * Only retries on temporary errors with smaller backoff to avoid delaying jobs
	 */
	private async handleProgressUpdateError(
		jobId: string,
		progress: JobProgress,
		retryCount: number,
		error: Error
	): Promise<boolean> {
		// Check if this is a temporary error worth retrying
		const isTemporaryError = this.isTemporaryError(error);

		if (!isTemporaryError || retryCount >= this.maxRetries) {
			if (!isTemporaryError) {
				console.warn(
					`⚠️ Progress update failed permanently for job ${jobId} (non-temporary error):`,
					error.message
				);
			} else {
				console.error(
					`❌ Progress update failed for job ${jobId} after ${this.maxRetries} retries:`,
					error
				);
			}

			// Log the failure for monitoring (non-blocking)
			this.logProgressUpdateFailure(jobId, progress, error);
			// Don't block job execution for progress tracking failure
			return false;
		}

		// Use smaller backoff for progress tracking (50ms, 100ms, 200ms)
		// This avoids significantly delaying job execution
		const delay = 50 * Math.pow(2, retryCount);

		console.warn(
			`⚠️ Progress update temporary failure, retrying in ${delay}ms (${retryCount + 1}/${this.maxRetries}):`,
			error.message
		);

		// Wait before retry
		await new Promise((resolve) => setTimeout(resolve, delay));

		// Retry the update
		return this.updateProgress(jobId, progress, retryCount + 1);
	}

	/**
	 * Determine if an error is temporary and worth retrying
	 */
	private isTemporaryError(error: Error): boolean {
		const errorMessage = error.message;

		return (
			errorMessage.includes('connection') ||
			errorMessage.includes('timeout') ||
			errorMessage.includes('429') || // Rate limit
			errorMessage.includes('ETIMEDOUT') ||
			errorMessage.includes('ECONNREFUSED') ||
			errorMessage.includes('ECONNRESET') ||
			errorMessage.includes('network')
		);
	}

	/**
	 * Log successful progress updates for monitoring
	 */
	private logProgressUpdate(jobId: string, progress: JobProgress): void {
		try {
			// This is a simple audit log - in production you might want to batch these
			// or use a separate logging service to avoid overwhelming the database
			console.debug(
				`📋 Progress audit: Job ${jobId} - ${progress.current}/${progress.total}`
			);
		} catch (error) {
			// Don't fail the main operation if audit logging fails
			console.warn('Failed to log progress update:', error);
		}
	}

	/**
	 * Log progress update failures for monitoring and alerting
	 */
	private logProgressUpdateFailure(jobId: string, progress: JobProgress, error: Error): void {
		try {
			console.error(
				`🚨 Progress update failure - Job: ${jobId}, Progress: ${JSON.stringify(progress)}, Error: ${error.message}`
			);

			// In production, you might want to send this to a monitoring service
			// like Sentry, DataDog, or write to a dedicated error log table
		} catch (logError) {
			console.error('Failed to log progress update failure:', logError);
		}
	}

	/**
	 * Get current progress for a job
	 */
	async getJobProgress(jobId: string): Promise<JobProgress | null> {
		try {
			const { data: job, error } = await supabase
				.from('queue_jobs')
				.select('metadata')
				.eq('id', jobId)
				.single();

			if (error || !job) {
				console.error(`Failed to get progress for job ${jobId}:`, error);
				return null;
			}

			const metadata = this.safeParseMetadata(job.metadata);
			return (metadata.progress as JobProgress) || null;
		} catch (error) {
			console.error(`Error getting job progress for ${jobId}:`, error);
			return null;
		}
	}
}

// Default global progress tracker instance using configuration
export const progressTracker = new ProgressTracker({
	maxRetries: queueConfig.progressUpdateRetries,
	retryDelayMs: queueConfig.retryBackoffBase,
	enableAuditLog: queueConfig.enableProgressTracking && process.env.NODE_ENV !== 'production'
});

/**
 * Convenience function for updating progress
 */
export function updateJobProgress(jobId: string, progress: JobProgress): Promise<boolean> {
	return progressTracker.updateProgress(jobId, progress);
}
