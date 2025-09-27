// src/lib/services/realtimeBrief.service.ts
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { toastService } from '$lib/stores/toast.store';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { invalidateAll } from '$app/navigation';
import {
	getCurrentDateInTimezone,
	formatTimeInTimezone,
	getRelativeTime,
	getUserTimezone
} from '$lib/utils/timezone';

export interface BriefNotificationStatus {
	isGenerating: boolean;
	status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
	briefDate?: string;
	briefId?: string;
	startedAt?: string;
	completedAt?: string;
	progress?: number;
	message?: string;
	error?: string;
	jobId?: string;
	timezone?: string;
}

// Store for navigation brief status
export const briefNotificationStatus = writable<BriefNotificationStatus>({
	isGenerating: false
});

interface ServiceState {
	channel: RealtimeChannel | null;
	userId: string | null;
	isSubscribed: boolean;
	supabaseClient: SupabaseClient | null;
	userTimezone: string;
	reconnectAttempts: number;
	maxReconnectAttempts: number;
	reconnectTimeout: NodeJS.Timeout | null;
	// Track active jobs by briefDate to handle multiple jobs for same date
	activeJobsByDate: Map<string, string>; // briefDate -> most recent jobId
	// Track shown notifications to prevent duplicates
	shownNotifications: Set<string>;
}

export class RealtimeBriefService {
	private static state: ServiceState = {
		channel: null,
		userId: null,
		isSubscribed: false,
		supabaseClient: null,
		userTimezone: 'UTC',
		reconnectAttempts: 0,
		maxReconnectAttempts: 3,
		reconnectTimeout: null,
		activeJobsByDate: new Map(),
		shownNotifications: new Set()
	};

	/**
	 * Initialize real-time subscription for brief notifications
	 */
	static async initialize(
		userId: string,
		supabaseClient: SupabaseClient,
		timezone?: string
	): Promise<void> {
		if (!browser || !userId || !supabaseClient) {
			console.warn('RealtimeBriefService: Missing required parameters');
			return;
		}

		// Update timezone
		this.state.userTimezone = timezone || getUserTimezone();

		// Don't reinitialize if already subscribed to the same user
		if (this.state.isSubscribed && this.state.userId === userId) {
			// Just update timezone if changed
			if (timezone && timezone !== this.state.userTimezone) {
				this.updateTimezone(timezone);
			}
			return;
		}

		// Clean up any existing subscription
		await this.cleanup();

		// Update state
		this.state.userId = userId;
		this.state.supabaseClient = supabaseClient;
		this.state.reconnectAttempts = 0;
		this.state.activeJobsByDate.clear();

		// Initialize subscription
		await this.setupSubscription();
	}

	/**
	 * Set up real-time subscription
	 */
	private static async setupSubscription(): Promise<void> {
		if (!this.state.supabaseClient || !this.state.userId) return;

		try {
			// Create channel for user-specific notifications
			this.state.channel = this.state.supabaseClient.channel(
				`user-brief-notifications:${this.state.userId}`
			);

			// Set up event handlers
			this.state.channel
				.on(
					'postgres_changes',
					{
						event: '*',
						schema: 'public',
						table: 'queue_jobs',
						filter: `user_id=eq.${this.state.userId}`
					},
					(payload) => this.handleJobUpdate(payload)
				)
				.on(
					'postgres_changes',
					{
						event: '*',
						schema: 'public',
						table: 'daily_briefs',
						filter: `user_id=eq.${this.state.userId}`
					},
					(payload) => this.handleBriefUpdate(payload)
				)
				.on('broadcast', { event: 'brief_completed' }, (payload) =>
					this.handleBriefCompleted(payload)
				)
				.on('broadcast', { event: 'brief_failed' }, (payload) =>
					this.handleBriefFailed(payload)
				);

			// Subscribe to the channel
			const subscription = await this.state.channel.subscribe((status) => {
				this.handleSubscriptionStatus(status);
			});

			// Check if subscription was successful
			if (subscription === 'error' || subscription === 'timed_out') {
				throw new Error(`Subscription failed: ${subscription}`);
			}
		} catch (error) {
			console.error('Error setting up real-time subscription:', error);
			this.handleSubscriptionError();
		}
	}

	/**
	 * Handle subscription status changes
	 */
	private static handleSubscriptionStatus(status: string): void {
		switch (status) {
			case 'SUBSCRIBED':
				this.state.isSubscribed = true;
				this.state.reconnectAttempts = 0;
				// Check for any active brief generation on initialization
				if (this.state.userId) {
					this.checkActiveGeneration(this.state.userId);
				}
				break;

			case 'CHANNEL_ERROR':
			case 'TIMED_OUT':
				console.error(`Subscription failed: ${status}`);
				this.state.isSubscribed = false;
				this.handleSubscriptionError();
				break;

			case 'CLOSED':
				console.log('Channel closed');
				this.state.isSubscribed = false;
				break;
		}
	}

	/**
	 * Handle subscription errors with reconnection logic
	 */
	private static handleSubscriptionError(): void {
		if (this.state.reconnectAttempts >= this.state.maxReconnectAttempts) {
			console.error('Max reconnection attempts reached');
			toastService.error('Real-time updates unavailable. Please refresh the page.');
			return;
		}

		this.state.reconnectAttempts++;
		const delay = Math.min(1000 * Math.pow(2, this.state.reconnectAttempts - 1), 10000);

		console.log(`Attempting to reconnect in ${delay}ms...`);

		// Clear any existing timeout
		if (this.state.reconnectTimeout) {
			clearTimeout(this.state.reconnectTimeout);
		}

		this.state.reconnectTimeout = setTimeout(() => {
			this.setupSubscription();
		}, delay);
	}

	/**
	 * Update timezone for the service
	 */
	static updateTimezone(timezone: string): void {
		this.state.userTimezone = timezone;

		briefNotificationStatus.update((current) => ({
			...current,
			timezone
		}));
	}

	/**
	 * Extract brief date from job metadata or scheduled_for
	 */
	private static extractBriefDate(job: any): string | undefined {
		// First try to get from metadata (most reliable)
		if (job.metadata?.briefDate) {
			return job.metadata.briefDate;
		}

		// Fall back to converting scheduled_for
		return this.convertToUserDateString(job.scheduled_for);
	}

	/**
	 * Convert UTC date string to user's timezone date string (YYYY-MM-DD)
	 */
	private static convertToUserDateString(
		utcDateString: string | null | undefined
	): string | undefined {
		if (!utcDateString) return undefined;

		try {
			// Use the timezone utility function
			return getCurrentDateInTimezone(this.state.userTimezone, new Date(utcDateString));
		} catch (error) {
			console.error('Error converting date:', error);
			return undefined;
		}
	}

	/**
	 * Check if this is the most recent job for a given brief date
	 */
	private static isLatestJobForDate(jobId: string, briefDate: string): boolean {
		const latestJobId = this.state.activeJobsByDate.get(briefDate);
		return !latestJobId || jobId === latestJobId || this.isNewerJob(jobId, latestJobId);
	}

	/**
	 * Check if jobA is newer than jobB based on timestamp in job ID
	 */
	private static isNewerJob(jobIdA: string, jobIdB: string): boolean {
		// Extract timestamps from job IDs (format: brief-USER-DATE-TIMESTAMP)
		const timestampA = this.extractTimestamp(jobIdA);
		const timestampB = this.extractTimestamp(jobIdB);

		// If either doesn't have a timestamp, consider the one with timestamp as newer
		if (timestampA && !timestampB) return true;
		if (!timestampA && timestampB) return false;
		if (!timestampA && !timestampB) return false;

		return timestampA > timestampB;
	}

	/**
	 * Extract timestamp from job ID
	 */
	private static extractTimestamp(jobId: string): number | null {
		const parts = jobId.split('-');
		if (parts.length >= 4) {
			const timestamp = parseInt(parts[parts.length - 1], 10);
			return isNaN(timestamp) ? null : timestamp;
		}
		return null;
	}

	/**
	 * Handle brief generation job updates
	 */
	private static handleJobUpdate(payload: any): void {
		const { eventType, new: newRecord, old: oldRecord } = payload;

		// Validate payload
		if (!newRecord || newRecord.job_type !== 'generate_daily_brief') {
			return;
		}

		// Extract brief date from metadata or scheduled_for
		const briefDate = this.extractBriefDate(newRecord);
		if (!briefDate) {
			console.warn('No brief date found in job:', newRecord);
			return;
		}

		// Check if this is the latest job for this date
		const isLatest = this.isLatestJobForDate(newRecord.queue_job_id, briefDate);

		// Update our tracking of active jobs
		if (eventType === 'INSERT' || (eventType === 'UPDATE' && isLatest)) {
			this.state.activeJobsByDate.set(briefDate, newRecord.queue_job_id);
		}

		// Only process if this is the latest job for the date
		if (!isLatest) {
			console.log(
				`Ignoring update for older job ${newRecord.queue_job_id} for date ${briefDate}`
			);
			return;
		}

		// Extract progress from metadata
		const progress = this.calculateProgress(newRecord.metadata);

		switch (eventType) {
			case 'INSERT':
				// New job created - always update status
				if (['pending', 'processing'].includes(newRecord.status)) {
					briefNotificationStatus.set({
						isGenerating: true,
						status: newRecord.status,
						briefDate,
						startedAt: newRecord.created_at,
						jobId: newRecord.queue_job_id,
						progress: progress || 0,
						timezone: this.state.userTimezone,
						message: this.getStatusMessage(newRecord.status, newRecord.metadata)
					});
				}
				break;

			case 'UPDATE':
				this.handleJobStatusUpdate(newRecord, briefDate, progress);
				break;

			case 'DELETE':
				// If the deleted job was the active one, clear the status
				if (this.state.activeJobsByDate.get(briefDate) === oldRecord?.queue_job_id) {
					this.state.activeJobsByDate.delete(briefDate);
					// Only clear if we're currently showing this job
					const currentStatus = get(briefNotificationStatus);
					if (currentStatus.jobId === oldRecord.queue_job_id) {
						briefNotificationStatus.set({ isGenerating: false });
					}
				}
				break;
		}
	}

	/**
	 * Handle job status updates
	 */
	private static handleJobStatusUpdate(job: any, briefDate?: string, progress?: number): void {
		const { status } = job;

		// Always check if we should be showing this job
		const currentStatus = get(briefNotificationStatus);
		const shouldUpdate =
			!currentStatus.jobId ||
			currentStatus.jobId === job.queue_job_id ||
			(briefDate &&
				currentStatus.briefDate === briefDate &&
				this.isNewerJob(job.queue_job_id, currentStatus.jobId));

		if (!shouldUpdate) {
			console.log(`Not updating UI for job ${job.queue_job_id} - newer job exists`);
			return;
		}

		switch (status) {
			case 'pending':
			case 'processing':
				briefNotificationStatus.update((current) => ({
					...current,
					isGenerating: true,
					status: status === 'processing' ? 'processing' : status,
					briefDate,
					jobId: job.queue_job_id,
					timezone: this.state.userTimezone,
					message: this.getStatusMessage(status, job.metadata),
					progress: progress || (status === 'processing' ? 25 : 0)
				}));
				break;

			case 'completed':
				this.handleJobCompleted(job, briefDate);
				break;

			case 'failed':
				this.handleJobFailed(job, briefDate);
				break;

			case 'cancelled':
				this.handleJobCancelled(job, briefDate);
				break;
		}
	}

	/**
	 * Handle job completion
	 */
	private static handleJobCompleted(job: any, briefDate?: string): void {
		// Only show completed status if this is still the latest job
		if (briefDate && !this.isLatestJobForDate(job.queue_job_id, briefDate)) {
			return;
		}

		// Check if we've already shown a notification for this job
		const notificationKey = `brief_complete_${job.queue_job_id}`;
		if (this.state.shownNotifications.has(notificationKey)) {
			console.log(`Skipping duplicate completion notification for job ${job.queue_job_id}`);
			// Still clear the status but don't show toast
			briefNotificationStatus.set({
				isGenerating: false
			});
			return;
		}

		// Mark notification as shown
		this.state.shownNotifications.add(notificationKey);

		// Clean up old notifications after 5 minutes
		setTimeout(
			() => {
				this.state.shownNotifications.delete(notificationKey);
			},
			5 * 60 * 1000
		);

		// Show success toast
		toastService.success(`Your brief for ${briefDate || 'today'} is ready!`);

		// Clear the status immediately - don't keep showing completed status
		briefNotificationStatus.set({
			isGenerating: false
		});

		// Refresh data
		invalidateAll();
	}

	/**
	 * Handle job failure
	 */
	private static handleJobFailed(job: any, briefDate?: string): void {
		// Only show failed status if this is still the latest job
		if (briefDate && !this.isLatestJobForDate(job.queue_job_id, briefDate)) {
			return;
		}

		// Check if we've already shown a notification for this job failure
		const notificationKey = `brief_failed_${job.queue_job_id}`;
		if (this.state.shownNotifications.has(notificationKey)) {
			console.log(`Skipping duplicate failure notification for job ${job.queue_job_id}`);
			// Still clear the status but don't show toast
			briefNotificationStatus.set({
				isGenerating: false
			});
			return;
		}

		// Mark notification as shown
		this.state.shownNotifications.add(notificationKey);

		// Clean up old notifications after 5 minutes
		setTimeout(
			() => {
				this.state.shownNotifications.delete(notificationKey);
			},
			5 * 60 * 1000
		);

		// Show error toast with details
		const errorMessage = job.error_message || 'Brief generation failed';
		toastService.error(`${errorMessage} for ${briefDate || 'today'}`);

		// Clear the status immediately - don't keep showing failed status
		briefNotificationStatus.set({
			isGenerating: false
		});
	}

	/**
	 * Handle job cancellation
	 */
	private static handleJobCancelled(job: any, briefDate?: string): void {
		// Remove from active jobs tracking
		if (briefDate) {
			this.state.activeJobsByDate.delete(briefDate);
		}

		// Only update UI if this was the current job
		const currentStatus = get(briefNotificationStatus);
		if (currentStatus.jobId === job.queue_job_id) {
			briefNotificationStatus.set({
				isGenerating: false,
				status: 'cancelled',
				briefDate,
				jobId: job.queue_job_id,
				timezone: this.state.userTimezone,
				message: 'Brief generation was cancelled'
			});
		}
	}

	/**
	 * Calculate progress from job metadata
	 */
	private static calculateProgress(metadata: any): number | undefined {
		if (!metadata) return undefined;

		// Check for direct progress value
		if (typeof metadata.progress === 'number') {
			return metadata.progress;
		}

		// Check for nested progress
		if (metadata.progress?.projects) {
			const { completed, total } = metadata.progress.projects;
			if (total === 0) return 0;
			return Math.round((completed / total) * 100);
		}

		// Check generation_progress format
		if (metadata.generation_progress?.progress) {
			return metadata.generation_progress.progress;
		}

		return undefined;
	}

	/**
	 * Get status message based on job status and metadata
	 */
	private static getStatusMessage(status: string, metadata?: any): string {
		if (metadata?.progress?.message) {
			return metadata.progress.message;
		}

		if (metadata?.generation_progress?.step) {
			const step = metadata.generation_progress.step;
			const stepMessages: Record<string, string> = {
				starting: 'Starting brief generation...',
				fetching_projects: 'Fetching your projects...',
				generating_project_briefs: 'Generating project briefs...',
				consolidating_briefs: 'Consolidating briefs...',
				finalizing: 'Finalizing your brief...',
				completed: 'Brief completed!'
			};
			return stepMessages[step] || `Processing: ${step}`;
		}

		switch (status) {
			case 'pending':
				return 'Brief queued for generation...';
			case 'processing':
				return 'Generating brief...';
			default:
				return 'Processing...';
		}
	}

	/**
	 * Handle daily brief updates
	 */
	private static handleBriefUpdate(payload: any): void {
		const { eventType, new: newRecord } = payload;

		// Only process completed briefs
		if (!newRecord || newRecord.generation_status !== 'completed') {
			return;
		}

		// Check if we're currently showing a generating status for this brief
		const currentStatus = get(briefNotificationStatus);
		const shouldNotify =
			currentStatus.isGenerating && currentStatus.briefDate === newRecord.brief_date;

		if (shouldNotify) {
			// Show success notification
			const relativeTime = getRelativeTime(
				newRecord.generation_completed_at || newRecord.updated_at,
				this.state.userTimezone
			);
			toastService.success(`Your daily brief is ready! (${relativeTime})`);
		}

		// Clear the status - don't keep showing completed briefs
		if (currentStatus.briefDate === newRecord.brief_date) {
			briefNotificationStatus.set({ isGenerating: false });
		}

		// Refresh data
		invalidateAll();
	}

	/**
	 * Handle broadcast brief completion events
	 */
	private static handleBriefCompleted(payload: any): void {
		const { briefDate } = payload;

		// Clear the status - don't keep showing completed status
		briefNotificationStatus.set({ isGenerating: false });

		// Refresh data
		invalidateAll();
	}

	/**
	 * Handle broadcast brief failure events
	 */
	private static handleBriefFailed(payload: any): void {
		const { error, briefDate } = payload;

		// Show error notification
		toastService.error(`Brief generation failed for ${briefDate || 'today'}`);

		// Clear the status - don't keep showing failed status
		briefNotificationStatus.set({ isGenerating: false });
	}

	/**
	 * Check for any active brief generation on service initialization
	 */
	private static async checkActiveGeneration(userId: string): Promise<void> {
		if (!this.state.supabaseClient) return;

		try {
			// Get today's date in user timezone
			const todayDate = getCurrentDateInTimezone(this.state.userTimezone);

			// First, check if today's brief is already completed
			const { data: todaysBrief, error: briefError } = await this.state.supabaseClient
				.from('daily_briefs')
				.select('*')
				.eq('user_id', userId)
				.eq('brief_date', todayDate)
				.eq('generation_status', 'completed')
				.maybeSingle();

			if (todaysBrief && !briefError) {
				// Today's brief is already completed - don't show any indicator
				console.log(
					`Today's brief already completed for ${todayDate}, not showing indicator`
				);
				briefNotificationStatus.set({ isGenerating: false });
				return;
			}

			// Check for any active jobs
			const { data: activeJobs, error } = await this.state.supabaseClient
				.from('queue_jobs')
				.select('*')
				.eq('user_id', userId)
				.eq('job_type', 'generate_daily_brief')
				.in('status', ['pending', 'processing'])
				.order('created_at', { ascending: false });

			if (error) {
				console.error('Error checking active generation:', error);
				return;
			}

			if (activeJobs && activeJobs.length > 0) {
				// Group jobs by brief date and find the most recent for each date
				const jobsByDate = new Map<string, any>();

				for (const job of activeJobs) {
					const briefDate = this.extractBriefDate(job);
					if (!briefDate) continue;

					const existingJob = jobsByDate.get(briefDate);
					if (
						!existingJob ||
						this.isNewerJob(job.queue_job_id, existingJob.queue_job_id)
					) {
						jobsByDate.set(briefDate, job);
						this.state.activeJobsByDate.set(briefDate, job.queue_job_id);
					}
				}

				// Only show indicator for active jobs (not completed/failed)
				const activeJob = Array.from(jobsByDate.values()).find((job) =>
					['pending', 'processing'].includes(job.status)
				);

				if (activeJob) {
					const briefDate = this.extractBriefDate(activeJob);
					const progress = this.calculateProgress(activeJob.metadata);
					const startedRelative = getRelativeTime(
						activeJob.created_at,
						this.state.userTimezone
					);

					briefNotificationStatus.set({
						isGenerating: true,
						status: activeJob.status === 'processing' ? 'processing' : activeJob.status,
						briefDate,
						jobId: activeJob.queue_job_id,
						startedAt: activeJob.created_at,
						timezone: this.state.userTimezone,
						progress: progress || (activeJob.status === 'processing' ? 25 : 0),
						message:
							this.getStatusMessage(activeJob.status, activeJob.metadata) ||
							`Generating brief (started ${startedRelative})...`
					});
				} else {
					// No active jobs - clear any status
					briefNotificationStatus.set({ isGenerating: false });
				}
			} else {
				// No active jobs - clear any status
				briefNotificationStatus.set({ isGenerating: false });
			}
		} catch (error) {
			console.error('Error checking active generation:', error);
		}
	}

	/**
	 * Clear current notification status
	 */
	static clearStatus(): void {
		briefNotificationStatus.set({ isGenerating: false });
		this.state.activeJobsByDate.clear();
	}

	/**
	 * Cleanup subscriptions and state
	 */
	static async cleanup(): Promise<void> {
		// Clear any reconnect timeout
		if (this.state.reconnectTimeout) {
			clearTimeout(this.state.reconnectTimeout);
			this.state.reconnectTimeout = null;
		}

		// Clear notification tracking
		this.state.shownNotifications.clear();
		this.state.activeJobsByDate.clear();

		// Remove channel subscription
		if (this.state.channel && this.state.supabaseClient) {
			try {
				await this.state.supabaseClient.removeChannel(this.state.channel);
			} catch (error) {
				console.error('Error removing channel:', error);
			}
		}

		// Reset state
		this.state = {
			...this.state,
			channel: null,
			userId: null,
			isSubscribed: false,
			supabaseClient: null,
			reconnectAttempts: 0,
			activeJobsByDate: new Map()
		};

		// Clear status
		this.clearStatus();
	}

	/**
	 * Get current notification status
	 */
	static getCurrentStatus(): BriefNotificationStatus {
		return get(briefNotificationStatus);
	}

	/**
	 * Get current timezone
	 */
	static getCurrentTimezone(): string {
		return this.state.userTimezone;
	}

	/**
	 * Check if service is initialized
	 */
	static isInitialized(): boolean {
		return this.state.isSubscribed && this.state.userId !== null;
	}
}
