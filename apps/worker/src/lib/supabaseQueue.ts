// apps/worker/src/lib/supabaseQueue.ts
import type { Database, Json, QueueJobStatus, QueueJobType } from '@buildos/shared-types';
import { queueConfig } from '../config/queueConfig';
import { updateJobProgress } from './progressTracker';
import { supabase } from './supabase';

type QueueJob = Database['public']['Tables']['queue_jobs']['Row'];
type JobStatus = QueueJobStatus;
type JobType = QueueJobType;

export interface JobOptions {
	priority?: number;
	scheduledFor?: Date;
	attempts?: number;
	dedupKey?: string;
}

export interface JobProgress {
	current: number;
	total: number;
	message?: string;
	[key: string]: Json | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic defaults require any for queue flexibility
export type JobProcessor<T = any> = (job: ProcessingJob<T>) => Promise<unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic defaults require any for queue flexibility
export interface ProcessingJob<T = any> {
	id: string;
	userId: string;
	data: T;
	attempts: number;

	// Methods for job control
	updateProgress: (progress: JobProgress) => Promise<void>;
	log: (message: string) => Promise<void>;
}

export class SupabaseQueue {
	private processors: Map<JobType, JobProcessor> = new Map();
	private processingInterval: NodeJS.Timeout | null = null;
	private stalledJobInterval: NodeJS.Timeout | null = null;
	private isProcessing = false;
	private pollInterval: number;
	private batchSize: number;
	private stalledTimeout: number;
	private stalledJobRetryCount = 0;
	private readonly MAX_STALLED_RETRIES = 3;

	constructor(options?: { pollInterval?: number; batchSize?: number; stalledTimeout?: number }) {
		this.pollInterval = options?.pollInterval ?? 5000; // 5 seconds
		this.batchSize = options?.batchSize ?? 5;
		this.stalledTimeout = options?.stalledTimeout ?? 300000; // 5 minutes
	}

	/**
	 * Add a job to the queue
	 */
	async add(
		jobType: JobType,
		userId: string,
		data: Record<string, Json | undefined>,
		options?: JobOptions
	): Promise<QueueJob> {
		const dedupKey =
			options?.dedupKey ??
			`${jobType}-${userId}-${options?.scheduledFor?.toISOString() ?? Date.now()}`;

		// Use the database function for atomic insert with deduplication
		const { data: jobId, error } = await supabase.rpc('add_queue_job', {
			p_user_id: userId,
			p_job_type: jobType,
			p_metadata: data,
			p_priority: options?.priority ?? 10,
			p_scheduled_for: options?.scheduledFor?.toISOString() ?? new Date().toISOString(),
			p_dedup_key: dedupKey
		});

		if (error) {
			throw new Error(`Failed to add job: ${error.message}`);
		}

		// Fetch the created job
		const { data: job, error: fetchError } = await supabase
			.from('queue_jobs')
			.select('*')
			.eq('id', jobId)
			.single();

		if (fetchError || !job) {
			throw new Error(`Failed to fetch created job: ${fetchError?.message}`);
		}

		console.log(`📝 Added ${jobType} job ${job.queue_job_id} for user ${userId}`);
		return job;
	}

	/**
	 * Register a processor for a job type
	 */
	process(jobType: JobType, processor: JobProcessor): void {
		this.processors.set(jobType, processor);
		console.log(`🔧 Registered processor for ${jobType}`);
	}

	/**
	 * Start processing jobs
	 */
	async start(): Promise<void> {
		if (this.processingInterval) {
			console.warn('⚠️ Queue already started');
			return;
		}

		console.log('🚀 Starting Supabase queue processor');
		console.log(`   - Poll interval: ${this.pollInterval}ms`);
		console.log(`   - Batch size: ${this.batchSize}`);
		console.log(`   - Stalled timeout: ${this.stalledTimeout}ms`);
		console.log(`   - Job types: ${Array.from(this.processors.keys()).join(', ')}`);

		// Process immediately on start
		await this.processJobs();

		// Set up polling interval
		this.processingInterval = setInterval(async () => {
			if (!this.isProcessing) {
				await this.processJobs();
			}
		}, this.pollInterval);

		// Set up stalled job recovery (every minute)
		this.stalledJobInterval = setInterval(async () => {
			await this.recoverStalledJobs();
		}, 60000);

		console.log('✅ Queue processor started');
	}

	/**
	 * Stop processing jobs
	 */
	stop(): void {
		if (this.processingInterval) {
			clearInterval(this.processingInterval);
			this.processingInterval = null;
		}
		if (this.stalledJobInterval) {
			clearInterval(this.stalledJobInterval);
			this.stalledJobInterval = null;
		}
		console.log('🛑 Queue processor stopped');
	}

	/**
	 * Process pending jobs
	 */
	private async processJobs(): Promise<void> {
		if (this.isProcessing) return;

		this.isProcessing = true;
		try {
			// Claim jobs atomically using the database function
			const jobTypes = Array.from(this.processors.keys());

			const { data: jobs, error } = await supabase.rpc('claim_pending_jobs', {
				p_job_types: jobTypes,
				p_batch_size: this.batchSize
			});

			if (error) {
				console.error('❌ Error claiming jobs:', error);
				return;
			}

			if (!jobs || jobs.length === 0) {
				return; // No jobs to process
			}

			console.log(`🎯 Claimed ${jobs.length} job(s) for processing`);

			// Process jobs concurrently with proper error isolation
			const results = await Promise.allSettled(
				jobs.map((job) => this.processJob(job as QueueJob))
			);

			// Log any failed job results for monitoring
			const failedJobs = results
				.map((result, index) => ({ result, index }))
				.filter(({ result }) => result.status === 'rejected')
				.map(({ result, index }) => ({
					jobId: jobs[index].queue_job_id,
					reason: (result as PromiseRejectedResult).reason
				}));

			if (failedJobs.length > 0) {
				console.warn(`⚠️ ${failedJobs.length} job(s) failed during processing:`);
				failedJobs.forEach(({ jobId, reason }) => {
					console.warn(`   - Job ${jobId}: ${reason}`);
				});
			}

			const successfulJobs = results.filter((result) => result.status === 'fulfilled').length;
			if (successfulJobs > 0) {
				console.log(`✅ Successfully processed ${successfulJobs} job(s)`);
			}
		} catch (error) {
			console.error('❌ Error in job processing loop:', error);
		} finally {
			this.isProcessing = false;
		}
	}

	/**
	 * Process a single job with comprehensive error isolation
	 */
	private async processJob(job: QueueJob): Promise<void> {
		// Wrap the entire method to ensure no errors escape and crash other jobs
		try {
			const processor = this.processors.get(job.job_type as JobType);
			if (!processor) {
				console.error(`❌ No processor registered for job type: ${job.job_type}`);
				await this.failJob(job.id, `No processor for job type: ${job.job_type}`, false);
				return;
			}

			const startTime = Date.now();
			console.log(`🏃 Processing ${job.job_type} job ${job.queue_job_id}`);

			// Process the job with proper error handling
			await this.executeJobProcessor(job, processor, startTime);
		} catch (error) {
			// This is a catch-all for any unexpected errors in job setup or processing
			console.error(`❌ Unexpected error processing job ${job.queue_job_id}:`, error);

			try {
				// Attempt to mark the job as failed, but don't let this error crash the system
				await this.failJob(
					job.id,
					`Unexpected processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
					false
				);
			} catch (failError) {
				console.error(`❌ Failed to mark job ${job.queue_job_id} as failed:`, failError);
			}
		}
	}

	/**
	 * Execute the job processor with proper error handling
	 */
	private async executeJobProcessor(
		job: QueueJob,
		processor: JobProcessor,
		startTime: number
	): Promise<void> {
		try {
			// Create processing job wrapper
			const processingJob: ProcessingJob = {
				id: job.queue_job_id,
				userId: job.user_id!,
				data: job.metadata,
				attempts: job.attempts || 0,

				updateProgress: async (progress: JobProgress) => {
					const success = await updateJobProgress(job.id, progress);
					if (!success) {
						// Log the failure but don't throw - progress updates should not crash jobs
						console.warn(
							`⚠️ Progress update failed for job ${job.queue_job_id}, continuing with job execution`
						);
					}
				},

				log: (message: string): Promise<void> => {
					console.log(`   📝 [${job.queue_job_id}] ${message}`);
					return Promise.resolve();
				}
			};

			// Process the job
			const result = await processor(processingJob);

			// Mark as completed
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated Supabase types
			const { error } = await (supabase as any).rpc('complete_queue_job', {
				p_job_id: job.id,
				p_result: result
			});

			if (error) {
				throw new Error(`Failed to mark job as completed: ${error.message}`);
			}

			const duration = Date.now() - startTime;
			console.log(`✅ Completed ${job.job_type} job ${job.queue_job_id} in ${duration}ms`);
		} catch (error: unknown) {
			console.error(`❌ Job ${job.queue_job_id} failed:`, error);

			// Determine if we should retry - use configuration instead of hardcoded value
			const maxRetries = job.max_attempts || queueConfig.maxRetries;
			const shouldRetry = (job.attempts || 0) < maxRetries;
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			await this.failJob(job.id, errorMessage, shouldRetry);
		}
	}

	/**
	 * Mark a job as failed
	 */
	private async failJob(jobId: string, errorMessage: string, retry: boolean): Promise<void> {
		const { error } = await supabase.rpc('fail_queue_job', {
			p_job_id: jobId,
			p_error_message: errorMessage,
			p_retry: retry
		});

		if (error) {
			console.error(`❌ Failed to update job status: ${error.message}`);
		}
	}

	/**
	 * Recover stalled jobs with retry logic
	 */
	private async recoverStalledJobs(): Promise<void> {
		try {
			const { data: count, error } = await supabase.rpc('reset_stalled_jobs', {
				p_stall_timeout: `${this.stalledTimeout / 1000} seconds`
			});

			if (error) {
				this.stalledJobRetryCount++;

				if (this.stalledJobRetryCount >= this.MAX_STALLED_RETRIES) {
					console.error(
						`❌ CRITICAL: Stalled job recovery failed ${this.MAX_STALLED_RETRIES} times:`,
						error
					);
					// In production, alert ops team here
					this.stalledJobRetryCount = 0; // Reset for next attempt
				} else {
					console.warn(
						`⚠️ Stalled job recovery failed (attempt ${this.stalledJobRetryCount}/${this.MAX_STALLED_RETRIES}):`,
						error.message
					);
				}
				return;
			}

			// Reset on success
			this.stalledJobRetryCount = 0;

			if (count && count > 0) {
				console.log(`🔄 Recovered ${count} stalled job(s)`);
			}
		} catch (error) {
			console.error('❌ Unexpected error in stalled job recovery:', error);
			this.stalledJobRetryCount++;

			if (this.stalledJobRetryCount >= this.MAX_STALLED_RETRIES) {
				console.error(
					'❌ CRITICAL: Stalled job recovery crashes repeatedly - check database connection'
				);
				this.stalledJobRetryCount = 0;
			}
		}
	}

	/**
	 * Get queue statistics
	 */
	async getStats(): Promise<Record<string, unknown>[] | null> {
		const { data, error } = await supabase.from('queue_jobs_stats').select('*');

		if (error) {
			console.error('❌ Error fetching queue stats:', error);
			return null;
		}

		return data;
	}

	/**
	 * Cancel a single job (legacy method - prefer atomic methods below)
	 */
	async cancelJob(jobId: string): Promise<boolean> {
		const { error } = await supabase
			.from('queue_jobs')
			.update({
				status: 'cancelled',
				updated_at: new Date().toISOString()
			})
			.eq('queue_job_id', jobId)
			.in('status', ['pending', 'processing']);

		if (error) {
			console.error(`❌ Error cancelling job ${jobId}:`, error);
			return false;
		}

		console.log(`🚫 Cancelled job ${jobId}`);
		return true;
	}

	/**
	 * Atomically cancel jobs matching specific criteria
	 */
	async cancelJobsAtomic(
		userId: string,
		jobType: JobType,
		metadataFilter?: Record<string, unknown>,
		allowedStatuses: string[] = ['pending', 'processing']
	): Promise<{ count: number; cancelledJobs: unknown[] }> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated Supabase types
			const { data: cancelledJobs, error } = await (supabase as any).rpc(
				'cancel_jobs_atomic',
				{
					p_user_id: userId,
					p_job_type: jobType,
					p_metadata_filter: metadataFilter || null,
					p_allowed_statuses: allowedStatuses
				}
			);

			if (error) {
				console.error('❌ Error in atomic job cancellation:', error);
				return { count: 0, cancelledJobs: [] };
			}

			const jobs = Array.isArray(cancelledJobs) ? cancelledJobs : [];
			const count = jobs.length;
			if (count > 0) {
				console.log(`🚫 Atomically cancelled ${count} job(s) for user ${userId}`);
			}

			return { count, cancelledJobs: jobs };
		} catch (error) {
			console.error('❌ Error in cancelJobsAtomic:', error);
			return { count: 0, cancelledJobs: [] };
		}
	}

	/**
	 * Cancel brief generation jobs for a specific date (atomic operation)
	 */
	async cancelBriefJobsForDate(
		userId: string,
		briefDate: string,
		excludeJobId?: string
	): Promise<{ count: number; cancelledJobIds: string[] }> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated Supabase types
			const { data, error } = await (supabase as any).rpc('cancel_brief_jobs_for_date', {
				p_user_id: userId,
				p_brief_date: briefDate,
				p_exclude_job_id: excludeJobId || null
			});

			if (error) {
				console.error('❌ Error cancelling brief jobs:', error);
				return { count: 0, cancelledJobIds: [] };
			}

			const result = Array.isArray(data) ? data[0] : null;
			const count = ((result as Record<string, unknown>)?.cancelled_count as number) || 0;
			const cancelledJobIds =
				((result as Record<string, unknown>)?.cancelled_job_ids as string[]) || [];

			if (count > 0) {
				console.log(`🚫 Cancelled ${count} brief job(s) for date ${briefDate}`);
			}

			return { count, cancelledJobIds };
		} catch (error) {
			console.error('❌ Error in cancelBriefJobsForDate:', error);
			return { count: 0, cancelledJobIds: [] };
		}
	}

	/**
	 * Cancel a job with a specific reason
	 */
	async cancelJobWithReason(
		jobId: string,
		reason: string,
		allowProcessing: boolean = false
	): Promise<boolean> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in generated Supabase types
			const { data: success, error } = await (supabase as any).rpc('cancel_job_with_reason', {
				p_job_id: jobId,
				p_reason: reason,
				p_allow_processing: allowProcessing
			});

			if (error) {
				console.error(`❌ Error cancelling job ${jobId}:`, error);
				return false;
			}

			const result = success as boolean;
			if (result) {
				console.log(`🚫 Cancelled job ${jobId}: ${reason}`);
			}

			return result || false;
		} catch (error) {
			console.error('❌ Error in cancelJobWithReason:', error);
			return false;
		}
	}

	/**
	 * Get job by ID
	 */
	async getJob(jobId: string): Promise<QueueJob | null> {
		const { data, error } = await supabase
			.from('queue_jobs')
			.select('*')
			.eq('queue_job_id', jobId)
			.single();

		if (error) {
			console.error(`❌ Error fetching job ${jobId}:`, error);
			return null;
		}

		return data;
	}

	/**
	 * Get jobs for a user
	 */
	async getUserJobs(
		userId: string,
		options?: {
			jobType?: JobType;
			status?: JobStatus;
			limit?: number;
		}
	): Promise<QueueJob[]> {
		let query = supabase
			.from('queue_jobs')
			.select('*')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });

		if (options?.jobType) {
			query = query.eq('job_type', options.jobType);
		}
		if (options?.status) {
			query = query.eq('status', options.status);
		}
		if (options?.limit) {
			query = query.limit(options.limit);
		}

		const { data, error } = await query;

		if (error) {
			console.error('❌ Error fetching user jobs:', error);
			return [];
		}

		return data || [];
	}
}
