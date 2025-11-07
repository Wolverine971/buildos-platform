// apps/web/src/lib/services/briefClient.service.ts
import type {
	ProjectDailyBrief,
	DailyBrief,
	StreamingBriefData,
	StreamingStatus,
	StreamEvent
} from '$lib/types/daily-brief';
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { PUBLIC_BRIEF_POLLING_INTERVAL, PUBLIC_BRIEF_MAX_POLLING_TIME } from '$env/static/public';
import { RailwayWorkerService } from './railwayWorker.service';
import { toastService } from '$lib/stores/toast.store';
import { RealtimeBriefService } from './realtimeBrief.service';
import {
	unifiedBriefGenerationStore,
	streamingStatus,
	streamingBriefData,
	briefGenerationCompleted,
	briefGenerationCompletedWritable
} from '$lib/stores/unifiedBriefGeneration.store';

// Re-export stores from unified store for backward compatibility
export { streamingStatus, streamingBriefData, briefGenerationCompleted };

// Simplified generation state
interface GenerationState {
	jobId: string | null;
	briefDate: string | null;
	pollingInterval: NodeJS.Timeout | null;
	pollingStartTime: number | null;
	eventSource: EventSource | null;
	abortController: AbortController | null;
}

export class BriefClientService {
	// Single source of truth for generation state
	private static generationState: GenerationState = {
		jobId: null,
		briefDate: null,
		pollingInterval: null,
		pollingStartTime: null,
		eventSource: null,
		abortController: null
	};

	// Configuration
	private static readonly POLLING_INTERVAL = parseInt(PUBLIC_BRIEF_POLLING_INTERVAL || '3000');
	private static readonly MAX_POLLING_TIME = parseInt(PUBLIC_BRIEF_MAX_POLLING_TIME || '300000');

	/**
	 * Start generation with Railway worker integration and fallback
	 */
	static async startStreamingGeneration(options: {
		briefDate: string;
		forceRegenerate?: boolean;
		user?: { id: string; email: string; is_admin: boolean };
		timezone?: string;
		supabaseClient?: any; // Accept supabase client from component
	}): Promise<void> {
		if (!browser || !options.user) return;

		// Initialize RealtimeBriefService only when user explicitly generates a brief
		if (!RealtimeBriefService.isInitialized() && options.supabaseClient) {
			try {
				const userTimezone =
					options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
				await RealtimeBriefService.initialize(
					options.user.id,
					options.supabaseClient,
					userTimezone
				);
			} catch (error) {
				// Failed to initialize realtime brief service
				// Continue with generation even if realtime service fails
			}
		}

		// Check if we're already generating for this specific date
		if (this.isCurrentlyGenerating(options.briefDate)) {
			// Generation already in progress for this date

			// If force regenerate, cancel the existing one
			if (options.forceRegenerate) {
				// Force regenerate requested, cancelling existing generation
				await this.cancelExistingGeneration(options.user.id, options.briefDate);
			} else {
				// Just resume monitoring the existing generation
				return;
			}
		}

		// Cancel any OTHER date generations
		if (
			this.generationState.briefDate &&
			this.generationState.briefDate !== options.briefDate
		) {
			this.cancelGeneration();
		}

		// Initialize stores
		this.resetStores();
		unifiedBriefGenerationStore.startGeneration('sse'); // Will be updated to 'railway' if railway is used

		// Store generation info
		this.generationState.briefDate = options.briefDate;

		try {
			// Check for existing generation first
			const existingJob = await this.checkExistingGeneration(
				options.user.id,
				options.briefDate
			);

			if (existingJob && !options.forceRegenerate) {
				// Resume monitoring existing job
				this.generationState.jobId = existingJob.queue_job_id;
				unifiedBriefGenerationStore.update(
					{
						message: 'Resuming existing generation...'
					},
					'manual',
					0
				);
				this.startPolling(options.user.id, options.briefDate);
				return;
			}

			// If force regenerate, cancel any existing jobs first
			if (options.forceRegenerate && existingJob) {
				await this.cancelExistingGeneration(options.user.id, options.briefDate);
				// Small delay to ensure cancellation is processed
				await new Promise((resolve) => setTimeout(resolve, 500));
			}

			// Try Railway worker first
			console.log('Checking Railway worker availability...');
			const railwayAvailable = await RailwayWorkerService.isWorkerAvailable();
			console.log('Railway worker available:', railwayAvailable);

			if (railwayAvailable) {
				console.log('Starting Railway worker generation...');
				await this.startRailwayGeneration({
					...options,
					timezone: options.timezone || this.getUserTimezone()
				});
			} else {
				console.warn('Railway worker unavailable, using local generation');
				await this.startLocalGeneration(options);
			}
		} catch (error) {
			console.error('Error starting generation:', error);
			this.handleGenerationError(error);
		}
	}

	private static async cancelExistingGeneration(
		userId: string,
		briefDate: string
	): Promise<void> {
		try {
			// Cancel via API endpoint
			const response = await fetch('/api/brief-jobs/cancel', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ briefDate })
			});

			if (!response.ok) {
				console.error('Failed to cancel existing jobs');
			}

			// Also update the brief status in database
			await fetch('/api/daily-briefs/cancel', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ briefDate })
			});
		} catch (error) {
			console.error('Error cancelling existing generation:', error);
		}
	}

	/**
	 * Check if currently generating for a specific date
	 */
	private static isCurrentlyGenerating(briefDate: string): boolean {
		return this.generationState.briefDate === briefDate && this.generationState.jobId !== null;
	}

	/**
	 * Check for existing generation job
	 */
	private static async checkExistingGeneration(userId: string, briefDate: string) {
		const { isGenerating, job } = await RailwayWorkerService.isBriefGenerating(
			userId,
			briefDate
		);
		return isGenerating ? job : null;
	}

	/**
	 * Start Railway worker generation
	 */
	private static async startRailwayGeneration(options: {
		briefDate: string;
		forceRegenerate?: boolean;
		user: { id: string; email: string; is_admin: boolean };
		timezone?: string;
	}): Promise<void> {
		unifiedBriefGenerationStore.startGeneration('railway');
		unifiedBriefGenerationStore.update(
			{
				message: 'Queuing brief generation...'
			},
			'railway',
			0
		);

		const timezone = options.timezone || this.getUserTimezone();

		// Queue new job with timezone and explicit brief date
		const queueResponse = await RailwayWorkerService.queueBriefGeneration(options.user.id, {
			scheduledFor: new Date(),
			briefDate: options.briefDate,
			timezone: timezone
		});

		this.generationState.jobId = queueResponse.jobId;

		unifiedBriefGenerationStore.update(
			{
				currentStep: 'starting',
				message: 'Brief generation queued successfully'
			},
			'railway',
			0
		);

		// Start polling for updates
		this.startPolling(options.user.id, options.briefDate);
	}

	/**
	 * Start local SSE generation
	 */
	private static async startLocalGeneration(options: {
		briefDate: string;
		forceRegenerate?: boolean;
	}): Promise<void> {
		console.log('Starting local generation for:', options.briefDate);
		this.generationState.abortController = new AbortController();

		const params = new URLSearchParams({
			briefDate: options.briefDate,
			forceRegenerate: String(options.forceRegenerate || false),
			streaming: 'true'
		});

		const eventSourceUrl = `/api/daily-briefs/generate?${params.toString()}`;
		console.log('Creating EventSource for:', eventSourceUrl);
		this.generationState.eventSource = new EventSource(eventSourceUrl);

		this.generationState.eventSource.onmessage = (event) => {
			try {
				const streamEvent: StreamEvent = JSON.parse(event.data);
				this.handleStreamEvent(streamEvent);
			} catch (error) {
				console.error('Error parsing stream event:', error);
			}
		};

		this.generationState.eventSource.onerror = (error) => {
			console.error('SSE error:', error);
			console.error('EventSource readyState:', this.generationState.eventSource?.readyState);
			const currentStatus = get(streamingStatus);

			if (currentStatus.currentStep === 'completed') {
				console.log('Generation completed, cleaning up');
				this.cleanup();
				return;
			}

			console.error('SSE connection lost, handling error');
			this.handleGenerationError(new Error('Connection lost during brief generation'));
		};
	}

	/**
	 * Start polling for job updates
	 */
	private static startPolling(userId: string, briefDate: string): void {
		if (!browser || this.generationState.pollingInterval) return;

		this.generationState.pollingStartTime = Date.now();

		const poll = async () => {
			// Check timeout
			if (this.isPollingTimedOut()) {
				this.handleGenerationError(new Error('Generation timed out'));
				return;
			}

			try {
				// Poll job status
				if (!this.generationState.jobId) return;

				const jobStatus = await this.pollJobStatus(this.generationState.jobId);

				if (!jobStatus) {
					this.handleGenerationError(new Error('Job not found'));
					return;
				}

				// Update status
				this.updateStatusFromJob(jobStatus);

				// Handle terminal states
				if (jobStatus.status === 'completed') {
					await this.handleGenerationComplete(userId, briefDate);
				} else if (jobStatus.status === 'failed' || jobStatus.status === 'cancelled') {
					this.handleGenerationError(
						new Error(jobStatus.error_message || `Generation ${jobStatus.status}`)
					);
				} else if (jobStatus.status === 'processing') {
					// Poll for incremental updates
					await this.pollBriefData(userId, briefDate);
				}
			} catch (error) {
				console.error('Polling error:', error);
				// Continue polling unless critical
				if (error instanceof Error && error.message.includes('Network')) {
					this.handleGenerationError(error);
				}
			}
		};

		// Initial poll
		poll();

		// Set up interval
		this.generationState.pollingInterval = setInterval(poll, this.POLLING_INTERVAL);
	}

	/**
	 * Check if polling has timed out
	 */
	private static isPollingTimedOut(): boolean {
		return (
			this.generationState.pollingStartTime !== null &&
			Date.now() - this.generationState.pollingStartTime > this.MAX_POLLING_TIME
		);
	}

	/**
	 * Poll for job status
	 */
	private static async pollJobStatus(jobId: string) {
		try {
			const response = await fetch(`/api/brief-jobs/${jobId}`);
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				if (response.status === 404) return null;
				const message =
					payload?.error || payload?.message || response.statusText || 'Unknown error';
				throw new Error(`Failed to fetch job status: ${message}`);
			}

			const job = payload?.data?.job ?? payload?.job ?? null;
			if (!job) {
				return null;
			}

			// If job was cancelled due to a newer request, don't treat as error
			if (
				job.status === 'cancelled' &&
				job.error_message?.includes('newer brief generation request')
			) {
				return null; // Silently stop polling
			}

			return job;
		} catch (error) {
			console.error('Error polling job status:', error);
			throw error;
		}
	}

	/**
	 * Poll for brief data updates
	 */
	private static async pollBriefData(userId: string, briefDate: string): Promise<void> {
		// Fetch daily brief
		const dailyBriefResponse = await fetch(
			`/api/daily-briefs/status?date=${briefDate}&userId=${userId}`
		);

		if (dailyBriefResponse.ok) {
			const dailyBriefData = await dailyBriefResponse.json();
			if (dailyBriefData?.data.brief) {
				// Update streaming data
				const currentBriefData = get(streamingBriefData);
				unifiedBriefGenerationStore.update(
					{
						streamingData: {
							...currentBriefData,
							mainBrief: {
								id: dailyBriefData.data.brief.id,
								content: dailyBriefData.data.brief.summary_content,
								priority_actions: dailyBriefData.data.brief.priority_actions || []
							}
						}
					},
					'railway',
					100
				);

				// Update streaming status with generation progress if available
				if (dailyBriefData.brief.generation_progress) {
					const progress = dailyBriefData.brief.generation_progress;
					const currentState = get(streamingStatus);
					const completed = progress.progress || 0;
					const total = 100;
					unifiedBriefGenerationStore.updateProgress(
						completed,
						total,
						this.getProgressMessage(progress) || currentState.message,
						'railway'
					);
					if (progress.step) {
						unifiedBriefGenerationStore.update(
							{
								currentStep: progress.step
							},
							'railway',
							100
						);
					}
				}
			}
		}

		// Fetch project briefs
		const projectBriefsResponse = await fetch(
			`/api/project-briefs?date=${briefDate}&userId=${userId}`
		);

		if (!projectBriefsResponse.ok) {
			throw new Error(
				`Failed to fetch project briefs (HTTP ${projectBriefsResponse.status})`
			);
		}

		const result = await projectBriefsResponse.json();
		if (!result?.success || !result?.data) {
			throw new Error(result?.error || 'Failed to load project briefs');
		}

		const projectBriefsData = result.data;
		if (projectBriefsData?.briefs?.length > 0) {
			const currentData = get(streamingBriefData);
			unifiedBriefGenerationStore.update(
				{
					streamingData: {
						...currentData,
						projectBriefs: projectBriefsData.briefs
					}
				},
				'railway',
				100
			);
			unifiedBriefGenerationStore.updateProgress(
				projectBriefsData.briefs.length,
				projectBriefsData.briefs.length,
				'Project briefs loaded',
				'railway'
			);
		}
	}

	/**
	 * Handle generation completion
	 */
	private static async handleGenerationComplete(
		userId: string,
		briefDate: string
	): Promise<void> {
		try {
			// Fetch final data one more time to ensure we have everything
			await this.pollBriefData(userId, briefDate);

			// Add a small delay to ensure database writes are complete
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Update status
			unifiedBriefGenerationStore.update(
				{
					isGenerating: false,
					currentStep: 'completed',
					message: 'Brief generation completed successfully!'
				},
				'manual',
				0
			);

			// Emit completion event that components can listen to
			briefGenerationCompletedWritable.set({
				briefDate,
				timestamp: Date.now()
			});

			// Clean up after a short delay to allow UI to update
			setTimeout(() => {
				this.cleanup();
			}, 500);
		} catch (error) {
			console.error('Error in handleGenerationComplete:', error);
			this.handleGenerationError(error);
		}
	}

	/**
	 * Handle generation errors
	 */
	private static handleGenerationError(error: unknown): void {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('Brief generation error:', errorMessage, error);

		// Don't show error for expected cancellations
		if (
			errorMessage.includes('newer brief generation request') ||
			errorMessage.includes('cancelled by user')
		) {
			unifiedBriefGenerationStore.update(
				{
					isGenerating: false,
					currentStep: 'idle',
					message: '',
					error: undefined
				},
				'manual',
				0
			);
		} else {
			// Show error toast for better visibility
			toastService.error(`Brief generation failed: ${errorMessage}`);

			unifiedBriefGenerationStore.update(
				{
					isGenerating: false,
					currentStep: 'error',
					message: 'Generation failed',
					error: errorMessage
				},
				'manual',
				0
			);
		}

		this.cleanup();
	}

	/**
	 * Update status from job information
	 */
	private static updateStatusFromJob(job: any): void {
		const statusMap: Record<string, { step: string; message: string }> = {
			pending: { step: 'queued', message: 'Brief queued for generation...' },
			processing: {
				step: 'generating_project_briefs',
				message: 'Processing projects and generating briefs...'
			},
			completed: { step: 'completed', message: 'Brief generation completed!' },
			failed: { step: 'error', message: job.error_message || 'Generation failed' },
			cancelled: { step: 'error', message: 'Generation was cancelled' }
		};

		const status = statusMap[job.status] || {
			step: 'processing',
			message: 'Generating brief...'
		};

		const currentState = get(streamingStatus);
		const completed = job.metadata?.generation_progress?.progress || 0;
		const total = 100;

		if (job.metadata?.generation_progress) {
			unifiedBriefGenerationStore.updateProgress(
				completed,
				total,
				this.getProgressMessage(job.metadata?.generation_progress) || status.message,
				'railway'
			);
		}

		unifiedBriefGenerationStore.update(
			{
				currentStep: job.metadata?.generation_progress?.step || status.step,
				message:
					this.getProgressMessage(job.metadata?.generation_progress) || status.message
			},
			'railway',
			100
		);
	}

	/**
	 * Handle SSE stream events (for local generation)
	 */
	private static handleStreamEvent(event: StreamEvent): void {
		switch (event.type) {
			case 'status':
				unifiedBriefGenerationStore.update(
					{
						message: event.data.message || get(streamingStatus).message
					},
					'sse',
					50
				);
				break;

			case 'progress':
				const progressState = get(streamingStatus);
				const completed = event.data.progress?.completed || 0;
				const total = event.data.counts?.projects || progressState.progress.projects.total;

				unifiedBriefGenerationStore.updateProgress(
					completed,
					total,
					event.data.message || progressState.message,
					'sse'
				);

				if (event.data.step) {
					unifiedBriefGenerationStore.update(
						{
							currentStep: event.data.step
						},
						'sse',
						50
					);
				}
				break;

			case 'project_brief':
				const briefData = get(streamingBriefData);
				unifiedBriefGenerationStore.update(
					{
						streamingData: {
							...briefData,
							projectBriefs: [...briefData.projectBriefs, event.data]
						}
					},
					'sse',
					50
				);
				break;

			case 'main_brief':
				const mainBriefData = get(streamingBriefData);
				unifiedBriefGenerationStore.update(
					{
						streamingData: {
							...mainBriefData,
							mainBrief: {
								id: event.data.id,
								content: event.data.content,
								priority_actions: event.data.priority_actions
							}
						}
					},
					'sse',
					50
				);
				break;

			case 'complete':
				this.handleGenerationComplete('', this.generationState.briefDate || '');
				break;

			case 'error':
				this.handleGenerationError(new Error(event.data.message || 'Generation failed'));
				break;
		}
	}

	/**
	 * Cancel ongoing generation
	 */
	static cancelGeneration(): void {
		this.cleanup();

		unifiedBriefGenerationStore.update(
			{
				isGenerating: false,
				currentStep: 'idle',
				message: 'Generation cancelled',
				error: undefined
			},
			'manual',
			0
		);
	}

	/**
	 * Clean up resources
	 */
	private static cleanup(): void {
		// Clear polling
		if (this.generationState.pollingInterval) {
			clearInterval(this.generationState.pollingInterval);
		}

		// Close event source
		if (this.generationState.eventSource) {
			this.generationState.eventSource.close();
		}

		// Abort controller
		if (this.generationState.abortController) {
			this.generationState.abortController.abort();
		}

		// Reset state
		this.generationState = {
			jobId: null,
			briefDate: null,
			pollingInterval: null,
			pollingStartTime: null,
			eventSource: null,
			abortController: null
		};
	}

	/**
	 * Reset stores to initial state
	 */
	private static resetStores(): void {
		unifiedBriefGenerationStore.reset();
		briefGenerationCompletedWritable.set(null);
	}

	/**
	 * Check if a brief is currently generating
	 */
	static async isGenerating(briefDate: string, user: any): Promise<boolean> {
		// Check local state first
		if (this.isCurrentlyGenerating(briefDate)) {
			return true;
		}

		// Check Railway worker
		try {
			const workerAvailable = await RailwayWorkerService.isWorkerAvailable();
			if (workerAvailable && user) {
				const { isGenerating } = await RailwayWorkerService.isBriefGenerating(
					user.id,
					briefDate
				);
				if (isGenerating) return true;
			}

			// Check local generation status
			const response = await fetch(`/api/daily-briefs/status?date=${briefDate}`);
			if (!response.ok) return false;

			const result = await response.json();
			const data = result.data;
			return data.generation_status === 'processing' || data.isGenerating;
		} catch {
			return false;
		}
	}

	/**
	 * Delete a daily brief
	 */
	static async deleteBrief(briefId: string): Promise<void> {
		const response = await fetch(`/api/daily-briefs/${briefId}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.message || 'Failed to delete brief');
		}
	}

	/**
	 * Export brief as markdown file
	 */
	static async exportBrief(brief: DailyBrief): Promise<void> {
		const content = this.formatBriefForExport(brief);
		const blob = new Blob([content], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `daily-brief-${brief.brief_date}.md`;
		a.click();
		URL.revokeObjectURL(url);
	}

	/**
	 * Copy brief content to clipboard
	 */
	static async copyBrief(brief: DailyBrief): Promise<void> {
		const content = this.formatBriefForExport(brief);
		await navigator.clipboard.writeText(content);
	}

	/**
	 * Format brief for export
	 */
	private static formatBriefForExport(brief: DailyBrief): string {
		let content = `# Daily Brief - ${this.formatDisplayDate(brief.brief_date)}\n\n`;
		content += `Generated: ${new Date(brief.created_at || '').toLocaleString()}\n\n`;
		content += `## Summary\n\n${brief.summary_content}\n\n`;

		if (brief.priority_actions?.length) {
			content += `## Priority Actions\n\n`;
			brief.priority_actions.forEach((action) => {
				content += `- ${action}\n`;
			});
			content += '\n';
		}

		if (brief.insights) {
			content += `## Insights\n\n${brief.insights}\n`;
		}

		return content;
	}

	// Date utility methods remain the same...
	static getTodayDateString(): string {
		const today = new Date();
		const year = today.getFullYear();
		const month = String(today.getMonth() + 1).padStart(2, '0');
		const day = String(today.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	static getUserTimezone(): string {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	}

	static parseDateString(dateString: string): Date {
		const [year, month, day] = dateString.split('-').map(Number);
		return new Date(year || 0, (month || 1) - 1, day || 1);
	}

	static formatDisplayDate(dateString: string): string {
		const date = this.parseDateString(dateString);
		const today = new Date();

		today.setHours(0, 0, 0, 0);
		date.setHours(0, 0, 0, 0);

		const diffTime = date.getTime() - today.getTime();
		const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return 'Today';
		if (diffDays === -1) return 'Yesterday';
		if (diffDays === 1) return 'Tomorrow';

		return date.toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
		});
	}

	static isToday(dateString: string): boolean {
		return dateString === this.getTodayDateString();
	}

	static getDateStringDaysFromToday(daysOffset: number): string {
		const date = new Date();
		date.setDate(date.getDate() + daysOffset);

		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	static dateToString(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	static getWeekStartDate(dateString: string): string {
		const date = this.parseDateString(dateString);
		const day = date.getDay();
		const diff = date.getDate() - day + (day === 0 ? -6 : 1);
		date.setDate(diff);
		return this.dateToString(date);
	}

	static getWeekEndDate(dateString: string): string {
		const date = this.parseDateString(dateString);
		const day = date.getDay();
		const diff = date.getDate() - day + (day === 0 ? 0 : 7);
		date.setDate(diff);
		return this.dateToString(date);
	}

	/**
	 * Get human-readable progress message from progress data
	 */
	private static getProgressMessage(progress: any): string | null {
		if (!progress) return null;

		const stepMessages: Record<string, string> = {
			starting: 'Starting brief generation...',
			fetching_projects: 'Fetching your projects...',
			generating_project_briefs: 'Generating project briefs...',
			consolidating_briefs: 'Consolidating briefs...',
			finalizing: 'Finalizing your daily brief...',
			completed: 'Brief generation completed!'
		};

		// Check for project-specific processing
		if (progress.step?.startsWith('processing_project_')) {
			const projectName = progress.step.replace('processing_project_', '');
			return `Processing ${projectName}...`;
		}

		return stepMessages[progress.step] || null;
	}

	static resetState(): void {
		this.cancelGeneration();
		this.resetStores();
	}
}
