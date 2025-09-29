// src/lib/utils/braindump-processor-stream-short.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { PromptTemplateService } from '$lib/services/promptTemplate.service';
import { ActivityLogger } from './activityLogger';
import type {
	ParsedOperation,
	ExecutionResult,
	DisplayedBrainDumpQuestion,
	BrainDumpParseResult
} from '$lib/types/brain-dump';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { BrainDumpStatusService } from '$lib/services/braindump-status.service';
import { OperationsExecutor } from './operations/operations-executor';
import { ProjectDataFetcher } from '$lib/services/prompts/core/project-data-fetcher';
import { savePromptForAudit } from './prompt-audit';
import { TaskExtractionPromptService } from '$lib/services/prompts/core/task-extraction';
import { formatProjectData } from '$lib/services/prompts/core/data-formatter';

export class ShortBrainDumpStreamProcessor {
	private supabase: SupabaseClient<Database>;
	private promptTemplateService: PromptTemplateService;
	private llmService: SmartLLMService;
	private activityLogger: ActivityLogger;
	private statusService: BrainDumpStatusService;
	private operationsExecutor: OperationsExecutor;
	private projectDataFetcher: ProjectDataFetcher;

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
		this.promptTemplateService = new PromptTemplateService(supabase);
		this.activityLogger = new ActivityLogger(supabase);

		this.llmService = new SmartLLMService({
			httpReferer: 'https://buildos.dev',
			appName: 'BuildOS ShortStream',
			supabase
		});
		this.statusService = new BrainDumpStatusService(supabase);
		this.operationsExecutor = new OperationsExecutor(supabase);
		this.projectDataFetcher = new ProjectDataFetcher(supabase);
	}

	/**
	 * Extract tasks from short braindump with context decision and question generation
	 */
	async extractTasksWithContextDecision({
		content,
		projectId,
		displayedQuestions,
		userId
	}: {
		content: string;
		projectId: string;
		displayedQuestions?: DisplayedBrainDumpQuestion[];
		userId: string;
	}): Promise<{
		title: string;
		summary: string;
		insights: string;
		tags: string[];
		tasks: any[];
		requiresContextUpdate: boolean;
		contextUpdateReason?: string;
		questionAnalysis?: BrainDumpParseResult['questionAnalysis'];
		projectQuestions?: BrainDumpParseResult['projectQuestions'];
	}> {
		// Fetch project data with tasks for task extraction context
		const fullProjectData = await this.projectDataFetcher.getFullProjectData({
			userId,
			projectId,
			options: { includeTasks: true, includePhases: true }
		});

		const formattedProjectData = formatProjectData({
			user_id: userId,
			fullProjectWithRelations: fullProjectData.fullProjectWithRelations,
			timestamp: new Date().toISOString()
		});

		const systemPrompt = TaskExtractionPromptService.getTaskExtractionWithContextDecisionPrompt(
			projectId,
			formattedProjectData,
			displayedQuestions
		);

		const userPrompt = `Process this braindump:\n\n${content}`;

		// Save prompt for auditing in development mode
		await savePromptForAudit({
			systemPrompt,
			userPrompt,
			scenarioType: displayedQuestions?.length
				? 'short-braindump-task-extraction-with-questions'
				: 'short-braindump-task-extraction',
			metadata: {
				userId,
				projectId,
				contentLength: content.length,
				hasDisplayedQuestions: !!displayedQuestions?.length,
				timestamp: new Date().toISOString()
			}
		});

		// Call LLM
		const response = await this.llmService.getJSONResponse({
			systemPrompt: systemPrompt,
			userPrompt: userPrompt,
			userId: userId,
			profile: 'balanced',
			temperature: 0.3
		});

		// Validate result with questions included
		return this.validateTaskExtractionWithQuestionsResult(response);
	}

	/**
	 * Process context update if needed
	 * if (operation.table === 'projects' && data.context) {
					if (hasInflatedHeadings(data.context, 4)) {
						data.context = normalizeMarkdownHeadings(data.context, 2);
					}
				}
	 */
	async processContextForShortBrainDump({
		content,
		projectId,
		reason,
		userId
	}: {
		content: string;
		projectId: string;
		reason: string;
		userId: string;
	}): Promise<{
		projectUpdate?: any;
		title?: string;
		summary?: string;
		insights?: string;
		tags?: string[];
		projectQuestions?: BrainDumpParseResult['projectQuestions'];
	}> {
		// Get project data
		// Get formatted project data using the centralized fetcher
		const minimalProjectData = await this.projectDataFetcher.getMinimalProjectData(
			userId,
			projectId
		);

		const formattedData = formatProjectData({
			user_id: userId,
			fullProjectWithRelations: minimalProjectData.fullProjectWithRelations,
			timestamp: new Date().toDateString()
		});
		// Get context update prompt
		const systemPrompt = this.promptTemplateService.getProjectContextPromptForShortBrainDump(
			projectId,
			formattedData,
			userId
		);

		const userPrompt = `Update project context based on this brain dump provided by the user:\n\n${content}\n\nReason for update: ${reason}`;

		// Save prompt for auditing in development mode
		await savePromptForAudit({
			systemPrompt,
			userPrompt,
			scenarioType: 'short-braindump-context-update',
			metadata: {
				userId,
				projectId,
				contentLength: content.length,
				reason,
				timestamp: new Date().toISOString()
			}
		});

		// Call LLM
		const response = await this.llmService.getJSONResponse({
			systemPrompt: systemPrompt,
			userPrompt: userPrompt,
			userId: userId,
			profile: 'balanced',
			temperature: 0.3
		});

		// here

		// Extract and validate the response, ensuring projectQuestions are included
		const result = response || {};
		return {
			projectUpdate: result.projectUpdate,
			title: result.title,
			summary: result.summary,
			insights: result.insights,
			tags: result.tags,
			projectQuestions: result.projectQuestions // Include project questions from context update
		};
	}

	/**
	 * Parse task operations from extracted tasks
	 */
	// here
	parseTaskOperations(tasks: any[]): ParsedOperation[] {
		const operations: ParsedOperation[] = [];
		const timestamp = Date.now();

		tasks.forEach((task, index) => {
			const isUpdate = Boolean(task.id);
			const taskData: Record<string, any> = {
				title: task.title || 'Untitled Task',
				project_id: task.project_id,
				project_ref: task.project_ref,
				description: task.description || '',
				details: task.details || '',
				task_type: task.task_type || 'one_off'
			};

			const status = task.status ?? (isUpdate ? undefined : 'backlog');
			if (status) {
				taskData.status = status;
			}

			const priority = task.priority ?? (isUpdate ? undefined : 'medium');
			if (priority) {
				taskData.priority = priority;
			}

			// Handle dates (Note: tasks don't have a due_date field)
			if (task.start_date) {
				taskData.start_date = task.start_date;
			}

			// Handle recurrence
			if (task.recurrence_pattern) {
				taskData.recurrence_pattern = task.recurrence_pattern;
				if (task.recurrence_ends) {
					taskData.recurrence_ends = task.recurrence_ends;
				}
			}

			if (task.duration_minutes) {
				taskData.duration_minutes = task.duration_minutes;
			}
			if (task.dependencies) {
				taskData.dependencies = task.dependencies;
			}
			if (task.parent_task_id) {
				taskData.parent_task_id = task.parent_task_id;
			}

			// Determine operation type
			const operation = isUpdate ? 'update' : 'create';

			const parsedOp: ParsedOperation = {
				id: `op-${timestamp}-task-${index}`, // Add unique ID
				table: 'tasks',
				operation: operation as ParsedOperation['operation'],
				data: taskData,
				enabled: true
			};

			// Add conditions for update operations
			if (isUpdate && task.id) {
				parsedOp.conditions = { id: task.id };
			}

			operations.push(parsedOp);
		});

		return operations;
	}

	/**
	 * Execute operations using the centralized OperationsExecutor
	 */
	async executeOperations(
		operations: ParsedOperation[],
		userId: string,
		brainDumpId?: string,
		projectQuestions?: BrainDumpParseResult['projectQuestions']
	): Promise<ExecutionResult> {
		// Extract project ID from the first operation if available
		const projectId = operations.find((op) => op.data?.project_id)?.data?.project_id;

		return await this.operationsExecutor.executeOperations({
			operations,
			userId,
			brainDumpId: brainDumpId || '',
			projectQuestions: projectQuestions || []
		});
	}

	private validateTaskExtractionWithQuestionsResult(result: any): {
		title: string;
		summary: string;
		insights: string;
		tags: string[];
		tasks: any[];
		requiresContextUpdate: boolean;
		contextUpdateReason?: string;
		questionAnalysis?: any;
		projectQuestions?: BrainDumpParseResult['projectQuestions'];
	} {
		if (!result || typeof result !== 'object') {
			throw new Error('Invalid task extraction result');
		}

		return {
			title: result.title || 'Task Update',
			summary: result.summary || 'Tasks extracted from braindump',
			insights: result.insights || 'Task-level updates',
			tags: result.tags || [],
			tasks: Array.isArray(result.tasks) ? result.tasks : [],
			requiresContextUpdate: result.requiresContextUpdate === true,
			contextUpdateReason: result.contextUpdateReason || null,
			questionAnalysis: result.questionAnalysis || null,
			projectQuestions: Array.isArray(result.projectQuestions) ? result.projectQuestions : []
		};
	}

	/**
	 * Update brain dump status using the centralized service
	 */
	async updateBrainDumpStatus(
		brainDumpId: string,
		userId: string,
		status: 'parsed' | 'saved',
		parseResult?: any,
		executionResult?: ExecutionResult,
		projectInfo?: any
	): Promise<boolean> {
		if (status === 'parsed' && parseResult) {
			return await this.statusService.updateToParsed(
				brainDumpId,
				userId,
				parseResult,
				projectInfo?.id
			);
		} else if (status === 'saved' && executionResult) {
			return await this.statusService.updateToSaved(
				brainDumpId,
				userId,
				executionResult,
				parseResult?.operations || [],
				projectInfo,
				parseResult,
				Date.now(),
				'single'
			);
		}
		return false;
	}
}
