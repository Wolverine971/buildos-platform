// apps/web/src/lib/services/projectSynthesis.service.ts
import { createCustomClient } from '@buildos/supabase-client';
import type { Database } from '@buildos/shared-types';
import type { ActivityLogger } from '$lib/utils/activityLogger';
import type { ProjectSynthesisResult } from '$lib/types';
import { BrainDumpProcessor } from '$utils/braindump-processor';
import type { ParsedOperation } from '$lib/types/brain-dump';
import type { SynthesisOptions } from '$lib/types/synthesis';
import { TaskSynthesisPrompt } from '$lib/services/synthesis/task-synthesis-prompt';
import { ProjectDataFetcher } from './prompts/core/project-data-fetcher';
import { SmartLLMService } from './smart-llm-service';
import { savePromptForAudit } from '$lib/utils/prompt-audit';

type SupabaseClient = ReturnType<typeof createCustomClient>;

interface SynthesisResult {
	summary: string;
	insights: string;
	operations: any[];
	comparison: any[];
}

export class ProjectSynthesisService {
	private supabase: SupabaseClient;
	private activityLogger: ActivityLogger;
	private llmService: SmartLLMService;
	private brainDumpProcessor: BrainDumpProcessor;

	private projectDataFetcher: ProjectDataFetcher;

	constructor(
		supabase: SupabaseClient,
		activityLogger: ActivityLogger,
		openRouterApiKey?: string
	) {
		this.supabase = supabase;
		this.activityLogger = activityLogger;

		this.llmService = new SmartLLMService({
			httpReferer: 'https://buildos.dev',
			appName: 'BuildOS',
			supabase
		});
		this.brainDumpProcessor = new BrainDumpProcessor(supabase);
		this.projectDataFetcher = new ProjectDataFetcher(supabase);
	}

	/**
	 * Synthesize a project by analyzing tasks and generating CRUD operations
	 */
	async synthesizeProject(
		projectId: string,
		userId: string,
		options: {
			regenerate?: boolean;
			includeDeleted?: boolean;
			synthesisOptions?: SynthesisOptions;
		} = {}
	): Promise<ProjectSynthesisResult> {
		const startTime = Date.now();

		try {
			await this.activityLogger.logActivity(userId, 'project_synthesis_started', {
				project_id: projectId,
				regenerate: options.regenerate
			});

			if (!options.regenerate) {
				const existingSynthesis = await this.getExistingSynthesis(projectId);
				if (existingSynthesis) {
					return existingSynthesis;
				}
			}

			const fullProjectContextPrompt = await this.projectDataFetcher.getFormattedProjectData({
				userId,
				projectId
			});

			// Build synthesis prompt based on options
			const userPrompt = options.synthesisOptions
				? this.buildModularSynthesisPrompt(
						fullProjectContextPrompt,
						projectId,
						options.synthesisOptions
					)
				: this.buildSynthesisPrompt(fullProjectContextPrompt, projectId);
			const systemPrompt =
				'You are an expert project manager and task analyst. Analyze the provided project data and return structured JSON with CRUD operations for task consolidation and next steps. Ensure all task fields are properly handled and operations are well-reasoned.';

			// Determine scenario type for prompt audit
			const scenarioType = options.synthesisOptions?.selectedModules.includes(
				'task_synthesis'
			)
				? 'project-synthesis-task-synthesis'
				: 'project-synthesis-default';

			// Save prompt for audit (development mode only)
			await savePromptForAudit({
				systemPrompt,
				userPrompt,
				scenarioType,
				metadata: {
					projectId,
					userId,
					regenerate: options.regenerate,
					includeDeleted: options.includeDeleted,
					selectedModules: options.synthesisOptions?.selectedModules || [],
					taskSynthesisConfig: options.synthesisOptions?.config.task_synthesis || null
				}
			});

			// Use LLM pool to generate synthesis
			const response = await this.llmService.getJSONResponse({
				systemPrompt,
				userPrompt,
				userId,
				profile: 'balanced',
				operationType: 'project_synthesis',
				projectId
			});

			if (!response) {
				throw new Error('Failed to generate synthesis');
			}

			const result: SynthesisResult = response;

			// Convert to ParsedOperation format
			const operations = this.convertToOperations(result, projectId, userId);

			const synthesisResult = {
				operations,
				insights: result.insights,
				comparison: result.comparison,
				summary: result.summary
			};

			// Save synthesis to database
			const savedSynthesis = await this.saveSynthesis(projectId, userId, synthesisResult);

			const duration = Date.now() - startTime;
			await this.activityLogger.logActivity(userId, 'project_synthesis_completed', {
				project_id: projectId,
				synthesis_id: savedSynthesis.id,
				operations_count: synthesisResult.operations.length,
				duration_ms: duration
			});

			return {
				id: savedSynthesis.id,
				operations: synthesisResult.operations,
				insights: synthesisResult.insights,
				comparison: synthesisResult.comparison,
				summary: synthesisResult.summary
			};
		} catch (error) {
			console.error('Error in project synthesis:', error);
			await this.activityLogger.logActivity(userId, 'project_synthesis_failed', {
				project_id: projectId,
				error: error instanceof Error ? error.message : 'Unknown error',
				duration_ms: Date.now() - startTime
			});
			throw error;
		}
	}

	private buildSynthesisPrompt(fullProjectData: string, projectId: string): string {
		const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
		return `Your job is to synthesize the tasks in this project. Analyze this project's tasks to deduplicate tasks and task information, identify tasks for next steps, and create tasks that are needed to fill gaps in execution.

## IMPORTANT: Current Date
Today's date is: ${currentDate}
DO NOT schedule any tasks with start_date in the past. All tasks must have start_date of ${currentDate} or later.

${fullProjectData}

## Required JSON Response Format
{
  "title": "Short title for brain dump",
  "summary": "Brief overview of what was updated",
  "insights": "Key findings about task structure and optimization opportunities" (max 600 characters),
  "operations": [
    {
      "table": "tasks",
      "operation": "update",
      "data": {
        "id": "existing_task_id",
        "title": "Updated consolidated task title (required, max 255 chars)",
        "description": "Consolidated description combining multiple tasks",
        "details": "Consolidated from tasks: Task A, Task B",
        "status": "backlog|in_progress|done|blocked",
        "priority": "low|medium|high",
        "task_type": "one_off|recurring",
        "project_id": "${projectId}",
        "duration_minutes": number (estimate),
        "start_date": "YYYY-MM-DD" (optional - must be today or future date),
        "recurrence_pattern": "daily|weekdays|weekly|biweekly|monthly|quarterly|yearly" (if task_type is recurring),
        "recurrence_ends": "YYYY-MM-DD" (optional - for recurring tasks),
        "parent_task_id": null,
        "dependencies": ["task_id_1", "task_id_2"],
        "deleted_at": null
      },
      "reasoning": "Why this consolidation makes sense"
    },
    {
      "table": "tasks",
      "operation": "update",
      "data": {
        "id": "task_to_mark_deleted",
        "deleted_at": "2024-01-01T00:00:00Z"
      },
      "reasoning": "Why this task is no longer needed"
    },
    {
      "table": "tasks",
      "operation": "create",
      "ref": "new_task_1",
      "data": {
        "title": "New prerequisite task title (required, max 255 chars)",
        "description": "Description of what needs to be done first",
        "details": "All relevant task details",
        "status": "backlog|in_progress|done|blocked",
        "priority": "low|medium|high",
        "task_type": "one_off|recurring",
        "project_id": "${projectId}",
        "duration_minutes": number (estimate),
        "start_date": "YYYY-MM-DD" (optional - must be today or future date),
        "recurrence_pattern": "daily|weekdays|weekly|biweekly|monthly|quarterly|yearly" (if task_type is recurring),
        "recurrence_ends": "YYYY-MM-DD" (optional - for recurring tasks),
        "completed_at": null,
        "parent_task_id": null,
        "dependencies": [],
        "deleted_at": null
      },
      "reasoning": "Why this task is needed for project success"
    }
  ],
  "comparison": [
    {
      "type": "consolidated",
      "originalTasks": ["task_id_1", "task_id_2"],
      "newTask": {
        "title": "Consolidated task name",
        "description": "Combined description"
      },
      "reasoning": "These tasks were combined because..."
    }
  ]
}


## Analysis Guidelines
1. Look for duplicate or very similar tasks that can be consolidated
2. Identify missing prerequisite tasks needed for project success
3. Break down overly complex tasks into manageable steps
4. Mark truly irrelevant tasks as deleted
5. Ensure task dependencies make logical sense
6. Provide clear, actionable task steps
7. Set realistic duration estimates
8. Prioritize tasks appropriately for project flow
9. IMPORTANT: Never set start_date to a date in the past - use today's date or later

Focus on operations that streamline execution and ensure project success.`;
	}

	private buildModularSynthesisPrompt(
		fullProjectData: string,
		projectId: string,
		synthesisOptions: SynthesisOptions
	): string {
		// Check if task synthesis is enabled
		if (
			synthesisOptions.selectedModules.includes('task_synthesis') &&
			synthesisOptions.config.task_synthesis
		) {
			// Use the modular prompt builder for task synthesis
			return TaskSynthesisPrompt.generate(
				fullProjectData,
				projectId,
				synthesisOptions.config.task_synthesis
			);
		}

		// Fallback to default prompt if no specific modules selected
		return this.buildSynthesisPrompt(fullProjectData, projectId);
	}

	private convertToOperations(
		synthesisResult: any,
		projectId: string,
		userId: string
	): ParsedOperation[] {
		if (!synthesisResult.operations || !Array.isArray(synthesisResult.operations)) {
			console.warn('Invalid operations in synthesis result:', synthesisResult);
			return [];
		}

		return synthesisResult.operations.map((op: any, index: number) => {
			// Ensure required fields are present
			const operationData = {
				...op.data,
				user_id: userId,
				project_id: op.data?.project_id || projectId
			};

			// Handle dependencies array properly
			if (operationData.dependencies && Array.isArray(operationData.dependencies)) {
				// Ensure dependencies is an array of strings
				operationData.dependencies = operationData.dependencies.filter(
					(dep: any) => typeof dep === 'string' && dep.trim().length > 0
				);
			}

			// Ensure duration_minutes is a number if provided
			if (
				operationData.duration_minutes &&
				typeof operationData.duration_minutes === 'string'
			) {
				operationData.duration_minutes = parseInt(operationData.duration_minutes) || null;
			}

			// Handle deleted_at field conversion
			if (typeof operationData.deleted_at === 'boolean') {
				operationData.deleted_at = operationData.deleted_at
					? new Date().toISOString()
					: null;
			}

			return {
				id: `synthesis-op-${Date.now()}-${index}`,
				table: op.table || 'tasks',
				operation: op.operation,
				data: operationData,
				ref: op.ref,
				enabled: true,
				reasoning: op.reasoning || 'No reasoning provided'
			};
		});
	}

	/**
	 * Execute approved synthesis operations
	 */
	async executeOperations(
		operations: ParsedOperation[],
		userId: string
	): Promise<{
		successful: ParsedOperation[];
		failed: Array<ParsedOperation & { error: string }>;
	}> {
		const successful: ParsedOperation[] = [];
		const failed: Array<ParsedOperation & { error: string }> = [];
		const refToIdMap = new Map<string, string>();
		const rollbackOperations: Array<{ operation: string; table: string; id: string }> = [];

		// Filter enabled operations and sort by dependencies
		const enabledOperations = operations.filter((op) => op.enabled);
		const sortedOperations = this.sortOperationsByDependency(enabledOperations);

		// Group operations by type for batching
		const operationGroups = this.groupOperationsByType(sortedOperations);

		// Execute all operations, tracking what needs rollback if we fail
		try {
			// Execute creates first (in batches)
			if (operationGroups.create.length > 0) {
				const createResults = await this.executeBatchOperations(
					operationGroups.create,
					'create',
					userId,
					refToIdMap
				);
				successful.push(...createResults.successful);
				failed.push(...createResults.failed);

				// Track for rollback
				createResults.successful.forEach((op: any) => {
					if (op.result?.id) {
						rollbackOperations.push({
							operation: 'delete',
							table: op.table,
							id: op.result.id
						});
					}
				});
			}

			// Then execute updates (in batches)
			if (operationGroups.update.length > 0) {
				const updateResults = await this.executeBatchOperations(
					operationGroups.update,
					'update',
					userId,
					refToIdMap
				);
				successful.push(...updateResults.successful);
				failed.push(...updateResults.failed);

				// Track for rollback
				updateResults.successful.forEach((op: any) => {
					if (op.data?.id) {
						rollbackOperations.push({
							operation: 'update_attempted',
							table: op.table,
							id: op.data.id
						});
					}
				});
			}

			// Finally execute deletes (if any)
			if (operationGroups.delete.length > 0) {
				const deleteResults = await this.executeBatchOperations(
					operationGroups.delete,
					'delete',
					userId,
					refToIdMap
				);
				successful.push(...deleteResults.successful);
				failed.push(...deleteResults.failed);
			}

			// If we had any failures and some successes, rollback
			if (failed.length > 0 && successful.length > 0) {
				console.log(
					`Rolling back ${successful.length} successful operations due to ${failed.length} failures`
				);
				await this.rollbackOperations(rollbackOperations, userId);
			}
		} catch (error) {
			console.error('Critical error in executeOperations:', error);
			// Ensure we return a valid response even on critical failure
		}

		return { successful, failed };
	}

	/**
	 * Group operations by type for batch processing
	 */
	private groupOperationsByType(operations: ParsedOperation[]) {
		return {
			create: operations.filter((op) => op.operation === 'create'),
			update: operations.filter((op) => op.operation === 'update'),
			delete: operations.filter((op) => op.operation === 'delete')
		};
	}

	/**
	 * Execute operations in batches for better performance
	 */
	private async executeBatchOperations(
		operations: ParsedOperation[],
		type: string,
		userId: string,
		refToIdMap: Map<string, string>
	): Promise<{ successful: any[]; failed: any[] }> {
		const successful: any[] = [];
		const failed: any[] = [];
		const BATCH_SIZE = 10; // Process in batches of 10

		// Process in batches
		for (let i = 0; i < operations.length; i += BATCH_SIZE) {
			const batch = operations.slice(i, i + BATCH_SIZE);

			// Execute batch in parallel
			const batchPromises = batch.map(async (operation) => {
				try {
					const result = await this.executeOperation(operation, userId, refToIdMap);

					// Store ref -> actual ID mapping for child operations
					if (operation.ref && result?.id) {
						refToIdMap.set(operation.ref, result.id);
					}

					// Log individual operation success
					await this.activityLogger.logActivity(
						userId,
						this.getActivityTypeForOperation(operation),
						{
							operation_id: operation.id,
							table: operation.table,
							operation_type: operation.operation,
							record_id: result?.id
						}
					);

					return { success: true, operation, result };
				} catch (error) {
					console.error(`Error executing operation ${operation.id}:`, error);
					return {
						success: false,
						operation,
						error: error instanceof Error ? error.message : 'Unknown error'
					};
				}
			});

			// Wait for batch to complete
			const batchResults = await Promise.all(batchPromises);

			// Sort results
			batchResults.forEach((result) => {
				if (result.success) {
					successful.push({ ...result.operation, result: result.result });
				} else {
					failed.push({ ...result.operation, error: result.error });
				}
			});

			// If we have failures, stop processing further batches
			if (failed.length > 0) {
				// Add remaining operations as skipped
				const remaining = operations.slice(i + BATCH_SIZE);
				remaining.forEach((op) => {
					failed.push({ ...op, error: 'Skipped due to previous batch failure' });
				});
				break;
			}
		}

		return { successful, failed };
	}

	/**
	 * Original executeOperations kept as fallback for single operations
	 */
	private async executeOperationsSingle(
		operations: ParsedOperation[],
		userId: string
	): Promise<{
		successful: ParsedOperation[];
		failed: Array<ParsedOperation & { error: string }>;
	}> {
		const successful: ParsedOperation[] = [];
		const failed: Array<ParsedOperation & { error: string }> = [];
		const refToIdMap = new Map<string, string>();
		const rollbackOperations: Array<{ operation: string; table: string; id: string }> = [];

		// Filter enabled operations and sort by dependencies
		const enabledOperations = operations.filter((op) => op.enabled);
		const sortedOperations = this.sortOperationsByDependency(enabledOperations);

		// Execute all operations, tracking what needs rollback if we fail
		try {
			for (const operation of sortedOperations) {
				try {
					const result = await this.executeOperation(operation, userId, refToIdMap);
					successful.push(operation);

					// Track operation for potential rollback
					if (operation.operation === 'create' && result?.id) {
						rollbackOperations.push({
							operation: 'delete',
							table: operation.table,
							id: result.id
						});
					} else if (operation.operation === 'update' && operation.data?.id) {
						// For updates, we'd need to store the original state for true rollback
						// For now, we'll just track that an update happened
						rollbackOperations.push({
							operation: 'update_attempted',
							table: operation.table,
							id: operation.data.id
						});
					}

					// Store ref -> actual ID mapping for child operations
					if (operation.ref && result?.id) {
						refToIdMap.set(operation.ref, result.id);
					}

					// Log individual operation success
					await this.activityLogger.logActivity(
						userId,
						this.getActivityTypeForOperation(operation),
						{
							operation_id: operation.id,
							table: operation.table,
							operation_type: operation.operation,
							record_id: result?.id
						}
					);
				} catch (error) {
					console.error(`Error executing operation ${operation.id}:`, error);

					// If we fail, attempt rollback of successful operations
					if (successful.length > 0) {
						console.log(
							`Rolling back ${successful.length} successful operations due to failure`
						);
						await this.rollbackOperations(rollbackOperations, userId);
					}

					// Add all remaining operations as failed
					failed.push({
						...operation,
						error: error instanceof Error ? error.message : 'Unknown error'
					});

					// Add remaining operations as failed too
					const remainingOps = sortedOperations.slice(
						sortedOperations.indexOf(operation) + 1
					);
					for (const remainingOp of remainingOps) {
						failed.push({
							...remainingOp,
							error: 'Skipped due to previous operation failure'
						});
					}

					// Exit the loop since we've rolled back
					break;
				}
			}
		} catch (error) {
			console.error('Critical error in executeOperations:', error);
			// Ensure we return a valid response even on critical failure
		}

		return { successful, failed };
	}

	/**
	 * Rollback operations in case of failure
	 */
	private async rollbackOperations(
		rollbackOps: Array<{ operation: string; table: string; id: string }>,
		userId: string
	): Promise<void> {
		// Rollback in reverse order
		for (const rollbackOp of rollbackOps.reverse()) {
			try {
				if (rollbackOp.operation === 'delete') {
					// Delete created records
					await this.supabase
						.from(rollbackOp.table as any)
						.delete()
						.eq('id', rollbackOp.id)
						.eq('user_id', userId);
					console.log(
						`Rolled back creation of ${rollbackOp.table} record ${rollbackOp.id}`
					);
				}
				// For updates, we'd need to restore original state (not implemented yet)
			} catch (rollbackError) {
				console.error(
					`Failed to rollback ${rollbackOp.table} ${rollbackOp.id}:`,
					rollbackError
				);
				// Continue with other rollbacks even if one fails
			}
		}
	}

	/**
	 * Execute a single operation
	 */
	private async executeOperation(
		operation: ParsedOperation,
		userId: string,
		refToIdMap: Map<string, string>
	): Promise<any> {
		const data = { ...operation.data, user_id: userId };

		// Resolve references to actual IDs
		this.resolveReferences(data, refToIdMap);

		// Clean up the data before sending to database
		const cleanedData = this.cleanOperationData(data, operation.operation);

		switch (operation.operation) {
			case 'create': {
				const { data: created, error: createError } = await this.supabase
					.from(operation.table as any)
					.insert(cleanedData)
					.select()
					.single();

				if (createError) {
					console.error('Create operation error:', createError);
					throw createError;
				}
				return created;
			}
			case 'update': {
				if (!cleanedData.id) {
					throw new Error('Update operation requires id');
				}

				const { data: updated, error: updateError } = await this.supabase
					.from(operation.table as any)
					.update(cleanedData)
					.eq('id', cleanedData.id)
					.eq('user_id', userId) // Ensure user owns the record
					.select()
					.single();

				if (updateError) {
					console.error('Update operation error:', updateError);
					throw updateError;
				}
				return updated;
			}
			case 'delete': {
				if (!cleanedData.id) {
					throw new Error('Delete operation requires id');
				}

				const { error: deleteError } = await this.supabase
					.from(operation.table as any)
					.delete()
					.eq('id', cleanedData.id)
					.eq('user_id', userId); // Ensure user owns the record

				if (deleteError) {
					console.error('Delete operation error:', deleteError);
					throw deleteError;
				}
				return { id: cleanedData.id };
			}
			default:
				throw new Error(`Unsupported operation: ${operation.operation}`);
		}
	}

	/**
	 * Clean operation data to ensure it matches database schema
	 */
	private cleanOperationData(data: any, operation: string): any {
		const cleaned = { ...data };

		// Remove id for create operations
		if (operation === 'create') {
			delete cleaned.id;
		}

		// Remove system-managed fields
		delete cleaned.created_at;
		delete cleaned.updated_at;

		// Ensure dependencies is properly formatted for PostgreSQL
		if (cleaned.dependencies) {
			if (Array.isArray(cleaned.dependencies)) {
				// Filter out empty dependencies and ensure all are strings
				cleaned.dependencies = cleaned.dependencies
					.filter((dep: any) => dep && typeof dep === 'string' && dep.trim().length > 0)
					.map((dep: string) => dep.trim());
			} else {
				cleaned.dependencies = null;
			}
		}

		// Ensure numeric fields are properly typed
		if (cleaned.duration_minutes !== undefined && cleaned.duration_minutes !== null) {
			cleaned.duration_minutes = Number(cleaned.duration_minutes) || null;
		}

		// Handle deleted_at field conversion
		if (cleaned.deleted_at !== undefined && typeof cleaned.deleted_at === 'boolean') {
			cleaned.deleted_at = cleaned.deleted_at ? new Date().toISOString() : null;
		}

		// Ensure date fields are properly formatted and not in the past
		if (cleaned.start_date && cleaned.start_date !== '') {
			// Validate date format
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
			if (!dateRegex.test(cleaned.start_date)) {
				cleaned.start_date = null;
			} else {
				// Ensure date is not in the past
				const todayDate = new Date().toISOString().split('T')[0]!;
				if (cleaned.start_date < todayDate) {
					cleaned.start_date = todayDate;
				}
			}
		}

		// Handle recurrence_ends date
		if (cleaned.recurrence_ends && cleaned.recurrence_ends !== '') {
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
			if (!dateRegex.test(cleaned.recurrence_ends)) {
				cleaned.recurrence_ends = null;
			} else {
				// Ensure recurrence_ends is not in the past
				const todayDate = new Date().toISOString().split('T')[0]!;
				if (cleaned.recurrence_ends < todayDate) {
					cleaned.recurrence_ends = null; // Remove past recurrence end dates
				}
			}
		}

		return cleaned;
	}

	/**
	 * Sort operations by dependency order
	 */
	private sortOperationsByDependency(operations: ParsedOperation[]): ParsedOperation[] {
		const sorted: ParsedOperation[] = [];
		const remaining = [...operations];

		// Process updates first (consolidations and deleted marking)
		const updates = remaining.filter((op) => op.operation === 'update');
		sorted.push(...updates);
		updates.forEach((op) => {
			const index = remaining.findIndex((r) => r.id === op.id);
			if (index !== -1) remaining.splice(index, 1);
		});

		// Process creates (new tasks)
		const creates = remaining.filter((op) => op.operation === 'create');
		sorted.push(...creates);
		creates.forEach((op) => {
			const index = remaining.findIndex((r) => r.id === op.id);
			if (index !== -1) remaining.splice(index, 1);
		});

		// Process deletes last
		sorted.push(...remaining);

		return sorted;
	}

	/**
	 * Resolve reference IDs to actual IDs
	 */
	private resolveReferences(data: any, refToIdMap: Map<string, string>) {
		const refFields = ['project_ref', 'parent_task_ref'];
		const idFields = ['project_id', 'parent_task_id'];

		refFields.forEach((refField, index) => {
			if (data[refField] && refToIdMap.has(data[refField])) {
				const idField = idFields[index];
				if (idField) {
					data[idField] = refToIdMap.get(data[refField]);
				}
				delete data[refField];
			}
		});
	}

	/**
	 * Save synthesis results to database
	 */
	private async saveSynthesis(projectId: string, userId: string, synthesisResult: any) {
		try {
			// Get the current version number
			const { data: existingSyntheses, error: versionError } = await this.supabase
				.from('project_synthesis')
				.select('id')
				.eq('project_id', projectId)
				.eq('user_id', userId);

			const version = (existingSyntheses?.length || 0) + 1;

			const { data, error } = await this.supabase
				.from('project_synthesis')
				.insert({
					project_id: projectId,
					user_id: userId,
					synthesis_content: synthesisResult,
					insights: synthesisResult.insights,
					operations_count: synthesisResult.operations.length,
					status: 'completed',
					created_at: new Date().toISOString()
				})
				.select()
				.single();

			if (error) {
				console.error('Error saving synthesis:', error);
				throw error;
			}
			return data;
		} catch (error) {
			console.error('Error saving synthesis:', error);
			throw new Error('Failed to save synthesis results');
		}
	}

	/**
	 * Get existing synthesis if it exists (only pending ones)
	 */
	private async getExistingSynthesis(projectId: string): Promise<ProjectSynthesisResult | null> {
		try {
			const { data, error } = await this.supabase
				.from('project_synthesis')
				.select('*')
				.eq('project_id', projectId)
				.eq('status', 'pending')
				.order('created_at', { ascending: false })
				.limit(1)
				.maybeSingle();

			if (error && error.code !== 'PGRST116') {
				console.error('Error getting existing synthesis:', error);
				return null;
			}

			if (!data) return null;

			const content = data.synthesis_content as any;
			return {
				id: data.id,
				operations: content?.operations || [],
				insights: content?.insights || '',
				comparison: content?.comparison || [],
				summary: content?.summary || ''
			};
		} catch (error) {
			console.error('Error getting existing synthesis:', error);
			return null;
		}
	}

	/**
	 * Get activity type for operation logging
	 */
	private getActivityTypeForOperation(operation: ParsedOperation): any {
		switch (operation.table) {
			case 'tasks':
				if (operation.operation === 'create') return 'task_created';
				if (operation.operation === 'update') return 'task_updated';
				return 'task_modified';
			default:
				return 'synthesis_operation_applied';
		}
	}
}
