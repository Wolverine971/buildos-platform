// apps/web/src/lib/utils/operations/operations-executor.ts
import { ActivityLogger } from '../activityLogger';
import type { ActivityType } from '../activityLogger';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type {
	ParsedOperation,
	TableName,
	ExecutionResult,
	BrainDumpParseResult
} from '$lib/types/brain-dump';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { OperationValidator } from './operation-validator';
import { ReferenceResolver } from './reference-resolver';
import { generateSlug } from './validation-utils';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { BrainDumpStatusService } from '$lib/services/braindump-status.service';
import { validateTaskDateAgainstProject } from '../dateValidation';
import { normalizeMarkdownHeadings } from '../markdown-nesting';
import { seedProjectNextSteps } from '$lib/services/next-step-seeding.service';
import { TaskEventSyncService } from '$lib/services/ontology/task-event-sync.service';

export class OperationsExecutor {
	private supabase: SupabaseClient<Database>;
	private activityLogger: ActivityLogger;
	private errorLogger: ErrorLoggerService;
	private statusService: BrainDumpStatusService;
	private validator: OperationValidator;
	private referenceResolver: ReferenceResolver;
	private llmService: SmartLLMService | null = null;
	private completedBrainDumpIds = new Set<string>();
	private newProjectId: string | null = null; // Track newly created project ID
	private currentActorId: string | null = null;

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
		this.activityLogger = new ActivityLogger(supabase);
		this.errorLogger = ErrorLoggerService.getInstance(supabase);
		this.statusService = new BrainDumpStatusService(supabase);
		this.validator = new OperationValidator();
		this.referenceResolver = new ReferenceResolver(supabase);
	}

	private async resolveActorId(userId: string): Promise<string> {
		const { data: actorId, error } = await this.supabase.rpc('ensure_actor_for_user', {
			p_user_id: userId
		});
		if (error || !actorId) {
			throw new Error(
				`Failed to resolve actor for operations: ${error?.message || 'unknown error'}`
			);
		}
		return actorId;
	}

	private getTargetTable(table: TableName): string {
		if (table === 'projects') return 'onto_projects';
		if (table === 'tasks') return 'onto_tasks';
		return table;
	}

	private requireActorId(): string {
		if (!this.currentActorId) {
			throw new Error('Missing actor ID for ontology operation');
		}
		return this.currentActorId;
	}

	private mapConditionField(table: TableName, field: string): string {
		if (table === 'projects') {
			if (field === 'status') return 'state_key';
			if (field === 'start_date') return 'start_at';
			if (field === 'end_date') return 'end_at';
			if (field === 'user_id') return 'created_by';
		}

		if (table === 'tasks') {
			if (field === 'status') return 'state_key';
			if (field === 'start_date') return 'start_at';
			if (field === 'due_date') return 'due_at';
			if (field === 'user_id') return 'created_by';
		}

		return field;
	}

	private mapConditionValue(table: TableName, field: string, value: unknown): unknown {
		if ((table === 'projects' || table === 'tasks') && field === 'user_id') {
			return this.requireActorId();
		}

		if (table === 'projects' && field === 'status') {
			return this.mapProjectStatusToState(typeof value === 'string' ? value : null);
		}

		if (table === 'tasks' && field === 'status') {
			return this.mapTaskStatusToState(typeof value === 'string' ? value : null);
		}

		if (table === 'tasks' && field === 'priority') {
			return this.mapTaskPriority(value);
		}

		return value;
	}

	private applyOwnerFilter(query: any, table: TableName, userId: string): any {
		if (table === 'projects' || table === 'tasks') {
			return query.eq('created_by', this.requireActorId());
		}
		return query.eq('user_id', userId);
	}

	private mapProjectStatusToState(
		status: string | null | undefined
	): 'planning' | 'active' | 'completed' | 'cancelled' {
		switch (status) {
			case 'completed':
				return 'completed';
			case 'archived':
				return 'cancelled';
			case 'paused':
				return 'planning';
			case 'active':
			default:
				return 'active';
		}
	}

	private mapTaskStatusToState(
		status: string | null | undefined
	): 'todo' | 'in_progress' | 'done' | 'blocked' {
		switch (status) {
			case 'in_progress':
				return 'in_progress';
			case 'done':
				return 'done';
			case 'blocked':
				return 'blocked';
			case 'backlog':
			default:
				return 'todo';
		}
	}

	private mapTaskPriority(priority: unknown): number {
		if (typeof priority === 'number' && Number.isFinite(priority)) {
			return Math.max(1, Math.min(5, Math.round(priority)));
		}

		if (typeof priority === 'string') {
			switch (priority.toLowerCase()) {
				case 'high':
				case 'critical':
				case 'urgent':
					return 5;
				case 'medium':
					return 3;
				case 'low':
					return 1;
				default:
					return 3;
			}
		}

		return 3;
	}

	private async mapCreateData(
		table: TableName,
		data: Record<string, any>
	): Promise<Record<string, any>> {
		if (table === 'projects') {
			const actorId = this.requireActorId();

			const props: Record<string, unknown> = {
				slug: data.slug,
				context: data.context ?? null,
				executive_summary: data.executive_summary ?? null,
				tags: Array.isArray(data.tags) ? data.tags : [],
				core_context_descriptions: data.core_context_descriptions ?? null,
				core_goals_momentum: data.core_goals_momentum ?? null,
				core_harmony_integration: data.core_harmony_integration ?? null,
				core_integrity_ideals: data.core_integrity_ideals ?? null,
				core_meaning_identity: data.core_meaning_identity ?? null,
				core_opportunity_freedom: data.core_opportunity_freedom ?? null,
				core_people_bonds: data.core_people_bonds ?? null,
				core_power_resources: data.core_power_resources ?? null,
				core_reality_understanding: data.core_reality_understanding ?? null,
				core_trust_safeguards: data.core_trust_safeguards ?? null,
				calendar_color_id: data.calendar_color_id ?? null,
				calendar_settings: data.calendar_settings ?? null,
				calendar_sync_enabled: data.calendar_sync_enabled ?? null,
				source: data.source ?? null,
				source_metadata: data.source_metadata ?? null
			};

			return {
				name: data.name,
				description: data.description ?? null,
				state_key: this.mapProjectStatusToState(data.status),
				start_at: data.start_date ?? null,
				end_at: data.end_date ?? null,
				type_key: typeof data.type_key === 'string' ? data.type_key : 'project.generic',
				props,
				created_by: actorId
			};
		}

		if (table === 'tasks') {
			const actorId = this.requireActorId();

			if (!data.project_id) {
				throw new Error('Task creation requires project_id');
			}

			const props: Record<string, unknown> = {
				details: data.details ?? null,
				task_type: data.task_type ?? 'one_off',
				duration_minutes: data.duration_minutes ?? null,
				recurrence_pattern: data.recurrence_pattern ?? null,
				recurrence_ends: data.recurrence_ends ?? null,
				recurrence_end_source: data.recurrence_end_source ?? null,
				dependencies: data.dependencies ?? null,
				parent_task_id: data.parent_task_id ?? null,
				task_steps: data.task_steps ?? null,
				source: data.source ?? null,
				source_calendar_event_id: data.source_calendar_event_id ?? null
			};

			return {
				project_id: data.project_id,
				title: data.title,
				description: data.description ?? null,
				state_key: this.mapTaskStatusToState(data.status),
				priority: this.mapTaskPriority(data.priority),
				start_at: data.start_date ?? null,
				due_at: data.due_date ?? data.start_date ?? null,
				type_key:
					typeof data.type_key === 'string'
						? data.type_key
						: data.task_type === 'recurring'
							? 'task.routine'
							: 'task.execute',
				props,
				created_by: actorId
			};
		}

		return data;
	}

	private async mapUpdateData(
		table: TableName,
		data: Record<string, any>,
		conditions: Record<string, any> | undefined
	): Promise<Record<string, any>> {
		if (table === 'projects') {
			const update: Record<string, any> = {};
			if (data.name !== undefined) update.name = data.name;
			if (data.description !== undefined) update.description = data.description ?? null;
			if (data.status !== undefined)
				update.state_key = this.mapProjectStatusToState(data.status);
			if (data.start_date !== undefined) update.start_at = data.start_date ?? null;
			if (data.end_date !== undefined) update.end_at = data.end_date ?? null;

			const propPatch: Record<string, unknown> = {};
			const propFields = [
				'slug',
				'context',
				'executive_summary',
				'tags',
				'core_context_descriptions',
				'core_goals_momentum',
				'core_harmony_integration',
				'core_integrity_ideals',
				'core_meaning_identity',
				'core_opportunity_freedom',
				'core_people_bonds',
				'core_power_resources',
				'core_reality_understanding',
				'core_trust_safeguards',
				'calendar_color_id',
				'calendar_settings',
				'calendar_sync_enabled',
				'source',
				'source_metadata'
			];

			for (const field of propFields) {
				if (data[field] !== undefined) {
					propPatch[field] = data[field];
				}
			}

			if (Object.keys(propPatch).length > 0 && conditions?.id) {
				const actorId = this.requireActorId();
				const { data: existingProject } = await this.supabase
					.from('onto_projects')
					.select('props')
					.eq('id', conditions.id)
					.eq('created_by', actorId)
					.maybeSingle();

				const existingProps =
					(existingProject?.props as Record<string, unknown> | null) ?? {};
				update.props = {
					...existingProps,
					...propPatch
				};
			}

			return update;
		}

		if (table === 'tasks') {
			const update: Record<string, any> = {};
			if (data.title !== undefined) update.title = data.title;
			if (data.description !== undefined) update.description = data.description ?? null;
			if (data.status !== undefined)
				update.state_key = this.mapTaskStatusToState(data.status);
			if (data.priority !== undefined) update.priority = this.mapTaskPriority(data.priority);
			if (data.start_date !== undefined) {
				update.start_at = data.start_date ?? null;
				if (data.due_date === undefined) {
					update.due_at = data.start_date ?? null;
				}
			}
			if (data.due_date !== undefined) {
				update.due_at = data.due_date ?? null;
			}

			const propPatch: Record<string, unknown> = {};
			const propFields = [
				'details',
				'task_type',
				'duration_minutes',
				'recurrence_pattern',
				'recurrence_ends',
				'recurrence_end_source',
				'dependencies',
				'parent_task_id',
				'task_steps',
				'source',
				'source_calendar_event_id'
			];

			for (const field of propFields) {
				if (data[field] !== undefined) {
					propPatch[field] = data[field];
				}
			}

			if (Object.keys(propPatch).length > 0 && conditions?.id) {
				const actorId = this.requireActorId();
				const { data: existingTask } = await this.supabase
					.from('onto_tasks')
					.select('props')
					.eq('id', conditions.id)
					.eq('created_by', actorId)
					.maybeSingle();

				const existingProps = (existingTask?.props as Record<string, unknown> | null) ?? {};
				update.props = {
					...existingProps,
					...propPatch
				};
			}

			return update;
		}

		return data;
	}

	/**
	 * Execute parsed operations from brain dump
	 */
	async executeOperations({
		operations,
		userId,
		brainDumpId,
		projectQuestions
	}: {
		operations: ParsedOperation[];
		userId: string;
		brainDumpId?: string;
		projectQuestions?: BrainDumpParseResult['projectQuestions'];
	}): Promise<ExecutionResult> {
		// Handle both old and new signatures for backward compatibility
		const successful: ParsedOperation[] = [];
		const failed: Array<ParsedOperation & { error: string }> = [];
		const results: any[] = [];
		const rollbackStack: Array<{ operation: ParsedOperation; result: any }> = [];

		try {
			// Reset state for new execution
			this.newProjectId = null;
			this.currentActorId = await this.resolveActorId(userId);

			// Filter enabled operations and sort by dependency order
			const enabledOperations = operations.filter((op) => op.enabled !== false);
			const sortedOperations = this.sortOperationsByDependency(enabledOperations);

			// Check if we're creating a new project
			const projectCreationOp = sortedOperations.find(
				(op) => op.operation === 'create' && op.table === 'projects'
			);
			const hasProjectCreation = !!projectCreationOp;

			// For new project creation, we'll resolve references after the project is created
			// For existing projects, resolve references normally
			let operationsToExecute: ParsedOperation[] = sortedOperations;

			if (!hasProjectCreation) {
				// For existing projects, resolve references normally
				operationsToExecute = await this.referenceResolver.resolveReferences(
					sortedOperations,
					userId
				);
			}

			// Execute operations sequentially with rollback support
			for (const operation of operationsToExecute) {
				try {
					const result = await this.executeOperation(operation, userId, brainDumpId);
					const successfulOperation: ParsedOperation = {
						...operation,
						result
					};
					successful.push(successfulOperation);

					// Add to rollback stack for potential rollback
					rollbackStack.push({ operation, result });

					// Store result with metadata
					if (result && result.id) {
						results.push({
							...result,
							table: operation.table,
							operationType: operation.operation
						});
					}
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : 'Unknown error';

					console.error(
						`Operation failed: ${errorMessage}. Rolling back ${rollbackStack.length} successful operations...`
					);

					// Log the operation failure
					await this.errorLogger.logDatabaseError(
						error,
						operation.operation,
						operation.table,
						operation.data?.id,
						operation.data
					);

					// ROLLBACK: Reverse all successful operations
					await this.rollbackOperations(rollbackStack, userId);

					// Record the failed operation
					failed.push({
						...operation,
						error: errorMessage
					});

					// Throw error to stop execution completely
					throw new Error(
						`Operation failed and changes were rolled back: ${errorMessage}. Failed operation: ${operation.table} ${operation.operation}`
					);
				}
			}

			// Log activity
			await this.logExecutionActivity({
				results: { successful, failed, results },
				brainDumpId,
				userId
			});

			// Save project questions silently after all operations
			if (projectQuestions && projectQuestions.length > 0 && this.newProjectId) {
				await this.saveProjectQuestions({
					projectQuestions,
					projectId: this.newProjectId,
					brainDumpId,
					userId
				});
			} else if (projectQuestions && projectQuestions.length > 0) {
				// Try to find project ID from operations
				const projectId =
					operations.find((op) => op.table === 'projects' && op.data?.id)?.data?.id ||
					operations.find((op) => op.data?.project_id)?.data?.project_id;
				if (projectId) {
					await this.saveProjectQuestions({
						projectQuestions,
						projectId,
						brainDumpId,
						userId
					});
				}
			}

			// Create brain dump links to track what was created from this brain dump
			if (brainDumpId && successful.length > 0) {
				await this.createBrainDumpLinks(brainDumpId, successful);
			}
		} catch (error) {
			console.error('Fatal error during execution:', error);
			throw error;
		} finally {
			this.currentActorId = null;
		}

		return { successful, failed, results };
	}

	/**
	 * Execute a single operation
	 */
	private async executeOperation(
		operation: ParsedOperation,
		userId: string,
		brainDumpId?: string
	): Promise<any> {
		// Validate operation
		const validation = this.validator.validateOperation(operation);
		if (!validation.isValid) {
			throw new Error(validation.error || 'Validation failed');
		}

		// Add metadata
		const dataWithMetadata = {
			...validation.sanitizedData,
			user_id: userId
		};

		// Resolve any remaining references using the operation cache
		this.resolveOperationReferences(dataWithMetadata);

		// Handle by operation type
		switch (operation.operation) {
			case 'create':
				return this.handleCreateOperation(operation, dataWithMetadata, userId, brainDumpId);
			case 'update':
				return this.handleUpdateOperation(operation, dataWithMetadata, userId);
			case 'delete':
				return this.handleDeleteOperation(operation, userId);
			default:
				throw new Error(`Unsupported operation type: ${operation.operation}`);
		}
	}

	/**
	 * Rollback operations in reverse order
	 */
	private async rollbackOperations(
		rollbackStack: Array<{ operation: ParsedOperation; result: any }>,
		userId: string
	): Promise<void> {
		console.log(`Starting rollback of ${rollbackStack.length} operations...`);

		// Reverse the stack so we undo in reverse order (LIFO)
		const reversedStack = [...rollbackStack].reverse();

		for (const { operation, result } of reversedStack) {
			try {
				// Only rollback create operations (delete what was created)
				// Update and delete operations are not rolled back as they're harder to reverse
				if (operation.operation === 'create' && result?.id) {
					console.log(
						`Rolling back ${operation.table} create operation (id: ${result.id})`
					);

					const targetTable = this.getTargetTable(operation.table);
					let query = this.supabase
						.from(targetTable as any)
						.delete()
						.eq('id', result.id);
					query = this.applyOwnerFilter(query, operation.table, userId);
					const { error } = await query;

					if (error) {
						console.error(
							`Failed to rollback ${operation.table} (id: ${result.id}):`,
							error
						);
						// Continue rolling back other operations even if one fails
					} else {
						console.log(
							`Successfully rolled back ${operation.table} (id: ${result.id})`
						);
					}
				}
			} catch (error) {
				console.error(`Error during rollback of ${operation.table}:`, error);
				// Continue with other rollbacks
			}
		}

		console.log('Rollback complete');
	}

	/**
	 * Resolve operation references and clean up metadata
	 */
	private resolveOperationReferences(data: Record<string, any>): void {
		// Handle project_ref -> project_id resolution for new projects
		if (data.project_ref) {
			const refValue = data.project_ref; // Store for logging
			if (this.newProjectId) {
				// Replace project_ref with actual project_id
				data.project_id = this.newProjectId;
				delete data.project_ref;
				console.log(
					`Resolved project_ref '${refValue}' to project_id '${this.newProjectId}'`
				);
			} else {
				// Log error but still remove project_ref to prevent database errors
				console.error(
					`Warning: project_ref '${refValue}' found but no newProjectId available. Removing project_ref to prevent database errors.`
				);
				delete data.project_ref;
			}
		}

		// Handle metadata-based resolution
		if (data._needs_ref_resolution && data._ref_field && data._id_field) {
			const refField = data._ref_field;
			const idField = data._id_field;

			// If we have a new project ID and this is a project reference
			if (idField === 'project_id' && this.newProjectId) {
				data[idField] = this.newProjectId;
				delete data[refField]; // Remove the ref field
			}

			// Always clean up metadata fields
			delete data._needs_ref_resolution;
			delete data._ref_field;
			delete data._id_field;
		}

		// Handle parent task references - these would need separate tracking
		if (data._parent_ref_field && data._parent_id_field) {
			// For now, just clean up the metadata
			delete data._parent_ref_field;
			delete data._parent_id_field;
		}

		// Clean up any other metadata fields that shouldn't go to the database
		this.cleanupMetadataFields(data);
	}

	/**
	 * Remove any metadata fields that shouldn't be sent to the database
	 */
	private cleanupMetadataFields(data: Record<string, any>): void {
		// Remove any fields that start with underscore (internal metadata)
		const keysToDelete = Object.keys(data).filter((key) => key.startsWith('_'));
		keysToDelete.forEach((key) => {
			delete data[key];
		});
	}

	/**
	 * Validate task dates against project timeline
	 */
	private async validateTaskDates(taskData: Record<string, any>): Promise<void> {
		if (!taskData.start_date) {
			return; // No date to validate
		}

		const actorId = this.requireActorId();

		// Get project info if we have project_id or if this is a new project
		let projectStartDate: string | null = null;
		let projectEndDate: string | null = null;

		if (taskData.project_id) {
			// Get existing project
			const { data: project, error } = await this.supabase
				.from('onto_projects')
				.select('start_at, end_at')
				.eq('id', taskData.project_id)
				.eq('created_by', actorId)
				.single();

			if (project && !error) {
				projectStartDate = project.start_at;
				projectEndDate = project.end_at;
			}
		} else if (this.newProjectId) {
			// Use the newly created project ID
			const { data: project, error } = await this.supabase
				.from('onto_projects')
				.select('start_at, end_at')
				.eq('id', this.newProjectId)
				.eq('created_by', actorId)
				.single();

			if (project && !error) {
				projectStartDate = project.start_at;
				projectEndDate = project.end_at;
			}
		}

		// Validate the task date
		const validation = validateTaskDateAgainstProject(
			taskData.start_date,
			projectStartDate,
			projectEndDate
		);

		if (!validation.isValid) {
			console.warn(`Task date validation failed: ${validation.error}`);

			// Auto-fix the task date to be the project start date or today, whichever is later
			const today = new Date().toISOString().split('T')[0] as string;
			const correctedDate =
				projectStartDate && projectStartDate > today ? projectStartDate : today;

			console.log(
				`Correcting task start_date from ${taskData.start_date} to ${correctedDate}`
			);
			taskData.start_date = correctedDate;
		}
	}

	/**
	 * Handle create operation
	 */
	private async handleCreateOperation(
		operation: ParsedOperation,
		data: Record<string, any>,
		userId: string,
		brainDumpId?: string
	): Promise<any> {
		// Special handling for projects
		if (operation.table === 'projects') {
			// Generate slug if name provided
			if (data.name && !data.slug) {
				data.slug = generateSlug(data.name);
			}

			// Normalize context headings if provided
			if (data.context) {
				// Normalize markdown headings in the context to prevent heading inflation
				// The LLM might return content starting with ### or #### headings
				// We normalize them to start at ## level
				data.context = normalizeMarkdownHeadings(data.context, 2);
				console.log('Normalized new project context headings to start at ## level');
			}

			// Set defaults
			data.status = data.status || 'active';
			// Note: projects table doesn't have priority column, so don't set it
		}

		// Special handling for tasks
		if (operation.table === 'tasks') {
			data.status = data.status || 'backlog';
			data.priority = data.priority || 'medium';

			// Handle recurring tasks
			if (data.task_type === 'recurring' && !data.recurrence_pattern) {
				// Default to weekly if not specified
				data.recurrence_pattern = 'weekly';
			}

			// Ensure task_type is set
			if (!data.task_type) {
				data.task_type = 'one_off';
			}

			// Ensure we have a project_id for the task
			if (!data.project_id && this.newProjectId) {
				console.log(
					`Setting project_id for task to newly created project: ${this.newProjectId}`
				);
				data.project_id = this.newProjectId;
			}

			// Validate task date against project timeline
			await this.validateTaskDates(data);
		}

		const targetTable = this.getTargetTable(operation.table);
		const insertData = await this.mapCreateData(operation.table, data);

		// Execute insert
		const { data: result, error } = await this.supabase
			.from(targetTable as any)
			.insert(insertData)
			.select()
			.single();

		if (error) {
			throw new Error(`Failed to create ${operation.table}: ${error.message}`);
		}

		const createdRecord = result as any;

		// Track newly created project ID
		if (operation.table === 'projects' && createdRecord && 'id' in createdRecord) {
			this.newProjectId = createdRecord.id;
		}

		// Handle post-creation actions
		if (operation.table === 'projects' && createdRecord && brainDumpId) {
			// 	await this.handleProjectPostCreation(result, brainDumpId);
			if (!this.completedBrainDumpIds.has(brainDumpId)) {
				await this.markBrainDumpAsCompleted(brainDumpId, createdRecord.id);
				this.completedBrainDumpIds.add(brainDumpId);
			}

			// Seed initial next steps for the new project (non-blocking)
			seedProjectNextSteps(this.supabase, {
				projectId: createdRecord.id,
				userId,
				projectData: {
					name: insertData.name ?? data.name,
					description: insertData.description ?? data.description,
					context: data.context
				}
			}).catch((err) => {
				console.warn('Failed to seed next steps (non-fatal):', err);
			});
		}

		if (operation.table === 'tasks' && typeof createdRecord?.id === 'string') {
			this.syncOntologyTaskEvents(createdRecord.id, userId).catch((syncError) => {
				console.error('Failed to sync ontology task events after create:', syncError);
			});
		}

		return result;
	}

	/**
	 * Handle update operation
	 */
	private async handleUpdateOperation(
		operation: ParsedOperation,
		data: Record<string, any>,
		userId: string
	): Promise<any> {
		// Extract id from data if conditions not provided (backward compatibility)
		let conditions = operation.conditions;

		if (!conditions && data.id) {
			// Create conditions from the id in data field
			conditions = { id: data.id };
			// Remove id and user_id from data to avoid trying to update primary key or user_id
			const { id: _id, user_id: _userId, ...updateData } = data;
			data = updateData;
		}

		// Check for conditions
		if (!conditions) {
			const error = new Error('Update operation requires conditions or an id in data');
			await this.errorLogger.logDatabaseError(
				error,
				'update',
				operation.table,
				operation.data?.id,
				operation.data
			);
			throw error;
		}

		// Normalize project context if updating projects
		if (operation.table === 'projects' && data.context) {
			// Normalize markdown headings in the context to prevent heading inflation
			// The LLM might return content starting with ### or #### headings
			// We normalize them to start at ## level
			data.context = normalizeMarkdownHeadings(data.context, 2);
			console.log('Normalized project context headings to start at ## level');
		}

		const targetTable = this.getTargetTable(operation.table);
		const updateData = await this.mapUpdateData(operation.table, data, conditions);
		let query = this.supabase.from(targetTable as any).update(updateData);

		// Apply conditions
		for (const [field, value] of Object.entries(conditions)) {
			const mappedField = this.mapConditionField(operation.table, field);
			const mappedValue = this.mapConditionValue(operation.table, field, value);
			query = query.eq(mappedField, mappedValue);
		}

		// Add owner filter for security and execute
		query = this.applyOwnerFilter(query, operation.table, userId);
		const { data: result, error } = await query.select();

		if (error) {
			throw new Error(`Failed to update ${operation.table}: ${error.message}`);
		}

		if (operation.table === 'tasks') {
			const conditionTaskId = typeof conditions.id === 'string' ? conditions.id : null;
			const updatedRecords = Array.isArray(result) ? (result as any[]) : [];
			const resultTaskId =
				updatedRecords.length > 0 && typeof updatedRecords[0]?.id === 'string'
					? updatedRecords[0].id
					: null;
			const taskId = conditionTaskId ?? resultTaskId;

			if (taskId) {
				this.syncOntologyTaskEvents(taskId, userId).catch((syncError) => {
					console.error('Failed to sync ontology task events after update:', syncError);
				});
			}
		}

		return result;
	}

	/**
	 * Handle delete operation
	 */
	private async handleDeleteOperation(operation: ParsedOperation, userId: string): Promise<any> {
		// Get validated data
		const validation = this.validator.validateOperation(operation);
		if (!validation.isValid) {
			throw new Error(validation.error || 'Validation failed');
		}

		const data = validation.sanitizedData || operation.data;
		const targetTable = this.getTargetTable(operation.table);

		// Build delete query
		let query = this.supabase.from(targetTable as any).delete();

		// Apply conditions from data
		if (data.id) {
			query = query.eq('id', data.id);
		} else if (operation.searchQuery) {
			// Handle search-based deletion - use ilike for title search
			query = query.ilike('title', `%${operation.searchQuery}%`);
		} else {
			// Use all data fields as conditions
			for (const [field, value] of Object.entries(data)) {
				const mappedField = this.mapConditionField(operation.table, field);
				const mappedValue = this.mapConditionValue(operation.table, field, value);
				query = query.eq(mappedField, mappedValue);
			}
		}

		// Add owner filter for security
		query = this.applyOwnerFilter(query, operation.table, userId);

		// Execute delete
		const { data: result, error } = await query.select();

		if (error) {
			throw new Error(`Failed to delete from ${operation.table}: ${error.message}`);
		}

		return result;
	}

	/**
	 * Mark brain dump as completed
	 */
	private async markBrainDumpAsCompleted(brainDumpId: string, projectId: string): Promise<void> {
		try {
			// Note: We're not using statusService.updateToSaved here because this is a simple
			// status update without full metadata. The full update happens elsewhere.
			await this.supabase
				.from('brain_dumps')
				.update({
					status: 'saved' as const,
					project_id: projectId
				})
				.eq('id', brainDumpId);
		} catch (error) {
			console.error('Failed to mark brain dump as completed:', error);
		}
	}

	/**
	 * Sort operations by dependency order
	 */
	private sortOperationsByDependency(operations: ParsedOperation[]): ParsedOperation[] {
		// Simple dependency ordering: projects -> tasks -> others
		const priority: Partial<Record<TableName, number>> = {
			projects: 1,
			tasks: 2,
			notes: 3,
			project_context: 3,
			project_notes: 3,
			brain_dumps: 4,
			daily_briefs: 4,
			project_questions: 4
		};

		return [...operations].sort((a, b) => {
			const aPriority = priority[a.table] || 10;
			const bPriority = priority[b.table] || 10;
			return aPriority - bPriority;
		});
	}

	/**
	 * Save project questions silently after operations
	 */
	private async saveProjectQuestions({
		projectQuestions,
		projectId,
		brainDumpId,
		userId
	}: {
		projectQuestions: BrainDumpParseResult['projectQuestions'];
		projectId: string;
		brainDumpId?: string;
		userId: string;
	}): Promise<void> {
		try {
			// Format questions for storage (max 5)
			const questionsToStore = projectQuestions?.slice(0, 5).map((q) => ({
				user_id: userId,
				project_id: projectId,
				question: q.question,
				category: q.category || 'clarification',
				priority: q.priority || 'medium',
				context: q.context || null,
				expected_outcome: q.expectedOutcome || null,
				source: 'braindump_analysis',
				source_field: brainDumpId,
				triggers: {
					braindump_mention: q.triggers?.braindumpMention || null,
					gap_identified: q.triggers?.gapIdentified || null,
					project_state: q.triggers?.projectState || null
				},
				status: 'active',
				shown_to_user_count: 0
			}));

			// Store questions in database
			if (questionsToStore && questionsToStore.length > 0) {
				const { data: insertedQuestions, error } = await this.supabase
					.from('project_questions')
					.insert(questionsToStore)
					.select();

				if (error) {
					console.error('Failed to insert generated questions:', error);
				} else {
					console.log(
						`Stored ${insertedQuestions?.length || 0} new questions for project ${projectId}`
					);
				}
			}
		} catch (error) {
			console.error('Error storing generated questions:', error);
			// Don't throw - question storage is non-critical
		}
	}

	/**
	 * Create brain dump links to track entities created from a brain dump
	 */
	private async createBrainDumpLinks(
		brainDumpId: string,
		operations: ParsedOperation[]
	): Promise<void> {
		try {
			const links: any[] = [];

			for (const op of operations) {
				// Skip if no result (operation failed) or no relevant IDs
				if (!op.result) continue;

				const link: any = {
					brain_dump_id: brainDumpId,
					created_at: new Date().toISOString()
				};

				// Determine what was created based on table
				switch (op.table) {
					case 'projects':
						link.project_id = op.result.id;
						break;
					case 'tasks':
						link.task_id = op.result.id;
						link.project_id = op.result.project_id || op.data?.project_id;
						break;
					case 'notes':
						link.note_id = op.result.id;
						link.project_id = op.result.project_id || op.data?.project_id;
						break;
					default:
						// Skip other tables
						continue;
				}

				// Only add if we have at least one entity ID
				if (link.project_id || link.task_id || link.note_id) {
					links.push(link);
				}
			}

			// Insert all links in one batch
			if (links.length > 0) {
				const { error } = await this.supabase.from('brain_dump_links').insert(links);

				if (error) {
					console.error('Failed to create brain dump links:', error);
				} else {
					console.log(
						`Created ${links.length} brain dump links for brain dump ${brainDumpId}`
					);
				}
			}
		} catch (error) {
			console.error('Error creating brain dump links:', error);
			// Don't throw - link creation is non-critical
		}
	}

	/**
	 * Log execution activity
	 */
	private async logExecutionActivity({
		results,
		brainDumpId,
		userId
	}: {
		results: ExecutionResult;
		brainDumpId?: string;
		userId: string;
	}): Promise<void> {
		const summary = {
			successful: results.successful.length,
			failed: results.failed.length,
			results: results.results?.length || 0
		};

		// Get user ID from the first successful or failed operation

		await this.activityLogger.logActivity(userId, 'brain_dump_executed' as ActivityType, {
			brain_dump_id: brainDumpId,
			...summary
		});
	}

	/**
	 * Save brain dump with initial processing
	 */
	async saveBrainDump(
		title: string,
		content: string,
		userId: string,
		projectId?: string | null,
		metadata?: Record<string, any>
	): Promise<{
		id: string;
		title: string;
		content: string;
		processing_status: string;
		created_at: string;
		user_id: string;
		project_id: string | null;
	}> {
		// Create brain dump record
		// Note: metadata is passed but stored in ai_insights for now
		const { data: brainDump, error } = await this.supabase
			.from('brain_dumps')
			.insert({
				title,
				content,
				user_id: userId,
				project_id: projectId,
				status: 'pending' as const,
				ai_insights: metadata ? JSON.stringify(metadata) : null
			})
			.select()
			.single();

		if (error || !brainDump) {
			const saveError = new Error(
				`Failed to save brain dump: ${error?.message || 'Unknown error'}`
			);
			await this.errorLogger.logDatabaseError(
				error || saveError,
				'insert',
				'brain_dumps',
				undefined,
				{
					title,
					content: content?.substring(0, 1000), // Log first 1000 chars only
					user_id: userId,
					project_id: projectId,
					metadata
				}
			);
			throw saveError;
		}

		// Process in background
		this.processBrainDumpInBackground(brainDump.id, content, userId);

		return {
			id: brainDump.id,
			title: brainDump.title || 'Untitled Brain Dump',
			content: brainDump.content || '',
			processing_status: brainDump.status as any,
			created_at: brainDump.created_at,
			user_id: brainDump.user_id,
			project_id: brainDump.project_id
		};
	}

	/**
	 * Process brain dump in background (now synchronous)
	 */
	private async processBrainDumpInBackground(
		brainDumpId: string,
		content: string,
		userId: string
	): Promise<void> {
		try {
			// Update status to processing using the service
			await this.statusService.updateToParsed(brainDumpId, userId, {
				title: 'Processing brain dump',
				operations: [],
				summary: 'Extracting key information...',
				insights: '',
				tags: [],
				metadata: {
					totalOperations: 0,
					tableBreakdown: {},
					processingTime: 0,
					timestamp: new Date().toISOString()
				}
			});

			// Process with LLM (simplified for now)
			if (!this.llmService) {
				// Use provided API key or try to get from environment

				this.llmService = new SmartLLMService({
					httpReferer: 'https://buildos.dev',
					appName: 'BuildOS Operations',
					supabase: this.supabase
				});
			}

			const processedContent = await this.llmService.generateText({
				prompt: `Extract key information from: ${content}`,
				userId,
				profile: 'speed',
				systemPrompt: 'You are a helpful assistant that extracts key information.',
				temperature: 0.7
			});

			// Update with processed content using direct update since this is a simple AI summary update
			// The full status update with metadata happens elsewhere
			await this.supabase
				.from('brain_dumps')
				.update({
					ai_summary: processedContent,
					status: 'saved' as const
				})
				.eq('id', brainDumpId);

			// Note: Data invalidation should be handled on the client side
		} catch (error) {
			console.error('Failed to process brain dump:', error);

			// Update status to failed using the service
			await this.statusService.markAsFailed(brainDumpId, userId, error);
		}
	}

	/**
	 * Sync ontology-backed task events after task create/update operations.
	 */
	private async syncOntologyTaskEvents(taskId: string, userId: string): Promise<void> {
		const actorId = this.requireActorId();
		const { data: task, error } = await this.supabase
			.from('onto_tasks')
			.select('*')
			.eq('id', taskId)
			.eq('created_by', actorId)
			.is('deleted_at', null)
			.maybeSingle();

		if (error) {
			throw new Error(`Failed to load task for event sync: ${error.message}`);
		}

		if (!task) {
			return;
		}

		const taskEventSync = new TaskEventSyncService(this.supabase);
		await taskEventSync.syncTaskEvents(userId, actorId, task);
	}
}
