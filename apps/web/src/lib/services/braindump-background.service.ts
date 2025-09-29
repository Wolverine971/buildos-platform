// src/lib/services/braindump-background.service.ts
import { browser } from '$app/environment';
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toastService } from '$lib/stores/toast.store';
import type { BrainDumpParseResult, ParsedOperation } from '$lib/types/brain-dump';
import type { ApiError, ApiSuccess } from '$lib/utils/api-response';
import { BrainDumpStatusService } from './braindump-status.service';

export interface BackgroundJob {
	id: string;
	status: 'pending' | 'processing' | 'completed' | 'failed';
	text: string;
	projectId?: string;
	userId: string;
	autoAccept: boolean;
	startTime: number;
	endTime?: number;
	result?: {
		success: boolean;
		operationCount?: number;
		projectId?: string;
		error?: string;
		parseResult?: BrainDumpParseResult;
		saveResult?: SaveOperationsResponse;
	};
	error?: string;
}

export interface ProcessingParams {
	text: string;
	projectId?: string;
	userId: string;
	autoAccept: boolean;
}

// Response types from API endpoints
interface SaveOperationsResponse {
	totalOperations: number;
	successfulOperations: number;
	failedOperations: number;
	brainDumpId: string;
	projectInfo?: {
		id: string;
		name: string;
		slug: string;
		isNew: boolean;
	} | null;
	results: Array<{
		table: string;
		operation: string;
		id?: string;
		operationType?: string;
		error?: string;
	}>;
	executionSummary: {
		createdRecords: number;
		updatedRecords: number;
		failedValidations: number;
		referenceErrors: number;
	};
}

interface SSEEvent {
	type: string;
	data: any;
}

// Define cleanup time thresholds as constants
const CLEANUP_THRESHOLDS = {
	FAILED: 1 * 60 * 1000, // 1 minute
	COMPLETED: 10 * 60 * 1000, // 10 minutes
	STUCK: 15 * 60 * 1000, // 15 minutes
	STALE: 30 * 60 * 1000 // 30 minutes
} as const;

class BackgroundBrainDumpService {
	private activeJobs = new Map<string, BackgroundJob>();
	private listeners = new Set<(job: BackgroundJob) => void>();
	private supabase: SupabaseClient<Database> | null = null;
	private statusService: BrainDumpStatusService | null = null;

	constructor() {
		if (browser) {
			this.loadFromSessionStorage();
			// Clean up any stale jobs on initialization
			this.cleanupStaleJobs();
		}
	}

	setSupabaseClient(client: SupabaseClient<Database>) {
		this.supabase = client;
		this.statusService = new BrainDumpStatusService(client);
	}

	async processInBackground(params: ProcessingParams): Promise<string> {
		const jobId = crypto.randomUUID();

		const job: BackgroundJob = {
			id: jobId,
			status: 'pending',
			text: params.text,
			projectId: params.projectId,
			userId: params.userId,
			autoAccept: params.autoAccept,
			startTime: Date.now()
		};

		this.activeJobs.set(jobId, job);
		this.updateJob(jobId, { status: 'processing' });
		this.saveToSessionStorage();

		// Process without blocking
		this.executeJob(jobId, params).catch((error) => {
			console.error('Background job failed:', error);
			this.updateJob(jobId, {
				status: 'failed',
				error: error.message || 'Unknown error',
				endTime: Date.now()
			});

			// Clean up failed job from storage after a delay
			setTimeout(() => {
				this.removeFailedJob(jobId);
			}, CLEANUP_THRESHOLDS.FAILED);
		});

		return jobId;
	}

	private async executeJob(jobId: string, params: ProcessingParams) {
		try {
			// When auto-accept is true, make a single API call with autoExecute: true
			if (params.autoAccept) {
				console.log('Auto-accept enabled, making single API call with autoExecute: true');

				// Make a single combined request that includes both parsing and execution
				const response = await fetch('/api/braindumps/generate', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						action: 'parse',
						text: params.text,
						selectedProjectId:
							params.projectId === 'new' ? undefined : params.projectId,
						options: {
							autoExecute: true // This will handle both parse and execute in one call
						}
					})
				});

				if (!response.ok) {
					try {
						const errorResponse = (await response.json()) as ApiError;
						throw new Error(
							errorResponse.error ||
								`Failed to process brain dump: ${response.statusText}`
						);
					} catch (e) {
						const errorText = await response.text();
						throw new Error(
							`Failed to process brain dump: ${errorText || response.statusText}`
						);
					}
				}

				const result = await response.json();
				if (!result?.data) {
					throw new Error('No result received from server');
				}

				const combinedResult = result.data as BrainDumpParseResult & {
					brainDumpId?: string;
					executionResult?: any;
				};

				// Extract parse result for the UI
				const parseResult: BrainDumpParseResult = {
					title: combinedResult.title,
					operations: combinedResult.operations,
					summary: combinedResult.summary,
					insights: combinedResult.insights,
					metadata: combinedResult.metadata,
					questionAnalysis: combinedResult.questionAnalysis,
					tags: combinedResult.tags
				};

				// Create a SaveOperationsResponse from the executionResult if it exists
				let saveResult: SaveOperationsResponse | undefined;
				if (combinedResult.executionResult) {
					const exec = combinedResult.executionResult;
					saveResult = {
						totalOperations: exec.successful.length + exec.failed.length,
						successfulOperations: exec.successful.length,
						failedOperations: exec.failed.length,
						brainDumpId: combinedResult.brainDumpId,
						projectInfo: exec.projectInfo,
						results: exec.results || [],
						executionSummary: exec.executionSummary
					};
				}

				// Update job with final result
				this.updateJob(jobId, {
					status: 'completed',
					endTime: Date.now(),
					result: {
						success: true,
						operationCount:
							saveResult?.successfulOperations ||
							combinedResult.operations.filter(
								(op: ParsedOperation) => op.enabled && !op.error
							).length,
						projectId: saveResult?.projectInfo?.id,
						parseResult,
						saveResult
					}
				});

				// Notify completion
				this.notifyCompletion(jobId);
				console.log(
					'Auto-processing completed. Brain dump ID:',
					combinedResult.brainDumpId
				);
			} else {
				// When auto-accept is false, only parse (no changes to this flow)
				const parseResult = await this.parseBrainDump(params);

				if (!parseResult || !parseResult.operations) {
					throw new Error('Failed to parse brain dump');
				}

				// Update job with parse result
				this.updateJob(jobId, {
					status: 'completed',
					endTime: Date.now(),
					result: {
						parseResult,
						success: true
					}
				});
			}
		} catch (error: any) {
			console.error('Background processing error:', error);
			this.updateJob(jobId, {
				status: 'failed',
				endTime: Date.now(),
				error: error.message || 'Processing failed',
				result: {
					success: false,
					error: error.message
				}
			});
			this.notifyError(jobId);

			// Clean up failed job from storage after a delay to allow user to see the error
			setTimeout(() => {
				this.removeFailedJob(jobId);
			}, CLEANUP_THRESHOLDS.FAILED);
		}
	}

	private async parseBrainDump(
		params: ProcessingParams
	): Promise<BrainDumpParseResult & { brainDumpId?: string }> {
		console.log('Starting brain dump parsing:', { textLength: params.text.length });

		const response = await fetch('/api/braindumps/generate', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				action: 'parse',
				text: params.text,
				selectedProjectId: params.projectId === 'new' ? undefined : params.projectId,
				options: {
					autoExecute: false // We'll handle execution ourselves
				}
			})
		});

		if (!response.ok) {
			try {
				const errorResponse = (await response.json()) as ApiError;
				throw new Error(
					errorResponse.error || `Failed to parse brain dump: ${response.statusText}`
				);
			} catch (e) {
				const errorText = await response.text();
				throw new Error(`Failed to parse brain dump: ${errorText || response.statusText}`);
			}
		}

		let parseResult = await response.json();

		if (!parseResult?.data) {
			throw new Error('No parse result received from server');
		}

		return parseResult.data as BrainDumpParseResult & { brainDumpId?: string };
	}

	// Removed applyOperationsWithParse method - no longer needed since we make a single call with autoExecute: true

	// Keep the applyOperations method for potential future use (manual save operations)
	private async applyOperations(
		parseResult: BrainDumpParseResult,
		originalText: string,
		projectId?: string
	): Promise<SaveOperationsResponse> {
		const response = await fetch('/api/braindumps/generate', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				action: 'save',
				operations: parseResult.operations,
				selectedProjectId: projectId === 'new' ? undefined : projectId,
				// Server will create/lookup brain dump based on originalText
				originalText: originalText,
				summary: parseResult.summary,
				insights: parseResult.insights,
				title: parseResult.title
			})
		});

		if (!response.ok) {
			try {
				const errorResponse = (await response.json()) as ApiError;
				throw new Error(
					errorResponse.error || `Failed to apply operations: ${response.statusText}`
				);
			} catch (e) {
				const errorText = await response.text();
				throw new Error(`Failed to apply operations: ${errorText || response.statusText}`);
			}
		}

		const successResponse = (await response.json()) as ApiSuccess<SaveOperationsResponse>;
		if (!successResponse.data) {
			throw new Error('Invalid response from save operations');
		}
		return successResponse.data;
	}

	private updateJob(jobId: string, updates: Partial<BackgroundJob>) {
		const job = this.activeJobs.get(jobId);
		if (job) {
			Object.assign(job, updates);
			this.saveToSessionStorage();
			this.notifyListeners(job);
		}
	}

	private notifyCompletion(jobId: string) {
		const job = this.activeJobs.get(jobId);
		if (job && job.result?.success) {
			const message = job.result.operationCount
				? `Brain dump processed! ${job.result.operationCount} operations applied.`
				: 'Brain dump processed successfully!';

			// Check if we have a project slug from the save result
			const projectId = job.result.saveResult?.projectInfo?.id || job.result.projectId;

			toastService.success(message, {
				duration: 5000
			});

			// If we have a project slug, we could navigate there
			// TODO: Consider adding action buttons to toast notifications
			if (projectId) {
				console.log(`Project available at: /projects/${projectId}`);
			}
		}
	}

	private notifyError(jobId: string) {
		const job = this.activeJobs.get(jobId);
		if (job && job.status === 'failed') {
			toastService.error(job.error || 'Background processing failed', {
				duration: 5000
			});
			// TODO: Consider adding retry functionality to error notifications
		}
	}

	private removeFailedJob(jobId: string) {
		const job = this.activeJobs.get(jobId);
		if (job && job.status === 'failed') {
			console.log('Removing failed job from storage:', jobId);
			this.activeJobs.delete(jobId);
			this.saveToSessionStorage();
			this.notifyListeners(job);
		}
	}

	async retryJob(jobId: string) {
		const job = this.activeJobs.get(jobId);
		if (job && job.status === 'failed') {
			const newJobId = await this.processInBackground({
				text: job.text,
				projectId: job.projectId,
				userId: job.userId,
				autoAccept: job.autoAccept
			});

			// Remove old failed job
			this.activeJobs.delete(jobId);
			this.saveToSessionStorage();

			return newJobId;
		}
		return null;
	}

	// Session storage persistence with size limits
	private saveToSessionStorage() {
		if (!browser) return;

		try {
			const jobs = Array.from(this.activeJobs.values());
			const data = JSON.stringify(jobs);

			// Check size (5MB limit for sessionStorage, use 4MB as safety limit)
			if (data.length > 4 * 1024 * 1024) {
				console.warn('Session storage data too large, pruning old jobs');
				this.pruneOldJobs();
				// Retry after pruning
				return this.saveToSessionStorage();
			}

			sessionStorage.setItem('active-brain-dump-jobs', data);
		} catch (e: any) {
			if (e.name === 'QuotaExceededError') {
				console.error('Session storage quota exceeded, clearing old jobs');
				this.pruneOldJobs();
				// Retry once after cleanup
				try {
					const jobs = Array.from(this.activeJobs.values());
					sessionStorage.setItem('active-brain-dump-jobs', JSON.stringify(jobs));
				} catch {
					console.error('Failed to save jobs after cleanup');
				}
			} else {
				console.error('Failed to save to session storage:', e);
			}
		}
	}

	private loadFromSessionStorage() {
		if (!browser) return;

		try {
			const stored = sessionStorage.getItem('active-brain-dump-jobs');
			if (stored) {
				const jobs: BackgroundJob[] = JSON.parse(stored);
				const now = Date.now();

				jobs.forEach((job) => {
					// Skip very old jobs using standardized threshold
					const age = now - (job.endTime || job.startTime);
					if (age > CLEANUP_THRESHOLDS.STALE) {
						console.log(
							`Skipping stale job ${job.id} (${Math.round(age / 60000)} minutes old)`
						);
						return;
					}

					// Don't restore failed jobs
					if (job.status === 'failed') {
						console.log(`Skipping failed job ${job.id}`);
						return;
					}

					// Only restore non-completed jobs or recently completed ones
					const isRecent = age < CLEANUP_THRESHOLDS.COMPLETED;
					if (job.status !== 'completed' || isRecent) {
						this.activeJobs.set(job.id, job);
					}
				});
			}
		} catch (error) {
			console.error('Failed to load background jobs from session storage:', error);
			// Clear corrupted storage
			sessionStorage.removeItem('active-brain-dump-jobs');
		}
	}

	// Job management
	getJob(jobId: string): BackgroundJob | undefined {
		return this.activeJobs.get(jobId);
	}

	getActiveJobs(): BackgroundJob[] {
		return Array.from(this.activeJobs.values()).filter(
			(job) => job.status === 'pending' || job.status === 'processing'
		);
	}

	getAllJobs(): BackgroundJob[] {
		return Array.from(this.activeJobs.values());
	}

	clearCompletedJobs() {
		const now = Date.now();
		for (const [id, job] of this.activeJobs.entries()) {
			if (job.status === 'completed' && job.endTime) {
				// Remove completed jobs using standardized threshold
				if (now - job.endTime > CLEANUP_THRESHOLDS.COMPLETED) {
					this.activeJobs.delete(id);
				}
			} else if (job.status === 'failed' && job.endTime) {
				// Remove failed jobs using standardized threshold
				if (now - job.endTime > CLEANUP_THRESHOLDS.FAILED) {
					this.activeJobs.delete(id);
				}
			}
		}
		this.saveToSessionStorage();
	}

	// Clear all failed jobs immediately
	clearFailedJobs() {
		const failedJobs = Array.from(this.activeJobs.entries())
			.filter(([_, job]) => job.status === 'failed')
			.map(([id]) => id);

		failedJobs.forEach((id) => {
			this.activeJobs.delete(id);
		});

		if (failedJobs.length > 0) {
			console.log(`Cleared ${failedJobs.length} failed jobs from storage`);
			this.saveToSessionStorage();
		}
	}

	// Clean up stale jobs on initialization
	private cleanupStaleJobs() {
		if (!browser) return;

		const now = Date.now();
		let cleanedCount = 0;

		for (const [id, job] of this.activeJobs.entries()) {
			const age = now - (job.endTime || job.startTime);

			// Remove failed jobs immediately
			if (job.status === 'failed') {
				this.activeJobs.delete(id);
				cleanedCount++;
			}
			// Remove completed jobs using standardized threshold
			else if (job.status === 'completed' && age > CLEANUP_THRESHOLDS.COMPLETED) {
				this.activeJobs.delete(id);
				cleanedCount++;
			}
			// Remove stuck processing jobs using standardized threshold
			else if (job.status === 'processing' && age > CLEANUP_THRESHOLDS.STUCK) {
				console.warn(
					`Removing stuck processing job ${id} (${Math.round(age / 60000)} minutes old)`
				);
				this.activeJobs.delete(id);
				cleanedCount++;
			}
		}

		if (cleanedCount > 0) {
			console.log(`Cleaned up ${cleanedCount} stale jobs`);
			this.saveToSessionStorage();
		}
	}

	// Prune old jobs when storage is too large
	private pruneOldJobs() {
		const now = Date.now();
		let prunedCount = 0;

		// First remove all failed jobs
		for (const [id, job] of this.activeJobs.entries()) {
			if (job.status === 'failed') {
				this.activeJobs.delete(id);
				prunedCount++;
			}
		}

		// Then remove old completed jobs
		for (const [id, job] of this.activeJobs.entries()) {
			if (job.status === 'completed' && job.endTime) {
				const age = now - job.endTime;
				// Remove completed jobs older than 5 minutes when pruning
				if (age > 5 * 60 * 1000) {
					this.activeJobs.delete(id);
					prunedCount++;
				}
			}
		}

		if (prunedCount > 0) {
			console.log(`Pruned ${prunedCount} jobs to reduce storage size`);
		}
	}

	// Event listeners
	subscribe(listener: (job: BackgroundJob) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notifyListeners(job: BackgroundJob) {
		this.listeners.forEach((listener) => listener(job));
	}
}

// Singleton instance
export const backgroundBrainDumpService = new BackgroundBrainDumpService();
