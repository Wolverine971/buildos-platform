// apps/web/src/lib/services/project-activity-log.service.ts
/**
 * ProjectActivityLogService - Manages project activity logging and next steps
 *
 * This service provides methods for:
 * - Logging changes to project-related entities
 * - Retrieving activity logs for projects
 * - Managing project next steps (AI-generated recommendations)
 *
 * @see /apps/web/docs/features/project-activity-logging/IMPLEMENTATION_PLAN.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type {
	ProjectLogEntry,
	ProjectLogInsert,
	ProjectLogEntityType,
	ProjectLogAction,
	ProjectLogChangeSource,
	ProjectLogsQueryOptions,
	ProjectLogsResponse,
	NextStepSource,
	ProjectNextStep
} from '@buildos/shared-types';

// =============================================================================
// Types
// =============================================================================

interface LogChangeParams {
	projectId: string;
	entityType: ProjectLogEntityType;
	entityId: string;
	action: ProjectLogAction;
	beforeData?: Record<string, unknown> | null;
	afterData?: Record<string, unknown> | null;
	changedBy: string;
	changeSource?: ProjectLogChangeSource;
	chatSessionId?: string;
}

interface UpdateNextStepParams {
	projectId: string;
	nextStepShort: string;
	nextStepLong: string;
	source?: NextStepSource;
}

interface BulkLogResult {
	success: boolean;
	insertedCount: number;
	errors: string[];
}

// =============================================================================
// Service Class
// =============================================================================

export class ProjectActivityLogService {
	constructor(private supabase: SupabaseClient<Database>) {}

	// ===========================================================================
	// Activity Log Methods
	// ===========================================================================

	/**
	 * Log a single change to a project entity
	 *
	 * @param params - The change details
	 * @returns The created log entry ID
	 *
	 * @example
	 * await service.logChange({
	 *   projectId: 'project-123',
	 *   entityType: 'task',
	 *   entityId: 'task-456',
	 *   action: 'updated',
	 *   beforeData: { title: 'Old title' },
	 *   afterData: { title: 'New title' },
	 *   changedBy: 'user-789',
	 *   changeSource: 'form'
	 * });
	 */
	async logChange(params: LogChangeParams): Promise<string> {
		const { data, error } = await this.supabase
			.from('onto_project_logs')
			.insert({
				project_id: params.projectId,
				entity_type: params.entityType,
				entity_id: params.entityId,
				action: params.action,
				before_data: params.beforeData ?? null,
				after_data: params.afterData ?? null,
				changed_by: params.changedBy,
				change_source: params.changeSource ?? null,
				chat_session_id: params.chatSessionId ?? null
			})
			.select('id')
			.single();

		if (error) {
			console.error('Error logging project change:', error);
			throw new Error(`Failed to log project change: ${error.message}`);
		}

		return data.id;
	}

	/**
	 * Log multiple changes in a single transaction
	 * Useful for batch operations or when a single action affects multiple entities
	 *
	 * @param logs - Array of log entries to insert
	 * @returns Result with count of inserted logs
	 */
	async logChanges(logs: ProjectLogInsert[]): Promise<BulkLogResult> {
		if (logs.length === 0) {
			return { success: true, insertedCount: 0, errors: [] };
		}

		const { data, error } = await this.supabase
			.from('onto_project_logs')
			.insert(
				logs.map((log) => ({
					project_id: log.project_id,
					entity_type: log.entity_type,
					entity_id: log.entity_id,
					action: log.action,
					before_data: log.before_data ?? null,
					after_data: log.after_data ?? null,
					changed_by: log.changed_by,
					change_source: log.change_source ?? null,
					chat_session_id: log.chat_session_id ?? null
				}))
			)
			.select('id');

		if (error) {
			console.error('Error bulk logging project changes:', error);
			return {
				success: false,
				insertedCount: 0,
				errors: [error.message]
			};
		}

		return {
			success: true,
			insertedCount: data?.length ?? 0,
			errors: []
		};
	}

	/**
	 * Get activity logs for a project with pagination and filtering
	 *
	 * @param projectId - The project ID
	 * @param options - Query options for filtering and pagination
	 * @returns Paginated list of log entries
	 */
	async getProjectLogs(
		projectId: string,
		options: ProjectLogsQueryOptions = {}
	): Promise<ProjectLogsResponse> {
		const { limit = 50, offset = 0, entityType, action, startDate, endDate } = options;

		let query = this.supabase
			.from('onto_project_logs')
			.select('*', { count: 'exact' })
			.eq('project_id', projectId)
			.order('created_at', { ascending: false })
			.range(offset, offset + limit - 1);

		// Apply filters
		if (entityType) {
			query = query.eq('entity_type', entityType);
		}
		if (action) {
			query = query.eq('action', action);
		}
		if (startDate) {
			query = query.gte('created_at', startDate);
		}
		if (endDate) {
			query = query.lte('created_at', endDate);
		}

		const { data, error, count } = await query;

		if (error) {
			console.error('Error fetching project logs:', error);
			throw new Error(`Failed to fetch project logs: ${error.message}`);
		}

		const logs = (data ?? []) as ProjectLogEntry[];
		const total = count ?? 0;

		return {
			logs,
			total,
			hasMore: offset + logs.length < total
		};
	}

	/**
	 * Get the history of changes for a specific entity
	 *
	 * @param entityType - Type of the entity
	 * @param entityId - ID of the entity
	 * @returns All log entries for this entity, ordered by time
	 */
	async getEntityHistory(
		entityType: ProjectLogEntityType,
		entityId: string
	): Promise<ProjectLogEntry[]> {
		const { data, error } = await this.supabase
			.from('onto_project_logs')
			.select('*')
			.eq('entity_type', entityType)
			.eq('entity_id', entityId)
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Error fetching entity history:', error);
			throw new Error(`Failed to fetch entity history: ${error.message}`);
		}

		return (data ?? []) as ProjectLogEntry[];
	}

	/**
	 * Get recent activity across all projects for a user
	 *
	 * @param userId - The user ID
	 * @param limit - Maximum number of entries to return
	 * @returns Recent log entries across all user's projects
	 */
	async getUserRecentActivity(userId: string, limit: number = 20): Promise<ProjectLogEntry[]> {
		const { data, error } = await this.supabase
			.from('onto_project_logs')
			.select('*')
			.eq('changed_by', userId)
			.order('created_at', { ascending: false })
			.limit(limit);

		if (error) {
			console.error('Error fetching user activity:', error);
			throw new Error(`Failed to fetch user activity: ${error.message}`);
		}

		return (data ?? []) as ProjectLogEntry[];
	}

	/**
	 * Get logs from a specific chat session
	 *
	 * @param chatSessionId - The chat session ID
	 * @returns All log entries associated with this chat session
	 */
	async getChatSessionLogs(chatSessionId: string): Promise<ProjectLogEntry[]> {
		const { data, error } = await this.supabase
			.from('onto_project_logs')
			.select('*')
			.eq('chat_session_id', chatSessionId)
			.order('created_at', { ascending: true });

		if (error) {
			console.error('Error fetching chat session logs:', error);
			throw new Error(`Failed to fetch chat session logs: ${error.message}`);
		}

		return (data ?? []) as ProjectLogEntry[];
	}

	// ===========================================================================
	// Next Step Methods
	// ===========================================================================

	/**
	 * Update the next step for a project
	 *
	 * @param params - Next step update parameters
	 */
	async updateNextStep(params: UpdateNextStepParams): Promise<void> {
		const { projectId, nextStepShort, nextStepLong, source = 'ai' } = params;

		const { error } = await this.supabase
			.from('onto_projects')
			.update({
				next_step_short: nextStepShort,
				next_step_long: nextStepLong,
				next_step_updated_at: new Date().toISOString(),
				next_step_source: source,
				updated_at: new Date().toISOString()
			})
			.eq('id', projectId);

		if (error) {
			console.error('Error updating project next step:', error);
			throw new Error(`Failed to update next step: ${error.message}`);
		}
	}

	/**
	 * Get the current next step for a project
	 *
	 * @param projectId - The project ID
	 * @returns The project's next step data or null
	 */
	async getNextStep(projectId: string): Promise<ProjectNextStep | null> {
		const { data, error } = await this.supabase
			.from('onto_projects')
			.select('next_step_short, next_step_long, next_step_updated_at, next_step_source')
			.eq('id', projectId)
			.single();

		if (error) {
			console.error('Error fetching next step:', error);
			return null;
		}

		return data as ProjectNextStep;
	}

	/**
	 * Clear the next step for a project
	 *
	 * @param projectId - The project ID
	 */
	async clearNextStep(projectId: string): Promise<void> {
		const { error } = await this.supabase
			.from('onto_projects')
			.update({
				next_step_short: null,
				next_step_long: null,
				next_step_updated_at: null,
				next_step_source: null,
				updated_at: new Date().toISOString()
			})
			.eq('id', projectId);

		if (error) {
			console.error('Error clearing next step:', error);
			throw new Error(`Failed to clear next step: ${error.message}`);
		}
	}

	// ===========================================================================
	// Helper Methods
	// ===========================================================================

	/**
	 * Create a log entry for entity creation
	 * Convenience method that sets appropriate defaults
	 */
	async logCreate(
		projectId: string,
		entityType: ProjectLogEntityType,
		entityId: string,
		entityData: Record<string, unknown>,
		changedBy: string,
		changeSource?: ProjectLogChangeSource,
		chatSessionId?: string
	): Promise<string> {
		return this.logChange({
			projectId,
			entityType,
			entityId,
			action: 'created',
			beforeData: null,
			afterData: entityData,
			changedBy,
			changeSource,
			chatSessionId
		});
	}

	/**
	 * Create a log entry for entity update
	 * Convenience method that sets appropriate defaults
	 */
	async logUpdate(
		projectId: string,
		entityType: ProjectLogEntityType,
		entityId: string,
		beforeData: Record<string, unknown>,
		afterData: Record<string, unknown>,
		changedBy: string,
		changeSource?: ProjectLogChangeSource,
		chatSessionId?: string
	): Promise<string> {
		return this.logChange({
			projectId,
			entityType,
			entityId,
			action: 'updated',
			beforeData,
			afterData,
			changedBy,
			changeSource,
			chatSessionId
		});
	}

	/**
	 * Create a log entry for entity deletion
	 * Convenience method that sets appropriate defaults
	 */
	async logDelete(
		projectId: string,
		entityType: ProjectLogEntityType,
		entityId: string,
		entityData: Record<string, unknown>,
		changedBy: string,
		changeSource?: ProjectLogChangeSource,
		chatSessionId?: string
	): Promise<string> {
		return this.logChange({
			projectId,
			entityType,
			entityId,
			action: 'deleted',
			beforeData: entityData,
			afterData: null,
			changedBy,
			changeSource,
			chatSessionId
		});
	}

	/**
	 * Get summary statistics for project activity
	 *
	 * @param projectId - The project ID
	 * @param days - Number of days to look back (default 30)
	 * @returns Activity summary by entity type and action
	 */
	async getActivitySummary(
		projectId: string,
		days: number = 30
	): Promise<{
		totalChanges: number;
		byEntityType: Record<string, number>;
		byAction: Record<string, number>;
		recentContributors: string[];
	}> {
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - days);

		const { data, error } = await this.supabase
			.from('onto_project_logs')
			.select('entity_type, action, changed_by')
			.eq('project_id', projectId)
			.gte('created_at', startDate.toISOString());

		if (error) {
			console.error('Error fetching activity summary:', error);
			throw new Error(`Failed to fetch activity summary: ${error.message}`);
		}

		const logs = data ?? [];
		const byEntityType: Record<string, number> = {};
		const byAction: Record<string, number> = {};
		const contributorsSet = new Set<string>();

		for (const log of logs) {
			byEntityType[log.entity_type] = (byEntityType[log.entity_type] || 0) + 1;
			byAction[log.action] = (byAction[log.action] || 0) + 1;
			contributorsSet.add(log.changed_by);
		}

		return {
			totalChanges: logs.length,
			byEntityType,
			byAction,
			recentContributors: Array.from(contributorsSet)
		};
	}
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new ProjectActivityLogService instance
 *
 * @param supabase - Supabase client
 * @returns New service instance
 */
export function createProjectActivityLogService(
	supabase: SupabaseClient<Database>
): ProjectActivityLogService {
	return new ProjectActivityLogService(supabase);
}
