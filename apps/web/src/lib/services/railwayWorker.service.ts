// apps/web/src/lib/services/railwayWorker.service.ts
import { browser } from '$app/environment';
import { PUBLIC_RAILWAY_WORKER_URL } from '$env/static/public';
import type {
	QueueJob,
	DailyBriefQueueJob,
	PhaseQueueJob,
	OnboardingAnalysisJobMetadata,
	QueueJobType,
	ApiResponse
} from '@buildos/shared-types';

// Legacy type aliases for backward compatibility
export type BriefGenerationJob = DailyBriefQueueJob;
export type PhasesGenerationJob = PhaseQueueJob;
export type OnboardingAnalysisJob = QueueJob<'onboarding_analysis'>;

export interface QueueBriefResponse {
	success: boolean;
	jobId: string;
	scheduledFor: string;
	message: string;
}

export interface QueuePhasesResponse {
	success: boolean;
	jobId: string;
	projectId: string;
	message: string;
}

export interface QueueOnboardingResponse {
	success: boolean;
	jobId: string;
	message: string;
	analyzingFields: string[];
}

type ProjectMetadata = { projectId: string };

const hasProjectMetadata = (metadata: unknown): metadata is ProjectMetadata =>
	typeof (metadata as ProjectMetadata | null | undefined)?.projectId === 'string';

export interface UserQuestion {
	id: string;
	user_id: string;
	project_id?: string;
	question: string;
	context: string;
	expected_outcome: string;
	category: string;
	priority: string;
	status: string;
	source: string;
	source_field?: string;
	triggers?: any;
	created_at: string;
}

export class RailwayWorkerService {
	private static readonly WORKER_URL = PUBLIC_RAILWAY_WORKER_URL;
	private static readonly TIMEOUT = 10000; // 10 seconds

	/**
	 * Check if Railway worker is available
	 */
	static async isWorkerAvailable(): Promise<boolean> {
		if (!browser) return false;

		// Check if worker URL is configured
		if (!this.WORKER_URL) {
			// Railway worker URL not configured
			return false;
		}

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 second timeout for health check

			const response = await fetch(`${this.WORKER_URL}/health`, {
				signal: controller.signal,
				method: 'GET',
				mode: 'cors',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			clearTimeout(timeoutId);
			return response.ok;
		} catch (error) {
			// Railway worker not available
			return false;
		}
	}

	/**
	 * Queue a brief generation job
	 */
	static async queueBriefGeneration(
		userId: string,
		options?: {
			scheduledFor?: Date;
			briefDate?: string; // Explicitly pass the brief date
			timezone?: string; // Add timezone support
			includeProjects?: string[];
			excludeProjects?: string[];
		}
	): Promise<QueueBriefResponse> {
		const targetTime = options?.scheduledFor || new Date();

		// Get user's timezone if not provided
		const timezone = options?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

		const response = await fetch(`${this.WORKER_URL}/queue/brief`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				userId,
				scheduledFor: targetTime.toISOString(),
				briefDate: options?.briefDate, // Pass explicit brief date if provided
				timezone: timezone, // Always include timezone,
				forceRegenerate: true,
				options: {
					includeProjects: options?.includeProjects,
					excludeProjects: options?.excludeProjects
				}
			}),
			signal: AbortSignal.timeout(this.TIMEOUT)
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(
				error?.error || `Failed to queue brief generation (${response.status})`
			);
		}

		const result = await response.json();
		if (!result?.success || !result?.jobId) {
			throw new Error('Invalid response format from worker');
		}

		return result;
	}

	/**
	 * Queue a phases generation job
	 */
	static async queuePhasesGeneration(
		userId: string,
		projectId: string,
		options?: {
			regenerate?: boolean;
			template?: string;
			includeExistingTasks?: boolean;
		}
	): Promise<QueuePhasesResponse> {
		const response = await fetch(`${this.WORKER_URL}/queue/phases`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				userId,
				projectId,
				options
			}),
			signal: AbortSignal.timeout(this.TIMEOUT)
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(
				error?.error || `Failed to queue phases generation (${response.status})`
			);
		}

		const result = await response.json();
		if (!result?.success || !result?.jobId) {
			throw new Error('Invalid response format from worker');
		}

		return result;
	}

	/**
	 * Queue an onboarding analysis job
	 */
	static async queueOnboardingAnalysis(
		userId: string,
		userContext?: {
			input_projects?: string | null;
			input_work_style?: string | null;
			input_challenges?: string | null;
			input_help_focus?: string | null;
		},
		options?: {
			forceRegenerate?: boolean;
			maxQuestions?: number;
		}
	): Promise<QueueOnboardingResponse> {
		const response = await fetch(`${this.WORKER_URL}/queue/onboarding`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				userId,
				userContext,
				options
			}),
			signal: AbortSignal.timeout(this.TIMEOUT)
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(
				error?.error || `Failed to queue onboarding analysis (${response.status})`
			);
		}

		const result = await response.json();
		if (!result?.success || !result?.jobId) {
			throw new Error('Invalid response format from worker');
		}

		return result;
	}

	/**
	 * Get job status by job ID
	 */
	static async getJobStatus(jobId: string): Promise<QueueJob | null> {
		try {
			const response = await fetch(`${this.WORKER_URL}/jobs/${jobId}`, {
				signal: AbortSignal.timeout(this.TIMEOUT)
			});

			if (!response.ok) {
				if (response.status === 404) return null;
				throw new Error(`Failed to get job status: ${response.status}`);
			}

			return response.json();
		} catch (error) {
			console.error('Error getting job status:', error);
			return null;
		}
	}

	/**
	 * Get pending jobs for a user
	 */
	static async getUserPendingJobs(userId: string, jobType?: QueueJobType): Promise<QueueJob[]> {
		try {
			const params = new URLSearchParams();
			if (jobType) {
				params.set('type', jobType);
			}
			// users/:userId/jobs
			const url = `${this.WORKER_URL}/users/${userId}/jobs${params.toString() ? '?' + params.toString() : ''}`;

			const response = await fetch(url, {
				signal: AbortSignal.timeout(this.TIMEOUT)
			});

			if (!response.ok) {
				throw new Error(`Failed to get user jobs: ${response.status}`);
			}

			const data = await response.json();
			return data.jobs || [];
		} catch (error) {
			console.error('Error getting user jobs:', error);
			return [];
		}
	}

	/**
	 * Check if a brief is currently being generated for a specific date
	 */
	static async isBriefGenerating(
		userId: string,
		briefDate: string
	): Promise<{
		isGenerating: boolean;
		job?: BriefGenerationJob;
	}> {
		try {
			const pendingJobs = await this.getUserPendingJobs(userId, 'generate_daily_brief');

			// Check for jobs scheduled for the target date
			const targetDate = new Date(briefDate);
			const targetDateStr = targetDate.toISOString().split('T')[0];

			const activeJob = pendingJobs.find((job) => {
				const jobDate = new Date(job.scheduled_for).toISOString().split('T')[0];
				return (
					jobDate === targetDateStr &&
					job.job_type === 'generate_daily_brief' &&
					job.status === 'processing'
				);
			}) as BriefGenerationJob | undefined;

			return {
				isGenerating: !!activeJob,
				job: activeJob
			};
		} catch (error) {
			console.error('Error checking if brief is generating:', error);
			return { isGenerating: false };
		}
	}

	/**
	 * Check if phases are currently being generated for a project
	 */
	static async isPhasesGenerating(
		userId: string,
		projectId: string
	): Promise<{
		isGenerating: boolean;
		job?: PhasesGenerationJob;
	}> {
		try {
			const pendingJobs = await this.getUserPendingJobs(userId, 'generate_phases');

			const activeJob = pendingJobs.find((job): job is PhasesGenerationJob => {
				return (
					job.job_type === 'generate_phases' &&
					job.status === 'processing' &&
					hasProjectMetadata(job.metadata) &&
					job.metadata.projectId === projectId
				);
			});

			return {
				isGenerating: !!activeJob,
				job: activeJob
			};
		} catch (error) {
			console.error('Error checking if phases are generating:', error);
			return { isGenerating: false };
		}
	}

	/**
	 * Check if onboarding analysis is currently being processed
	 */
	static async isOnboardingAnalysisGenerating(userId: string): Promise<{
		isGenerating: boolean;
		job?: OnboardingAnalysisJob;
	}> {
		try {
			const pendingJobs = await this.getUserPendingJobs(userId, 'onboarding_analysis');

			const activeJob = pendingJobs.find((job) => {
				return job.job_type === 'onboarding_analysis' && job.status === 'processing';
			}) as OnboardingAnalysisJob | undefined;

			return {
				isGenerating: !!activeJob,
				job: activeJob
			};
		} catch (error) {
			console.error('Error checking if onboarding analysis is generating:', error);
			return { isGenerating: false };
		}
	}

	/**
	 * Cancel/remove jobs for a specific date (when manually generating)
	 */
	static async cancelScheduledJobs(userId: string, briefDate: string): Promise<void> {
		try {
			// This would ideally be an endpoint on the Railway worker
			// For now, we'll handle this logic in the database directly
			console.log(`Would cancel scheduled jobs for user ${userId} on ${briefDate}`);
		} catch (error) {
			console.error('Error canceling scheduled jobs:', error);
		}
	}

	/**
	 * Cancel a specific job by ID
	 */
	static async cancelJob(jobId: string): Promise<boolean> {
		try {
			// Note: This would need to be implemented on the Railway worker
			// For now, return false as it's not implemented
			console.log(`Would cancel job ${jobId}`);
			return false;
		} catch (error) {
			console.error('Error canceling job:', error);
			return false;
		}
	}

	/**
	 * Queue a chat session classification job
	 * This is a fire-and-forget operation that classifies chat sessions
	 * by generating a title and extracting topics
	 */
	static async queueChatSessionClassification(
		sessionId: string,
		userId: string
	): Promise<{ success: boolean; jobId?: string; error?: string }> {
		// Skip if worker URL is not configured
		if (!this.WORKER_URL) {
			console.log('Chat classification skipped: Worker URL not configured');
			return { success: false, error: 'Worker not configured' };
		}

		try {
			const response = await fetch(`${this.WORKER_URL}/queue/chat/classify`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					sessionId,
					userId
				}),
				signal: AbortSignal.timeout(this.TIMEOUT)
			});

			// Handle conflict (already in progress) gracefully
			if (response.status === 409) {
				const data = await response.json();
				console.log(`Chat classification already in progress: ${data.existingJobId}`);
				return { success: true, jobId: data.existingJobId };
			}

			if (!response.ok) {
				const error = await response.json().catch(() => ({ error: 'Unknown error' }));
				console.error('Chat classification queue failed:', error);
				return { success: false, error: error?.error || `HTTP ${response.status}` };
			}

			const result = await response.json();
			return { success: true, jobId: result.jobId };
		} catch (error) {
			// Silently fail for chat classification - it's a background task
			console.error('Chat classification queue error:', error);
			return { success: false, error: 'Network error' };
		}
	}

	/**
	 * Get all jobs for a user with pagination
	 */
	static async getUserJobs(
		userId: string,
		options?: {
			jobType?: QueueJobType;
			status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'retrying';
			limit?: number;
			offset?: number;
		}
	): Promise<{
		jobs: QueueJob[];
		total: number;
		hasMore: boolean;
	}> {
		try {
			// This would need to be implemented as a new endpoint on Railway worker
			// For now, use the existing endpoint with limited functionality
			const jobs = await this.getUserPendingJobs(userId, options?.jobType);

			let filteredJobs = jobs;
			if (options?.status) {
				filteredJobs = jobs.filter((job) => job.status === options.status);
			}

			const limit = options?.limit || 10;
			const offset = options?.offset || 0;
			const paginatedJobs = filteredJobs.slice(offset, offset + limit);

			return {
				jobs: paginatedJobs,
				total: filteredJobs.length,
				hasMore: offset + limit < filteredJobs.length
			};
		} catch (error) {
			console.error('Error getting user jobs:', error);
			return {
				jobs: [],
				total: 0,
				hasMore: false
			};
		}
	}
}
