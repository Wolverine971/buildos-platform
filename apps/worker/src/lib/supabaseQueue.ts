// apps/worker/src/lib/supabaseQueue.ts
import type { Database, Json, QueueJobStatus, QueueJobType } from '@buildos/shared-types';
import { queueConfig, resolveWorkerTimeout } from '../config/queueConfig';
import { updateJobProgress } from './progressTracker';
import { supabase } from './supabase';

type QueueJob = Database['public']['Tables']['queue_jobs']['Row'];
type ClaimedQueueJob = QueueJob & { processing_token?: string | null };
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

export type JobProcessor<T = unknown> = (job: ProcessingJob<T>) => Promise<unknown>;

export interface ProcessingJob<T = unknown> {
	id: string;
	processingToken?: string | null;
	userId: string;
	data: T;
	attempts: number;

	/**
	 * Aborted when the job's worker timeout fires or the queue shuts down.
	 * Processors MUST treat an aborted signal as "you no longer own this work":
	 * stop LLM/provider calls and skip further domain writes — a retry may
	 * already be executing on another worker.
	 */
	signal: AbortSignal;

	// Methods for job control
	updateProgress: (progress: JobProgress) => Promise<void>;
	log: (message: string) => Promise<void>;
}

export function resolveQueueHeartbeatInterval(stalledTimeoutMs: number): number {
	const finiteTimeout = Number.isFinite(stalledTimeoutMs) ? stalledTimeoutMs : 300_000;
	return Math.max(5_000, Math.min(60_000, Math.floor(finiteTimeout / 3)));
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

	// Liveness tracking — lets /health detect a wedged poll loop or dead DB
	// credentials instead of reporting a static 200 forever.
	private started = false;
	private startedAtMs: number | null = null;
	private lastPollSuccessAtMs: number | null = null;
	private consecutiveClaimFailures = 0;

	// Graceful-shutdown drain tracking
	private inFlightBatch: Promise<void> | null = null;
	private inFlightJobTypes: string[] = [];
	private drainTimeout: number;
	private stopping: Promise<void> | null = null;

	// One AbortController per in-flight job so timeout/shutdown can actually
	// cancel processor work instead of just abandoning the promise.
	private activeJobControllers = new Set<AbortController>();

	constructor(options?: {
		pollInterval?: number;
		batchSize?: number;
		stalledTimeout?: number;
		drainTimeout?: number;
	}) {
		this.pollInterval = options?.pollInterval ?? 5000; // 5 seconds
		this.batchSize = options?.batchSize ?? 5;
		this.stalledTimeout = options?.stalledTimeout ?? 300000; // 5 minutes
		// Bounded drain window on shutdown. Stay under Railway's ~30s
		// SIGTERM→SIGKILL grace so we always return before the hard kill.
		this.drainTimeout =
			options?.drainTimeout ?? (Number(process.env.QUEUE_DRAIN_TIMEOUT_MS) || 25000);
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
	 * Register a processor for a job type. `T` is the concrete metadata type
	 * the processor expects (per-job); the queue stores them type-erased.
	 */
	process<T>(jobType: JobType, processor: JobProcessor<T>): void {
		this.processors.set(jobType, processor as JobProcessor);
		console.log(`🔧 Registered processor for ${jobType}`);
	}

	/**
	 * Return the list of job types that currently have a registered processor.
	 */
	getRegisteredJobTypes(): JobType[] {
		return Array.from(this.processors.keys());
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

		this.started = true;
		this.startedAtMs = Date.now();

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
	 * Stop processing jobs.
	 *
	 * Stops the poll/stall intervals immediately (no new claims), then awaits
	 * the current in-flight batch up to `drainTimeout` so running jobs finish
	 * cleanly instead of being killed mid-execution. Idempotent — repeat calls
	 * return the same drain promise.
	 */
	stop(): Promise<void> {
		if (this.stopping) {
			return this.stopping;
		}
		this.stopping = this.drain();
		return this.stopping;
	}

	private async drain(): Promise<void> {
		// Stop accepting new work first so no fresh batch is claimed while draining.
		if (this.processingInterval) {
			clearInterval(this.processingInterval);
			this.processingInterval = null;
		}
		if (this.stalledJobInterval) {
			clearInterval(this.stalledJobInterval);
			this.stalledJobInterval = null;
		}

		const inFlight = this.inFlightBatch;
		if (inFlight) {
			console.log(
				`🛑 Queue stopping — draining in-flight jobs (timeout ${this.drainTimeout}ms)`
			);

			let timer: NodeJS.Timeout | null = null;
			const timedOut = Symbol('drain-timeout');
			const timeoutPromise = new Promise<typeof timedOut>((resolve) => {
				timer = setTimeout(() => resolve(timedOut), this.drainTimeout);
			});

			try {
				const outcome = await Promise.race([
					inFlight.then(() => 'drained' as const),
					timeoutPromise
				]);

				if (outcome === timedOut) {
					const stillRunning = this.inFlightJobTypes.join(', ') || 'unknown';
					console.warn(
						`⚠️ Queue drain timed out after ${this.drainTimeout}ms; still running: ${stillRunning}. Aborting in-flight jobs.`
					);
					// Signal survivors to stop before SIGKILL lands — gives
					// processors a chance to skip further domain writes.
					for (const controller of this.activeJobControllers) {
						controller.abort(new Error('Queue shutdown: drain timeout reached'));
					}
				} else {
					console.log('✅ Queue drained in-flight jobs');
				}
			} finally {
				if (timer) {
					clearTimeout(timer);
				}
			}
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
				this.consecutiveClaimFailures++;
				console.error(
					`❌ Error claiming jobs (${this.consecutiveClaimFailures} consecutive):`,
					error
				);
				return;
			}

			this.consecutiveClaimFailures = 0;
			this.lastPollSuccessAtMs = Date.now();

			if (!jobs || jobs.length === 0) {
				return; // No jobs to process
			}

			console.log(`🎯 Claimed ${jobs.length} job(s) for processing`);

			// Track the in-flight batch so graceful shutdown can drain it.
			this.inFlightJobTypes = jobs.map((job) => job.job_type);

			// Process jobs concurrently with proper error isolation
			const batch = Promise.allSettled(
				jobs.map((job) => this.processJob(job as ClaimedQueueJob))
			);
			this.inFlightBatch = batch.then(() => undefined);
			const results = await batch;

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
			this.inFlightBatch = null;
			this.inFlightJobTypes = [];
		}
	}

	/**
	 * Process a single job with comprehensive error isolation
	 */
	private async processJob(job: ClaimedQueueJob): Promise<void> {
		// Wrap the entire method to ensure no errors escape and crash other jobs
		try {
			const processor = this.processors.get(job.job_type as JobType);
			if (!processor) {
				console.error(`❌ No processor registered for job type: ${job.job_type}`);
				await this.failJob(
					job.id,
					`No processor for job type: ${job.job_type}`,
					false,
					job.processing_token ?? null
				);
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
					false,
					job.processing_token ?? null
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
		job: ClaimedQueueJob,
		processor: JobProcessor,
		startTime: number
	): Promise<void> {
		const stopHeartbeat = this.startJobHeartbeat(job);
		const abortController = new AbortController();
		this.activeJobControllers.add(abortController);
		try {
			// Create processing job wrapper
			const processingJob: ProcessingJob = {
				id: job.queue_job_id,
				processingToken: job.processing_token ?? null,
				userId: job.user_id!,
				data: job.metadata,
				attempts: job.attempts || 0,
				signal: abortController.signal,

				updateProgress: async (progress: JobProgress) => {
					const success = await updateJobProgress(
						job.id,
						progress,
						job.processing_token ?? null
					);
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
			const result = await this.withWorkerTimeout(
				processor(processingJob),
				job.queue_job_id,
				job.job_type,
				abortController
			);

			// Mark as completed. IMPORTANT: a completion-RPC failure must NOT fall
			// into the processor-failure path — the work already succeeded, and
			// requeueing it would re-run every side effect. Retry the RPC briefly;
			// if it still fails, leave the row for stalled-job recovery (an
			// at-least-once tradeoff, but never an immediate guaranteed re-run).
			const completeArgs: {
				p_job_id: string;
				p_result: Json;
				p_processing_token?: string;
			} = {
				p_job_id: job.id,
				p_result: (result ?? null) as Json
			};
			if (job.processing_token) {
				completeArgs.p_processing_token = job.processing_token;
			}

			let completed: boolean | null = null;
			let completeError: { message: string } | null = null;
			for (let attempt = 0; attempt < 3; attempt++) {
				if (attempt > 0) {
					await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
				}
				const { data, error } = await supabase.rpc('complete_queue_job', completeArgs);
				completed = data;
				completeError = error;
				if (!error) break;
			}

			if (completeError) {
				console.error(
					`❌ CRITICAL: could not mark job ${job.queue_job_id} completed after retries: ${completeError.message}. ` +
						`Job succeeded but remains 'processing'; stalled recovery may re-run it.`
				);
				return;
			}

			if (completed !== true) {
				console.warn(
					`⚠️ Completion ignored for job ${job.queue_job_id}; processing token no longer owns this job`
				);
				return;
			}

			const duration = Date.now() - startTime;
			console.log(`✅ Completed ${job.job_type} job ${job.queue_job_id} in ${duration}ms`);
		} catch (error: unknown) {
			console.error(`❌ Job ${job.queue_job_id} failed:`, error);

			// Determine if we should retry - use configuration instead of hardcoded value
			const maxRetries = job.max_attempts || queueConfig.maxRetries;
			const shouldRetry = (job.attempts || 0) + 1 < maxRetries;
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			const failed = await this.failJob(
				job.id,
				errorMessage,
				shouldRetry,
				job.processing_token ?? null
			);
			if (!failed) {
				console.warn(
					`⚠️ Failure ignored for job ${job.queue_job_id}; processing token no longer owns this job`
				);
			}
		} finally {
			stopHeartbeat();
			this.activeJobControllers.delete(abortController);
		}
	}

	/**
	 * Keep ownership fresh while a processor is blocked on slow provider I/O.
	 * The processing-token predicate prevents an old worker from reviving a claim
	 * that the stalled-job recovery path has already reassigned.
	 */
	private startJobHeartbeat(job: ClaimedQueueJob): () => void {
		if (!job.processing_token) return () => undefined;
		const intervalMs = resolveQueueHeartbeatInterval(this.stalledTimeout);
		let stopped = false;
		let updateInFlight = false;

		const update = async () => {
			if (stopped || updateInFlight) return;
			updateInFlight = true;
			try {
				const { error } = await supabase
					.from('queue_jobs')
					.update({ updated_at: new Date().toISOString() })
					.eq('id', job.id)
					.eq('status', 'processing')
					.eq('processing_token', job.processing_token!);
				if (error) {
					console.warn(
						`⚠️ Queue heartbeat failed for job ${job.queue_job_id}: ${error.message}`
					);
				}
			} catch (error) {
				console.warn(
					`⚠️ Queue heartbeat crashed for job ${job.queue_job_id}:`,
					error instanceof Error ? error.message : error
				);
			} finally {
				updateInFlight = false;
			}
		};

		const interval = setInterval(() => {
			void update();
		}, intervalMs);
		return () => {
			stopped = true;
			clearInterval(interval);
		};
	}

	private async withWorkerTimeout<T>(
		promise: Promise<T>,
		queueJobId: string,
		jobType: string,
		abortController: AbortController
	): Promise<T> {
		const timeoutMs = resolveWorkerTimeout(jobType);
		let timeout: NodeJS.Timeout | null = null;
		const timeoutPromise = new Promise<T>((_, reject) => {
			timeout = setTimeout(() => {
				// Abort FIRST so the processor's in-flight I/O is cancelled — the
				// queue row is about to be retried and a second executor may
				// claim it; the old one must stop doing domain work.
				abortController.abort(
					new Error(`Worker timeout after ${timeoutMs}ms for ${jobType}`)
				);
				reject(
					new Error(
						`Worker timed out after ${timeoutMs}ms for ${jobType} job ${queueJobId}`
					)
				);
			}, timeoutMs);
		});

		try {
			return await Promise.race([promise, timeoutPromise]);
		} finally {
			if (timeout) {
				clearTimeout(timeout);
			}
		}
	}

	/**
	 * Mark a job as failed
	 */
	private async failJob(
		jobId: string,
		errorMessage: string,
		retry: boolean,
		processingToken?: string | null
	): Promise<boolean> {
		const failArgs: {
			p_job_id: string;
			p_error_message: string;
			p_retry: boolean;
			p_processing_token?: string;
		} = {
			p_job_id: jobId,
			p_error_message: errorMessage,
			p_retry: retry
		};
		if (processingToken) {
			failArgs.p_processing_token = processingToken;
		}
		const { data, error } = await supabase.rpc('fail_queue_job', failArgs);

		if (error) {
			console.error(`❌ Failed to update job status: ${error.message}`);
			return false;
		}

		return data === true;
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
	 * Liveness snapshot for /health. Unhealthy when the claim RPC keeps
	 * failing or the poll loop has silently stopped ticking. A long-running
	 * batch is NOT unhealthy — polling legitimately pauses while a batch is
	 * in flight, so `processingBatch` suspends the staleness check.
	 */
	getHealth(): {
		healthy: boolean;
		reason?: string;
		startedAt: string | null;
		lastPollSuccessAt: string | null;
		consecutiveClaimFailures: number;
		processingBatch: boolean;
		draining: boolean;
	} {
		const snapshot = {
			startedAt: this.startedAtMs ? new Date(this.startedAtMs).toISOString() : null,
			lastPollSuccessAt: this.lastPollSuccessAtMs
				? new Date(this.lastPollSuccessAtMs).toISOString()
				: null,
			consecutiveClaimFailures: this.consecutiveClaimFailures,
			processingBatch: this.isProcessing,
			draining: this.stopping !== null
		};

		if (!this.started) {
			return { healthy: false, reason: 'queue_not_started', ...snapshot };
		}
		if (this.stopping) {
			// Shutting down on purpose — don't trigger a restart mid-drain.
			return { healthy: true, reason: 'draining', ...snapshot };
		}
		if (this.consecutiveClaimFailures >= 3) {
			return { healthy: false, reason: 'repeated_claim_failures', ...snapshot };
		}

		const staleThresholdMs = Math.max(5 * this.pollInterval, 60_000);
		const referenceMs = this.lastPollSuccessAtMs ?? this.startedAtMs!;
		if (!this.isProcessing && Date.now() - referenceMs > staleThresholdMs) {
			return {
				healthy: false,
				reason: this.lastPollSuccessAtMs ? 'poll_loop_stalled' : 'no_successful_poll',
				...snapshot
			};
		}

		return { healthy: true, ...snapshot };
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
