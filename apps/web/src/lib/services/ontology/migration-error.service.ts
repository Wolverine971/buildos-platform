// apps/web/src/lib/services/ontology/migration-error.service.ts
// Migration Error Service - Handles error retrieval, categorization, and remediation

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';

export type ErrorCategory = 'recoverable' | 'data' | 'fatal';
export type EntityType = 'project' | 'task' | 'phase' | 'calendar';
export type SuggestedAction = 'retry' | 'retry_with_fallback' | 'manual_fix' | 'skip';

export interface MigrationErrorDetail {
	id: number;
	runId: string;
	batchId: string;
	entityType: EntityType;
	legacyId: string;
	legacyTable: string;
	errorCategory: ErrorCategory | null;
	errorMessage: string;
	retryCount: number;
	lastRetryAt: string | null;
	createdAt: string;
	userId: string;
	userEmail: string;
	userName: string | null;
	projectId: string;
	projectName: string;
	entityName: string;
	canRetry: boolean;
	suggestedAction: SuggestedAction;
	suggestedActionDescription: string;
	metadata: Record<string, unknown>;
}

export interface ErrorsQueryParams {
	limit?: number;
	offset?: number;
	userId?: string;
	entityType?: EntityType;
	errorCategory?: ErrorCategory;
	runId?: string;
	projectId?: string;
	search?: string;
	sortBy?: 'createdAt' | 'entityType' | 'errorCategory';
	sortOrder?: 'asc' | 'desc';
}

export interface ErrorsResponse {
	errors: MigrationErrorDetail[];
	pagination: {
		total: number;
		limit: number;
		offset: number;
		hasMore: boolean;
	};
	categoryCounts: {
		recoverable: number;
		data: number;
		fatal: number;
	};
	filters: ErrorsQueryParams;
}

export interface RemediationSuggestion {
	action: SuggestedAction;
	description: string;
	autoFixAvailable: boolean;
	fallbackTemplate?: string;
	manualFixInstructions?: string;
}

// Fallback templates for each entity type
const FALLBACK_TEMPLATES: Record<string, string | null> = {
	project: 'project.generic',
	task: 'task.execute',
	phase: 'plan.timebox.sprint',
	calendar: null // No fallback for calendar
};

export class MigrationErrorService {
	constructor(private readonly supabase: SupabaseClient<Database>) {}

	/**
	 * Get paginated, filtered list of migration errors
	 */
	async getErrors(params: ErrorsQueryParams = {}): Promise<ErrorsResponse> {
		const {
			limit = 50,
			offset = 0,
			userId,
			entityType,
			errorCategory,
			runId,
			projectId,
			search,
			sortBy = 'createdAt',
			sortOrder = 'desc'
		} = params;

		// Clamp limit
		const clampedLimit = Math.min(Math.max(1, limit), 200);

		// Build query
		let query = this.supabase
			.from('migration_log')
			.select('*', { count: 'exact' })
			.eq('status', 'failed');

		// Apply filters
		if (userId) {
			query = query.eq('user_id', userId);
		}
		if (entityType) {
			query = query.eq('entity_type', entityType);
		}
		if (errorCategory) {
			query = query.eq('error_category', errorCategory);
		}
		if (runId) {
			query = query.eq('run_id', runId);
		}
		if (search?.trim()) {
			query = query.ilike('error_message', `%${search.trim()}%`);
		}

		// Apply sorting
		const sortColumn = this.mapSortColumn(sortBy);
		query = query.order(sortColumn, { ascending: sortOrder === 'asc', nullsFirst: false });

		// Apply pagination
		query = query.range(offset, offset + clampedLimit - 1);

		const { data, error, count } = await query;

		if (error) {
			throw new Error(`Failed to fetch errors: ${error.message}`);
		}

		// Get category counts
		const categoryCounts = await this.getCategoryCounts(params);

		// Enrich error data with context
		const errors = await this.enrichErrors(data ?? [], projectId);

		const total = count ?? 0;

		return {
			errors,
			pagination: {
				total,
				limit: clampedLimit,
				offset,
				hasMore: offset + clampedLimit < total
			},
			categoryCounts,
			filters: params
		};
	}

	/**
	 * Get a single error by ID
	 */
	async getError(errorId: number): Promise<MigrationErrorDetail | null> {
		const { data, error } = await this.supabase
			.from('migration_log')
			.select('*')
			.eq('id', errorId)
			.eq('status', 'failed')
			.single();

		if (error || !data) {
			return null;
		}

		const enriched = await this.enrichErrors([data]);
		return enriched[0] ?? null;
	}

	/**
	 * Get category counts with optional filters
	 */
	private async getCategoryCounts(
		params: Pick<ErrorsQueryParams, 'userId' | 'entityType' | 'runId'>
	): Promise<ErrorsResponse['categoryCounts']> {
		let query = this.supabase
			.from('migration_log')
			.select('error_category')
			.eq('status', 'failed');

		if (params.userId) {
			query = query.eq('user_id', params.userId);
		}
		if (params.entityType) {
			query = query.eq('entity_type', params.entityType);
		}
		if (params.runId) {
			query = query.eq('run_id', params.runId);
		}

		const { data } = await query;

		const counts = { recoverable: 0, data: 0, fatal: 0 };
		for (const row of data ?? []) {
			const category = row.error_category as ErrorCategory | null;
			if (category === 'recoverable') counts.recoverable++;
			else if (category === 'data') counts.data++;
			else if (category === 'fatal') counts.fatal++;
		}

		return counts;
	}

	/**
	 * Enrich error records with user, project, and entity context
	 */
	private async enrichErrors(
		rows: Array<Database['public']['Tables']['migration_log']['Row']>,
		projectIdFilter?: string
	): Promise<MigrationErrorDetail[]> {
		if (rows.length === 0) return [];

		// Collect IDs for batch lookups
		const userIds = new Set<string>();
		const projectIds = new Set<string>();
		const taskIds = new Set<string>();
		const phaseIds = new Set<string>();

		for (const row of rows) {
			if (row.user_id) userIds.add(row.user_id);
			if (row.entity_type === 'project' && row.legacy_id) {
				projectIds.add(row.legacy_id);
			}
			if (row.entity_type === 'task' && row.legacy_id) {
				taskIds.add(row.legacy_id);
			}
			if (row.entity_type === 'phase' && row.legacy_id) {
				phaseIds.add(row.legacy_id);
			}
		}

		// Batch fetch users
		const userMap = new Map<string, { email: string; name: string | null }>();
		if (userIds.size > 0) {
			const { data: users } = await this.supabase
				.from('users')
				.select('id, email, name')
				.in('id', Array.from(userIds));
			for (const user of users ?? []) {
				userMap.set(user.id, { email: user.email ?? '', name: user.name });
			}
		}

		// Batch fetch projects
		const projectMap = new Map<string, { name: string; user_id: string }>();
		if (projectIds.size > 0) {
			const { data: projects } = await this.supabase
				.from('projects')
				.select('id, name, user_id')
				.in('id', Array.from(projectIds));
			for (const project of projects ?? []) {
				projectMap.set(project.id, { name: project.name, user_id: project.user_id });
			}
		}

		// Batch fetch tasks (to get project_id and title)
		const taskMap = new Map<string, { title: string; project_id: string }>();
		if (taskIds.size > 0) {
			const { data: tasks } = await this.supabase
				.from('tasks')
				.select('id, title, project_id')
				.in('id', Array.from(taskIds));
			for (const task of tasks ?? []) {
				if (task.project_id) {
					taskMap.set(task.id, { title: task.title, project_id: task.project_id });
					projectIds.add(task.project_id);
				}
			}
		}

		// Batch fetch phases (to get project_id and name)
		const phaseMap = new Map<string, { name: string; project_id: string }>();
		if (phaseIds.size > 0) {
			const { data: phases } = await this.supabase
				.from('phases')
				.select('id, name, project_id')
				.in('id', Array.from(phaseIds));
			for (const phase of phases ?? []) {
				if (phase.project_id) {
					phaseMap.set(phase.id, { name: phase.name, project_id: phase.project_id });
					projectIds.add(phase.project_id);
				}
			}
		}

		// Fetch additional projects if needed (for tasks/phases)
		const missingProjectIds = Array.from(projectIds).filter((id) => !projectMap.has(id));
		if (missingProjectIds.length > 0) {
			const { data: projects } = await this.supabase
				.from('projects')
				.select('id, name, user_id')
				.in('id', missingProjectIds);
			for (const project of projects ?? []) {
				projectMap.set(project.id, { name: project.name, user_id: project.user_id });
			}
		}

		// Build enriched errors
		const errors: MigrationErrorDetail[] = [];

		for (const row of rows) {
			const entityType = row.entity_type as EntityType;
			const legacyId = row.legacy_id ?? '';
			const errorCategory = row.error_category as ErrorCategory | null;
			const metadata = (row.metadata ?? {}) as Record<string, unknown>;

			// Get entity name and project info
			let entityName = 'Unknown';
			let projectId = '';
			let projectName = 'Unknown Project';

			if (entityType === 'project') {
				const project = projectMap.get(legacyId);
				if (project) {
					entityName = project.name;
					projectId = legacyId;
					projectName = project.name;
				}
			} else if (entityType === 'task') {
				const task = taskMap.get(legacyId);
				if (task) {
					entityName = task.title;
					projectId = task.project_id;
					const project = projectMap.get(task.project_id);
					projectName = project?.name ?? 'Unknown Project';
				}
			} else if (entityType === 'phase') {
				const phase = phaseMap.get(legacyId);
				if (phase) {
					entityName = phase.name;
					projectId = phase.project_id;
					const project = projectMap.get(phase.project_id);
					projectName = project?.name ?? 'Unknown Project';
				}
			} else if (entityType === 'calendar') {
				// For calendar events, try to get info from metadata
				entityName = (metadata.eventTitle as string) ?? 'Calendar Event';
				projectId = (metadata.projectId as string) ?? '';
				if (projectId) {
					const project = projectMap.get(projectId);
					projectName = project?.name ?? 'Unknown Project';
				}
			}

			// Filter by project if specified
			if (projectIdFilter && projectId !== projectIdFilter) {
				continue;
			}

			// Get user info
			const userId = row.user_id ?? '';
			const user = userMap.get(userId);
			const userEmail = user?.email ?? '';
			const userName = user?.name ?? null;

			// Get remediation suggestion
			const remediation = this.suggestRemediation({
				errorCategory,
				errorMessage: row.error_message ?? '',
				entityType,
				retryCount: row.retry_count ?? 0,
				metadata
			});

			errors.push({
				id: row.id,
				runId: row.run_id,
				batchId: row.batch_id ?? '',
				entityType,
				legacyId,
				legacyTable: row.legacy_table ?? '',
				errorCategory,
				errorMessage: row.error_message ?? 'Unknown error',
				retryCount: row.retry_count ?? 0,
				lastRetryAt: row.last_retry_at,
				createdAt: row.created_at ?? '',
				userId,
				userEmail,
				userName,
				projectId,
				projectName,
				entityName,
				canRetry: remediation.action !== 'skip' && (row.retry_count ?? 0) < 3,
				suggestedAction: remediation.action,
				suggestedActionDescription: remediation.description,
				metadata
			});
		}

		return errors;
	}

	/**
	 * Classify an error into a category
	 */
	classifyError(error: Error | string, context?: { retryCount?: number }): ErrorCategory {
		const message = (typeof error === 'string' ? error : error.message).toLowerCase();
		const retryCount = context?.retryCount ?? 0;

		// Recoverable: transient issues
		if (
			message.includes('timeout') ||
			message.includes('rate limit') ||
			message.includes('connection') ||
			message.includes('503') ||
			message.includes('429') ||
			message.includes('temporary') ||
			message.includes('network') ||
			message.includes('econnreset') ||
			message.includes('socket hang up')
		) {
			return 'recoverable';
		}

		// Fatal: unrecoverable issues
		if (
			message.includes('corrupted') ||
			message.includes('circular') ||
			message.includes('unsupported type') ||
			message.includes('json parse') ||
			message.includes('invalid json') ||
			retryCount >= 3
		) {
			return 'fatal';
		}

		// Default: data errors
		return 'data';
	}

	/**
	 * Suggest remediation for an error
	 */
	suggestRemediation(context: {
		errorCategory: ErrorCategory | null;
		errorMessage: string;
		entityType: EntityType;
		retryCount: number;
		metadata: Record<string, unknown>;
	}): RemediationSuggestion {
		const { errorCategory, errorMessage, entityType, retryCount, metadata } = context;
		const messageLower = errorMessage.toLowerCase();

		// If already retried too many times, suggest skip
		if (retryCount >= 3) {
			return {
				action: 'skip',
				description:
					'Maximum retry attempts reached. This entity cannot be migrated automatically.',
				autoFixAvailable: false,
				manualFixInstructions:
					'Review the error details and consider manual migration or data cleanup.'
			};
		}

		switch (errorCategory) {
			case 'recoverable':
				return {
					action: 'retry',
					description: 'Transient error detected. Retry should succeed.',
					autoFixAvailable: true
				};

			case 'data':
				// Check for template match issues
				if (
					messageLower.includes('template match') ||
					messageLower.includes('threshold') ||
					messageLower.includes('confidence')
				) {
					const fallbackTemplate = FALLBACK_TEMPLATES[entityType];
					if (fallbackTemplate) {
						return {
							action: 'retry_with_fallback',
							description: `Use fallback template '${fallbackTemplate}' for this entity.`,
							autoFixAvailable: true,
							fallbackTemplate
						};
					}
				}

				// Check for schema validation issues
				if (
					messageLower.includes('schema') ||
					messageLower.includes('validation') ||
					messageLower.includes('required field')
				) {
					return {
						action: 'retry_with_fallback',
						description:
							'Schema validation failed. Use fallback template with flexible schema.',
						autoFixAvailable: true,
						fallbackTemplate: FALLBACK_TEMPLATES[entityType] ?? undefined
					};
				}

				// Check for constraint violations
				if (
					messageLower.includes('constraint') ||
					messageLower.includes('foreign key') ||
					messageLower.includes('duplicate')
				) {
					return {
						action: 'manual_fix',
						description: 'Data integrity issue detected. Manual review required.',
						autoFixAvailable: false,
						manualFixInstructions: this.generateFixInstructions(
							errorMessage,
							entityType,
							metadata
						)
					};
				}

				// Default data error handling
				return {
					action: 'retry_with_fallback',
					description: 'Data error detected. Retry with fallback template recommended.',
					autoFixAvailable: true,
					fallbackTemplate: FALLBACK_TEMPLATES[entityType] ?? undefined
				};

			case 'fatal':
				return {
					action: 'skip',
					description: 'Unrecoverable error. This entity cannot be migrated.',
					autoFixAvailable: false,
					manualFixInstructions:
						'This entity has a fundamental data issue that prevents migration. Consider manual data cleanup or excluding from migration.'
				};

			default:
				// Unknown category, try retry first
				return {
					action: 'retry',
					description: 'Error category unknown. Attempting retry.',
					autoFixAvailable: true
				};
		}
	}

	/**
	 * Generate specific fix instructions based on error context
	 */
	private generateFixInstructions(
		errorMessage: string,
		entityType: EntityType,
		metadata: Record<string, unknown>
	): string {
		const messageLower = errorMessage.toLowerCase();
		const instructions: string[] = [];

		if (messageLower.includes('foreign key')) {
			instructions.push('Check that all referenced entities exist and are not deleted.');
		}

		if (messageLower.includes('duplicate')) {
			instructions.push(
				'This entity may have already been migrated. Check legacy_entity_mappings for existing mapping.'
			);
		}

		if (messageLower.includes('null') || messageLower.includes('required')) {
			instructions.push(
				'One or more required fields are missing. Review the source data and ensure all required fields are populated.'
			);
		}

		if (entityType === 'task') {
			instructions.push(
				'Ensure the parent project has been migrated before retrying task migration.'
			);
		}

		if (entityType === 'phase') {
			instructions.push(
				'Ensure the parent project has been migrated before retrying phase migration.'
			);
		}

		if (entityType === 'calendar') {
			instructions.push(
				'Ensure the associated task has been migrated before retrying calendar event migration.'
			);
		}

		if (instructions.length === 0) {
			instructions.push('Review the error message and metadata for more details.');
		}

		return instructions.join(' ');
	}

	/**
	 * Map sort column to database column
	 */
	private mapSortColumn(sortBy: string): string {
		const mapping: Record<string, string> = {
			createdAt: 'created_at',
			entityType: 'entity_type',
			errorCategory: 'error_category'
		};
		return mapping[sortBy] ?? 'created_at';
	}

	/**
	 * Get fallback template for an entity type
	 */
	getFallbackTemplate(entityType: EntityType): string | null {
		return FALLBACK_TEMPLATES[entityType] ?? null;
	}

	/**
	 * Delete errors by IDs
	 */
	async deleteErrors(errorIds: number[]): Promise<{ deleted: number }> {
		if (errorIds.length === 0) {
			return { deleted: 0 };
		}

		const { error, count } = await this.supabase
			.from('migration_log')
			.delete({ count: 'exact' })
			.in('id', errorIds)
			.eq('status', 'failed');

		if (error) {
			throw new Error(`Failed to delete errors: ${error.message}`);
		}

		return { deleted: count ?? 0 };
	}

	/**
	 * Delete all errors matching filters
	 */
	async deleteAllErrors(params: {
		errorCategory?: ErrorCategory;
		entityType?: EntityType;
		userId?: string;
		runId?: string;
	}): Promise<{ deleted: number }> {
		let query = this.supabase
			.from('migration_log')
			.delete({ count: 'exact' })
			.eq('status', 'failed');

		if (params.errorCategory) {
			query = query.eq('error_category', params.errorCategory);
		}
		if (params.entityType) {
			query = query.eq('entity_type', params.entityType);
		}
		if (params.userId) {
			query = query.eq('user_id', params.userId);
		}
		if (params.runId) {
			query = query.eq('run_id', params.runId);
		}

		const { error, count } = await query;

		if (error) {
			throw new Error(`Failed to delete errors: ${error.message}`);
		}

		return { deleted: count ?? 0 };
	}
}
