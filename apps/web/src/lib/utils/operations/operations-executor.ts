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
import { CalendarService } from '$lib/services/calendar-service';
import { normalizeMarkdownHeadings } from '../markdown-nesting';

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
	private calendarService: CalendarService;

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
		this.activityLogger = new ActivityLogger(supabase);
		this.errorLogger = ErrorLoggerService.getInstance(supabase);
		this.statusService = new BrainDumpStatusService(supabase);
		this.validator = new OperationValidator();
		this.referenceResolver = new ReferenceResolver(supabase);
		this.calendarService = new CalendarService(supabase);
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
				await this.createBrainDumpLinks(brainDumpId, successful, userId);
			}
		} catch (error) {
			console.error('Fatal error during execution:', error);
			throw error;
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

					const { error } = await this.supabase
						.from(operation.table as any)
						.delete()
						.eq('id', result.id)
						.eq('user_id', userId); // Ensure we only delete user's own data

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
	private async validateTaskDates(taskData: Record<string, any>, userId: string): Promise<void> {
		if (!taskData.start_date) {
			return; // No date to validate
		}

		// Get project info if we have project_id or if this is a new project
		let projectStartDate: string | null = null;
		let projectEndDate: string | null = null;

		if (taskData.project_id) {
			// Get existing project
			const { data: project, error } = await this.supabase
				.from('projects')
				.select('start_date, end_date')
				.eq('id', taskData.project_id)
				.eq('user_id', userId)
				.single();

			if (project && !error) {
				projectStartDate = project.start_date;
				projectEndDate = project.end_date;
			}
		} else if (this.newProjectId) {
			// Use the newly created project ID
			const { data: project, error } = await this.supabase
				.from('projects')
				.select('start_date, end_date')
				.eq('id', this.newProjectId)
				.eq('user_id', userId)
				.single();

			if (project && !error) {
				projectStartDate = project.start_date;
				projectEndDate = project.end_date;
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
			await this.validateTaskDates(data, userId);
		}

		// Execute insert
		const { data: result, error } = await this.supabase
			.from(operation.table as any)
			.insert(data)
			.select()
			.single();

		if (error) {
			throw new Error(`Failed to create ${operation.table}: ${error.message}`);
		}

		// Track newly created project ID
		if (operation.table === 'projects' && result && 'id' in result) {
			this.newProjectId = (result as any).id;
		}

		// Handle post-creation actions
		if (operation.table === 'projects' && result && brainDumpId) {
			// 	await this.handleProjectPostCreation(result, brainDumpId);
			if (!this.completedBrainDumpIds.has(brainDumpId)) {
				await this.markBrainDumpAsCompleted(brainDumpId, (result as any).id);
				this.completedBrainDumpIds.add(brainDumpId);
			}
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
			const { id, user_id, ...updateData } = data;
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

		// For tasks, we need to query with calendar events first
		if (operation.table === 'tasks' && conditions.id) {
			// Get existing task with calendar events
			const { data: existingTask } = await this.supabase
				.from('tasks')
				.select('*, task_calendar_events(*)')
				.eq('id', conditions.id)
				.eq('user_id', userId)
				.single();

			// Perform the update
			const { data: result, error } = await this.supabase
				.from('tasks')
				.update(data)
				.eq('id', conditions.id)
				.eq('user_id', userId)
				.select();

			if (error) {
				throw new Error(`Failed to update task: ${error.message}`);
			}

			// Sync calendar events if task has a start date
			if (existingTask && (data.start_date || existingTask.start_date)) {
				// Process calendar sync in background (non-blocking)
				this.updateTaskCalendarEvents(existingTask, data, userId).catch((error) => {
					console.error('Failed to update task calendar events:', error);
					// Log error but don't fail the operation
					this.errorLogger.logCalendarError(
						error,
						'update',
						conditions.id as string,
						userId,
						{
							taskStartDate: data.start_date || existingTask.start_date,
							reason: 'Failed to sync task update from braindump'
						}
					);
				});
			}

			return result;
		}

		// Normalize project context if updating projects
		if (operation.table === 'projects' && data.context) {
			// Normalize markdown headings in the context to prevent heading inflation
			// The LLM might return content starting with ### or #### headings
			// We normalize them to start at ## level
			data.context = normalizeMarkdownHeadings(data.context, 2);
			console.log('Normalized project context headings to start at ## level');
		}

		// For other tables, proceed with normal update
		let query = this.supabase.from(operation.table as any).update(data);

		// Apply conditions
		for (const [field, value] of Object.entries(conditions)) {
			query = query.eq(field, value);
		}

		// Add user filter for security and execute
		const { data: result, error } = await query.eq('user_id', userId).select();

		if (error) {
			throw new Error(`Failed to update ${operation.table}: ${error.message}`);
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

		// Build delete query
		let query = this.supabase.from(operation.table as any).delete();

		// Apply conditions from data
		if (data.id) {
			query = query.eq('id', data.id);
		} else if (operation.searchQuery) {
			// Handle search-based deletion - use ilike for title search
			query = query.ilike('title', `%${operation.searchQuery}%`);
		} else {
			// Use all data fields as conditions
			for (const [field, value] of Object.entries(data)) {
				query = query.eq(field, value);
			}
		}

		// Add user filter for security
		query = query.eq('user_id', userId);

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
		// Simple dependency ordering: projects -> phases -> tasks -> others
		const priority: Record<TableName, number> = {
			projects: 1,
			phases: 2,
			tasks: 3,
			notes: 4,
			project_context: 4,
			project_notes: 4,
			brain_dumps: 5,
			daily_briefs: 5,
			project_questions: 5
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
			const questionsToStore = projectQuestions.slice(0, 5).map((q) => ({
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
		operations: ParsedOperation[],
		userId: string
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
					case 'phases':
						link.phase_id = op.result.id;
						link.project_id = op.result.project_id || op.data?.project_id;
						break;
					default:
						// Skip other tables
						continue;
				}

				// Only add if we have at least one entity ID
				if (link.project_id || link.task_id || link.note_id || link.phase_id) {
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
	 * Update calendar events for an existing task
	 */
	private async updateTaskCalendarEvents(
		task: any,
		updates: Record<string, any>,
		userId: string
	): Promise<void> {
		try {
			// Check if user has calendar connection
			const hasConnection = await this.calendarService.hasValidConnection(userId);
			if (!hasConnection) {
				console.log('User does not have calendar connection, skipping sync');
				return;
			}

			if (!task.task_calendar_events?.length) {
				// No calendar events to update - check if we should create new ones

				return;
			}

			// Calculate new event times
			const newStartDate = updates.start_date || task.start_date;
			const newDuration = updates.duration_minutes || task.duration_minutes || 60;
			const newTitle = updates.title || updates.name || task.title || task.name;
			const newDescription = updates.description || task.description;

			// Calculate end time
			const startDateTime = new Date(newStartDate);
			const endDateTime = new Date(startDateTime.getTime() + newDuration * 60 * 1000);

			// Update each calendar event
			for (const event of task.task_calendar_events) {
				if (event.sync_status === 'deleted') continue;

				try {
					const result = await this.calendarService.updateCalendarEvent(userId, {
						event_id: event.calendar_event_id,
						calendar_id: event.calendar_id || 'primary',
						start_time: newStartDate,
						end_time: endDateTime.toISOString(),
						summary: newTitle,
						description: newDescription,
						timeZone: 'America/New_York' // Could be retrieved from user preferences
					});

					if (!result.success) {
						console.error('Failed to update calendar event:', event.calendar_event_id);
					}
				} catch (error) {
					console.error('Error updating calendar event:', error);
					// Continue with other events even if one fails
				}
			}
		} catch (error) {
			// Don't throw - calendar sync is non-blocking
			console.error('Error updating task calendar events:', error);
			throw error; // Re-throw to be caught by caller's error handler
		}
	}
}
