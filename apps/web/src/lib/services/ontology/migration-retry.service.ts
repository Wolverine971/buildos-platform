// apps/web/src/lib/services/ontology/migration-retry.service.ts
// Migration Retry Service - Handles targeted retry of failed migrations

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { v4 as uuidv4 } from 'uuid';
import type { ErrorCategory, EntityType } from './migration-error.service';
import { MigrationErrorService } from './migration-error.service';
import { OntologyMigrationOrchestrator } from './ontology-migration-orchestrator';

export interface RetryRequest {
	// Target selection (one required)
	errorIds?: number[];
	runId?: string;
	userId?: string;
	projectId?: string;

	// Filters
	entityType?: EntityType;
	errorCategory?: ErrorCategory;

	// Options
	maxRetries?: number;
	projectConcurrency?: number;
	phaseConcurrency?: number;
	taskConcurrency?: number;
	eventConcurrency?: number;
}

export interface RetryResponse {
	runId: string;
	batchId: string;
	targeted: number;
	skipped: number;
	retrying: number;
	status: 'started' | 'completed' | 'partial_success';
	results?: {
		successful: number;
		failed: number;
	};
}

export interface RetryConfig {
	maxAttempts: number;
	baseDelayMs: number;
	maxDelayMs: number;
	backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
	maxAttempts: 3,
	baseDelayMs: 1000,
	maxDelayMs: 30000,
	backoffMultiplier: 2
};

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	config: RetryConfig = DEFAULT_RETRY_CONFIG,
	onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
	let lastError: Error = new Error('Unknown error');

	for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error as Error;

			if (attempt < config.maxAttempts) {
				const delay = Math.min(
					config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
					config.maxDelayMs
				);
				onRetry?.(attempt, lastError);
				await sleep(delay);
			}
		}
	}

	throw lastError;
}

export class MigrationRetryService {
	private errorService: MigrationErrorService;

	constructor(private readonly supabase: SupabaseClient<Database>) {
		this.errorService = new MigrationErrorService(supabase);
	}

	/**
	 * Retry failed migrations based on filters
	 */
	async retry(request: RetryRequest, initiatedBy: string): Promise<RetryResponse> {
		const {
			errorIds,
			runId,
			userId,
			projectId,
			entityType,
			errorCategory,
			maxRetries = 3
		} = request;

		// Generate new run and batch IDs
		const newRunId = uuidv4();
		const batchId = `retry_${newRunId.slice(0, 8)}`;

		// Get failed entries to retry
		const targets = await this.getRetryTargets({
			errorIds,
			runId,
			userId,
			projectId,
			entityType,
			errorCategory,
			maxRetries
		});

		if (targets.length === 0) {
			return {
				runId: newRunId,
				batchId,
				targeted: 0,
				skipped: 0,
				retrying: 0,
				status: 'completed',
				results: { successful: 0, failed: 0 }
			};
		}

		// Filter out entries that exceed maxRetries
		const eligibleTargets = targets.filter((t) => (t.retry_count ?? 0) < maxRetries);
		const skipped = targets.length - eligibleTargets.length;

		// Resolve the project IDs that need to be retried (projects for project/task/phase/calendar errors)
		const projectIds = await this.resolveProjectIds(eligibleTargets);
		if (projectIds.size === 0) {
			return {
				runId: newRunId,
				batchId,
				targeted: targets.length,
				skipped: targets.length,
				retrying: 0,
				status: 'completed',
				results: { successful: 0, failed: 0 }
			};
		}

		// Bump retry counts and mark originals as in_progress to reflect action in UI
		await Promise.all(
			eligibleTargets.map(async (target) => {
				await this.incrementRetryCount(target.id);
				await this.updateOriginalEntry(target.id, 'in_progress', null);
			})
		);

		// Kick off migration immediately for the affected projects
		const orchestrator = new OntologyMigrationOrchestrator(this.supabase as unknown as any);
		const orchestration = await orchestrator.start({
			projectIds: Array.from(projectIds),
			includeArchived: false,
			batchSize: projectIds.size,
			dryRun: false,
			initiatedBy,
			skipCompletedTasks: true,
			projectConcurrency: request.projectConcurrency ?? 3,
			phaseConcurrency: request.phaseConcurrency ?? 5,
			taskConcurrency: request.taskConcurrency ?? 5,
			eventConcurrency: request.eventConcurrency ?? 10
		});

		return {
			runId: orchestration.runId ?? newRunId,
			batchId: orchestration.batchId ?? batchId,
			targeted: targets.length,
			skipped,
			retrying: eligibleTargets.length,
			status: 'started'
		};
	}

	/**
	 * Determine which projects need to be re-run based on the failed targets
	 */
	private async resolveProjectIds(
		targets: Array<Database['public']['Tables']['migration_log']['Row']>
	): Promise<Set<string>> {
		const projectIds = new Set<string>();
		const taskIds: string[] = [];
		const phaseIds: string[] = [];
		const calendarIds: string[] = [];

		for (const target of targets) {
			if (target.entity_type === 'project' && target.legacy_id) {
				projectIds.add(target.legacy_id);
			} else if (target.entity_type === 'task' && target.legacy_id) {
				taskIds.push(target.legacy_id);
			} else if (target.entity_type === 'phase' && target.legacy_id) {
				phaseIds.push(target.legacy_id);
			} else if (target.entity_type === 'calendar' && target.legacy_id) {
				calendarIds.push(target.legacy_id);
			}
		}

		if (taskIds.length) {
			const { data: tasks } = await this.supabase
				.from('tasks')
				.select('id, project_id')
				.in('id', taskIds);
			for (const task of tasks ?? []) {
				if (task.project_id) projectIds.add(task.project_id);
			}
		}

		if (phaseIds.length) {
			const { data: phases } = await this.supabase
				.from('phases')
				.select('id, project_id')
				.in('id', phaseIds);
			for (const phase of phases ?? []) {
				if (phase.project_id) projectIds.add(phase.project_id);
			}
		}

		if (calendarIds.length) {
			const { data: events } = await this.supabase
				.from('task_calendar_events')
				.select('id, task_id')
				.in('id', calendarIds);

			const calendarTaskIds = (events ?? [])
				.map((e) => e.task_id)
				.filter(Boolean) as string[];
			if (calendarTaskIds.length) {
				const { data: tasks } = await this.supabase
					.from('tasks')
					.select('id, project_id')
					.in('id', calendarTaskIds);
				for (const task of tasks ?? []) {
					if (task.project_id) projectIds.add(task.project_id);
				}
			}
		}

		return projectIds;
	}

	/**
	 * Get targets for retry based on filters
	 */
	private async getRetryTargets(params: {
		errorIds?: number[];
		runId?: string;
		userId?: string;
		projectId?: string;
		entityType?: EntityType;
		errorCategory?: ErrorCategory;
		maxRetries: number;
	}): Promise<Array<Database['public']['Tables']['migration_log']['Row']>> {
		let query = this.supabase.from('migration_log').select('*').eq('status', 'failed');

		// Apply filters
		if (params.errorIds && params.errorIds.length > 0) {
			query = query.in('id', params.errorIds);
		}
		if (params.runId) {
			query = query.eq('run_id', params.runId);
		}
		if (params.userId) {
			query = query.eq('user_id', params.userId);
		}
		if (params.entityType) {
			query = query.eq('entity_type', params.entityType);
		}
		if (params.errorCategory) {
			query = query.eq('error_category', params.errorCategory);
		}
		// Exclude fatal errors from retry (unless specifically targeted)
		if (!params.errorIds) {
			query = query.neq('error_category', 'fatal');
		}

		const { data, error } = await query;

		if (error) {
			throw new Error(`Failed to get retry targets: ${error.message}`);
		}

		// Filter by projectId if specified (requires joining with tasks/phases)
		if (params.projectId && data) {
			const filteredByProject: typeof data = [];

			for (const row of data) {
				if (row.entity_type === 'project' && row.legacy_id === params.projectId) {
					filteredByProject.push(row);
				} else if (row.entity_type === 'task' && row.legacy_id) {
					// Check if task belongs to project
					const { data: task } = await this.supabase
						.from('tasks')
						.select('project_id')
						.eq('id', row.legacy_id)
						.single();
					if (task?.project_id === params.projectId) {
						filteredByProject.push(row);
					}
				} else if (row.entity_type === 'phase' && row.legacy_id) {
					// Check if phase belongs to project
					const { data: phase } = await this.supabase
						.from('phases')
						.select('project_id')
						.eq('id', row.legacy_id)
						.single();
					if (phase?.project_id === params.projectId) {
						filteredByProject.push(row);
					}
				}
			}

			return filteredByProject;
		}

		return data ?? [];
	}

	/**
	 * Create a retry run entry in migration_log
	 */
	private async createRetryRun(
		runId: string,
		batchId: string,
		initiatedBy: string,
		targetCount: number
	): Promise<void> {
		await this.supabase.from('migration_log').insert({
			run_id: runId,
			batch_id: batchId,
			entity_type: 'run',
			operation: 'retry',
			status: 'in_progress',
			metadata: {
				initiatedBy,
				targetCount,
				startedAt: new Date().toISOString()
			}
		});
	}

	/**
	 * Update run status
	 */
	private async updateRunStatus(runId: string, status: string): Promise<void> {
		const { data: existing } = await this.supabase
			.from('migration_log')
			.select('metadata')
			.eq('run_id', runId)
			.eq('entity_type', 'run')
			.single();

		const existingMetadata = (existing?.metadata ?? {}) as Record<string, unknown>;
		await this.supabase
			.from('migration_log')
			.update({
				status,
				metadata: { ...existingMetadata, completedAt: new Date().toISOString() }
			})
			.eq('run_id', runId)
			.eq('entity_type', 'run');
	}

	/**
	 * Retry a project migration
	 */
	private async retryProject(
		target: Database['public']['Tables']['migration_log']['Row'],
		runId: string,
		batchId: string
	): Promise<void> {
		const legacyId = target.legacy_id;
		if (!legacyId) {
			throw new Error('Missing legacy_id for project retry');
		}

		// Check if already migrated (idempotent)
		const { data: existingMapping } = await this.supabase
			.from('legacy_entity_mappings')
			.select('onto_id')
			.eq('legacy_table', 'projects')
			.eq('legacy_id', legacyId)
			.single();

		if (existingMapping?.onto_id) {
			// Already migrated, mark as completed
			await this.updateOriginalEntry(target.id, 'completed', null);
			return;
		}

		// Update retry count on original entry
		await this.incrementRetryCount(target.id);

		// Perform the actual migration using the orchestrator
		// Note: In a real implementation, this would call the ProjectMigrationService
		// For now, we mark as pending for the orchestrator to pick up
		await this.supabase.from('migration_log').insert({
			run_id: runId,
			batch_id: batchId,
			entity_type: 'project',
			operation: 'retry',
			legacy_table: 'projects',
			legacy_id: legacyId,
			status: 'pending',
			user_id: target.user_id,
			metadata: {
				originalErrorId: target.id,
				retryAttempt: (target.retry_count ?? 0) + 1
			}
		});

		// Mark original as in_progress
		await this.updateOriginalEntry(target.id, 'in_progress', null);
	}

	/**
	 * Retry a phase migration
	 */
	private async retryPhase(
		target: Database['public']['Tables']['migration_log']['Row'],
		runId: string,
		batchId: string
	): Promise<void> {
		const legacyId = target.legacy_id;
		if (!legacyId) {
			throw new Error('Missing legacy_id for phase retry');
		}

		// Check if already migrated
		const { data: existingMapping } = await this.supabase
			.from('legacy_entity_mappings')
			.select('onto_id')
			.eq('legacy_table', 'phases')
			.eq('legacy_id', legacyId)
			.single();

		if (existingMapping?.onto_id) {
			await this.updateOriginalEntry(target.id, 'completed', null);
			return;
		}

		await this.incrementRetryCount(target.id);

		await this.supabase.from('migration_log').insert({
			run_id: runId,
			batch_id: batchId,
			entity_type: 'phase',
			operation: 'retry',
			legacy_table: 'phases',
			legacy_id: legacyId,
			status: 'pending',
			user_id: target.user_id,
			metadata: {
				originalErrorId: target.id,
				retryAttempt: (target.retry_count ?? 0) + 1
			}
		});

		await this.updateOriginalEntry(target.id, 'in_progress', null);
	}

	/**
	 * Retry a task migration
	 */
	private async retryTask(
		target: Database['public']['Tables']['migration_log']['Row'],
		runId: string,
		batchId: string
	): Promise<void> {
		const legacyId = target.legacy_id;
		if (!legacyId) {
			throw new Error('Missing legacy_id for task retry');
		}

		// Check if already migrated
		const { data: existingMapping } = await this.supabase
			.from('legacy_entity_mappings')
			.select('onto_id')
			.eq('legacy_table', 'tasks')
			.eq('legacy_id', legacyId)
			.single();

		if (existingMapping?.onto_id) {
			await this.updateOriginalEntry(target.id, 'completed', null);
			return;
		}

		await this.incrementRetryCount(target.id);

		await this.supabase.from('migration_log').insert({
			run_id: runId,
			batch_id: batchId,
			entity_type: 'task',
			operation: 'retry',
			legacy_table: 'tasks',
			legacy_id: legacyId,
			status: 'pending',
			user_id: target.user_id,
			metadata: {
				originalErrorId: target.id,
				retryAttempt: (target.retry_count ?? 0) + 1
			}
		});

		await this.updateOriginalEntry(target.id, 'in_progress', null);
	}

	/**
	 * Retry a calendar event migration
	 */
	private async retryCalendarEvent(
		target: Database['public']['Tables']['migration_log']['Row'],
		runId: string,
		batchId: string
	): Promise<void> {
		const legacyId = target.legacy_id;
		if (!legacyId) {
			throw new Error('Missing legacy_id for calendar event retry');
		}

		// Check if already migrated
		const { data: existingMapping } = await this.supabase
			.from('legacy_entity_mappings')
			.select('onto_id')
			.eq('legacy_table', 'task_calendar_events')
			.eq('legacy_id', legacyId)
			.single();

		if (existingMapping?.onto_id) {
			await this.updateOriginalEntry(target.id, 'completed', null);
			return;
		}

		await this.incrementRetryCount(target.id);

		await this.supabase.from('migration_log').insert({
			run_id: runId,
			batch_id: batchId,
			entity_type: 'calendar',
			operation: 'retry',
			legacy_table: 'task_calendar_events',
			legacy_id: legacyId,
			status: 'pending',
			user_id: target.user_id,
			metadata: {
				originalErrorId: target.id,
				retryAttempt: (target.retry_count ?? 0) + 1
			}
		});

		await this.updateOriginalEntry(target.id, 'in_progress', null);
	}

	/**
	 * Record a retry failure
	 */
	private async recordRetryFailure(
		target: Database['public']['Tables']['migration_log']['Row'],
		runId: string,
		batchId: string,
		error: Error
	): Promise<void> {
		const errorCategory = this.errorService.classifyError(error, {
			retryCount: (target.retry_count ?? 0) + 1
		});

		await this.supabase
			.from('migration_log')
			.update({
				status: 'failed',
				error_message: error.message,
				error_category: errorCategory,
				retry_count: (target.retry_count ?? 0) + 1,
				last_retry_at: new Date().toISOString()
			})
			.eq('id', target.id);
	}

	/**
	 * Increment retry count on original entry
	 */
	private async incrementRetryCount(id: number): Promise<void> {
		await this.supabase.rpc('increment_migration_retry_count', { row_id: id });
	}

	/**
	 * Update original entry status
	 */
	private async updateOriginalEntry(
		id: number,
		status: string,
		errorMessage: string | null
	): Promise<void> {
		const update: Record<string, unknown> = { status };
		if (errorMessage !== null) {
			update.error_message = errorMessage;
		}
		if (status === 'completed') {
			update.error_category = null;
			update.error_message = null;
		}

		await this.supabase.from('migration_log').update(update).eq('id', id);
	}
}
