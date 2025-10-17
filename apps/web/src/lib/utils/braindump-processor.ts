// apps/web/src/lib/utils/braindump-processor.ts
import { PromptTemplateService } from '$lib/services/promptTemplate.service';
import { BrainDumpStatusService } from '$lib/services/braindump-status.service';
import type { ProjectInfo } from '$lib/services/braindump-status.service';

import { TaskExtractionPromptService } from '$lib/services/prompts/core/task-extraction';
import { ProjectDataFetcher } from '$lib/services/prompts/core/project-data-fetcher';
import { DataFormatterService, formatProjectData } from '$lib/services/prompts/core/data-formatter';

import { ActivityLogger } from './activityLogger';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import type { LLMMetadata } from '$lib/types/error-logging';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

import { OperationsExecutor, OperationValidator } from './operations-executor';
import { TaskTimeSlotFinder } from '$lib/services/task-time-slot-finder';
import type {
	ParsedOperation,
	BrainDumpParseResult,
	ExecutionResult,
	BrainDumpMetadata,
	DisplayedBrainDumpQuestion,
	PreparatoryAnalysisResult,
	BrainDumpOptions
} from '$lib/types/brain-dump';

import type { ProjectWithRelations, Task } from '$lib/types/project';

import { formatDateTimeForDisplay } from './date-utils';
import { selectModelsForPromptComplexity } from './llm-utils';
import { savePromptForAudit, determineScenarioType } from './prompt-audit';
import { validateSynthesisResult } from '$lib/services/prompts/core/validations';
import { SmartLLMService } from '$lib/services/smart-llm-service';

// ==========================================
// MAIN CLASS
// ==========================================

export class BrainDumpProcessor {
	private supabase: SupabaseClient<Database>;
	private llmService: SmartLLMService;
	private activityLogger: ActivityLogger;
	private errorLogger: ErrorLoggerService;
	private promptTemplateService: PromptTemplateService;
	private operationsExecutor: OperationsExecutor;
	private operationValidator: OperationValidator;
	private taskTimeSlotFinder: TaskTimeSlotFinder;
	private statusService: BrainDumpStatusService;
	private projectDataFetcher: ProjectDataFetcher;

	// Use shared threshold constants for dual processing

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
		this.activityLogger = new ActivityLogger(supabase);
		this.errorLogger = ErrorLoggerService.getInstance(supabase);
		// Use provided API key or try to get from environment (will only work server-side)

		this.llmService = new SmartLLMService({
			httpReferer: 'https://buildos.dev',
			appName: 'BuildOS',
			supabase
		});
		this.promptTemplateService = new PromptTemplateService(supabase);
		this.operationsExecutor = new OperationsExecutor(supabase);
		this.operationValidator = new OperationValidator();
		this.taskTimeSlotFinder = new TaskTimeSlotFinder(supabase);
		this.statusService = new BrainDumpStatusService(supabase);
		this.projectDataFetcher = new ProjectDataFetcher(supabase);
	}

	// ==========================================
	// QUESTION STATUS UPDATES AND GENERATION
	// ==========================================
	private async updateQuestionStatus(
		questionAnalysis: BrainDumpParseResult['questionAnalysis'],
		displayedQuestions: DisplayedBrainDumpQuestion[],
		brainDumpId: string,
		userId: string
	): Promise<void> {
		try {
			// Validate questionAnalysis structure
			if (!questionAnalysis || typeof questionAnalysis !== 'object') {
				console.warn('Invalid question analysis structure received');
				return;
			}

			// Track which questions have been processed to avoid duplicates
			const processedQuestions = new Set<string>();

			for (const question of displayedQuestions) {
				// Skip if already processed (prevents duplicate updates in dual processing)
				if (processedQuestions.has(question.id)) {
					continue;
				}

				const analysis = questionAnalysis[question.id];
				if (analysis && analysis.wasAnswered) {
					// Update question as answered
					const { error } = await this.supabase
						.from('project_questions')
						.update({
							status: 'answered',
							answered_at: new Date().toISOString(),
							answer_brain_dump_id: brainDumpId,
							updated_at: new Date().toISOString()
						})
						.eq('id', question.id)
						.eq('user_id', userId);

					if (error) {
						console.error(`Failed to update question ${question.id}:`, error);
					} else {
						console.log(`Question ${question.id} marked as answered`);
						processedQuestions.add(question.id);
					}
				}
			}
		} catch (error) {
			console.error('Error updating question status:', error);
			// Don't throw - this is a non-critical operation
		}
	}

	/**
	 * Validates project questions structure from LLM response
	 */
	private validateProjectQuestions(questions: any): any[] | undefined {
		if (!questions) {
			return undefined;
		}

		if (!Array.isArray(questions)) {
			console.warn('Project questions is not an array, skipping');
			return undefined;
		}

		// Validate each question has required fields
		const validQuestions = questions.filter((q) => {
			if (!q || typeof q !== 'object') {
				return false;
			}
			// Check for required fields
			if (!q.question || typeof q.question !== 'string') {
				console.warn('Invalid question structure - missing question field');
				return false;
			}
			return true;
		});

		return validQuestions.length > 0 ? validQuestions : undefined;
	}

	// ==========================================
	// PREPARATORY ANALYSIS (for existing projects)
	// ==========================================
	/**
	 * Run preparatory analysis to determine what data needs updating
	 * This lightweight LLM call classifies the braindump and identifies relevant tasks
	 * Uses a fast model to optimize cost and speed
	 *
	 * @param brainDump - The user's brain dump text
	 * @param project - The existing project with relations
	 * @param userId - The user ID
	 * @returns PreparatoryAnalysisResult or null if analysis fails
	 */
	private async runPreparatoryAnalysis(
		brainDump: string,
		project: ProjectWithRelations,
		userId: string
	): Promise<PreparatoryAnalysisResult | null> {
		try {
			// Prepare light task data (only essential fields to save tokens)
			const lightTasks = (project?.tasks || []).map((task) => ({
				id: task.id,
				title: task.title,
				status: task.status,
				start_date: task.start_date,
				description_preview: task.description?.substring(0, 100) || ''
			}));

			// Prepare light project data (exclude full context to save tokens)
			const lightProject = {
				id: project.id,
				name: project.name,
				description: project.description,
				status: project.status,
				tags: project.tags,
				start_date: project.start_date,
				end_date: project.end_date,
				executive_summary: project.executive_summary,
				// Indicate presence of context without including full text
				context: project.context ? '(existing strategic document present)' : null
			};

			// Get the analysis prompt
			const systemPrompt = this.promptTemplateService.getPreparatoryAnalysisPrompt(
				lightProject,
				lightTasks
			);
			const userPrompt = `Analyze this braindump:\n\n${brainDump}`;

			console.log('[PrepAnalysis] Starting analysis for project:', project.id);
			console.log('[PrepAnalysis] Task count:', lightTasks.length);
			console.log('[PrepAnalysis] Braindump length:', brainDump.length);

			// Save prompt for auditing in development mode
			await savePromptForAudit({
				systemPrompt,
				userPrompt,
				scenarioType: 'preparatory-analysis',
				metadata: {
					userId,
					projectId: project.id,
					brainDumpLength: brainDump.length,
					taskCount: lightTasks.length,
					hasExistingContext: !!project.context,
					existingContextLength: project.context?.length || 0,
					timestamp: new Date().toISOString()
				}
			});

			// Call LLM with fast profile for speed and cost optimization
			const response = await this.llmService.getJSONResponse({
				systemPrompt,
				userPrompt,
				userId,
				profile: 'fast', // Use fast model for lightweight analysis
				operationType: 'brain_dump_context', // Using existing enum value for analysis
				projectId: project.id
			});

			// Extract and validate the result
			const analysisResult = response as PreparatoryAnalysisResult;

			// Enhanced validation with detailed logging
			if (!analysisResult) {
				console.warn('[PrepAnalysis] Analysis result is null or undefined');
				console.warn('[PrepAnalysis] Raw response:', JSON.stringify(response, null, 2));
				return null;
			}

			if (!analysisResult.braindump_classification) {
				console.warn('[PrepAnalysis] Missing braindump_classification field');
				console.warn(
					'[PrepAnalysis] Received result:',
					JSON.stringify(analysisResult, null, 2)
				);
				return null;
			}

			// Validate required fields with defaults
			const validatedResult: PreparatoryAnalysisResult = {
				analysis_summary: analysisResult.analysis_summary || 'Analysis completed',
				braindump_classification: analysisResult.braindump_classification,

				context_indicators: analysisResult.context_indicators || [],
				relevant_task_ids: analysisResult.relevant_task_ids || [],
				task_indicators: analysisResult.task_indicators || {},
				new_tasks_detected:
					analysisResult.new_tasks_detected !== undefined
						? analysisResult.new_tasks_detected
						: false,
				confidence_level: analysisResult.confidence_level || 'medium',
				processing_recommendation: analysisResult.processing_recommendation || {
					skip_context: false,
					skip_tasks: false,
					reason: 'Default processing'
				}
			};

			console.log('[PrepAnalysis] Complete:', {
				classification: validatedResult.braindump_classification,
				relevantTasks: validatedResult.relevant_task_ids.length,
				newTasks: validatedResult.new_tasks_detected,
				confidence: validatedResult.confidence_level
			});

			// Log activity for monitoring
			await this.activityLogger.logActivity(userId, 'brain_dump_analysis_completed', {
				project_id: project.id,
				classification: validatedResult.braindump_classification,
				relevant_task_count: validatedResult.relevant_task_ids.length,
				new_tasks_detected: validatedResult.new_tasks_detected,
				confidence_level: validatedResult.confidence_level,
				skip_context: validatedResult.processing_recommendation.skip_context,
				skip_tasks: validatedResult.processing_recommendation.skip_tasks
			});

			return validatedResult;
		} catch (error) {
			console.error('[PrepAnalysis] Analysis failed:', error);

			// Log the error but don't throw - we'll fall back to full processing
			await this.errorLogger.logBrainDumpError(
				error instanceof Error ? error : new Error('Unknown analysis error'),
				'prep-analysis',
				{},
				{
					userId,
					projectId: project.id,
					metadata: {
						errorContext: 'preparatory_analysis',
						brainDumpLength: brainDump.length,
						taskCount: project.tasks?.length || 0
					}
				}
			);

			// Return null to indicate analysis failure - caller will use full processing
			return null;
		}
	}

	// ==========================================
	// MAIN ORCHESTRATION FUNCTION
	// ==========================================
	async processBrainDump({
		brainDump,
		userId,
		selectedProjectId,
		displayedQuestions,
		options = {},
		brainDumpId,
		processingDateTime
	}: {
		brainDump: string;
		userId: string;
		selectedProjectId?: string;
		displayedQuestions?: DisplayedBrainDumpQuestion[];
		options?: BrainDumpOptions;
		brainDumpId: string;
		processingDateTime?: string;
	}): Promise<BrainDumpParseResult> {
		const startTime = Date.now();

		// Get existing project data if selected
		let existingProject: ProjectWithRelations | null = null;
		if (selectedProjectId) {
			const fullProjectData = await this.projectDataFetcher.getFullProjectData({
				userId,
				projectId: selectedProjectId,
				options: { includeTasks: true, includePhases: true }
			});
			existingProject = fullProjectData.fullProjectWithRelations;
		}

		// Run preparatory analysis for existing projects (optimization step)
		let prepAnalysisResult: PreparatoryAnalysisResult | null = null;
		if (existingProject && selectedProjectId) {
			console.log('[BrainDumpProcessor] Running preparatory analysis for existing project');
			prepAnalysisResult = await this.runPreparatoryAnalysis(
				brainDump,
				existingProject,
				userId
			);

			if (prepAnalysisResult) {
				console.log('[BrainDumpProcessor] Analysis complete:', {
					classification: prepAnalysisResult.braindump_classification,
					relevantTasks: prepAnalysisResult.relevant_task_ids.length,
					recommendations: prepAnalysisResult.processing_recommendation
				});
			} else {
				console.log(
					'[BrainDumpProcessor] Analysis failed or returned null - will use full processing'
				);
			}
		}

		const brainDumpLength = brainDump.length;
		const existingProjectContextLength = existingProject?.context?.length || 0;

		// Centralized activity logging for processing start
		const processingEventType = 'brain_dump_dual_processing_started';

		await this.activityLogger.logActivity(userId, processingEventType, {
			input_length: brainDump.length,
			brain_dump_length: brainDump.length,
			selected_project_id: selectedProjectId || 'new',
			displayed_questions_count: displayedQuestions?.length || 0,
			auto_execute: options.autoExecute || false,
			has_selected_project: !!selectedProjectId,
			dual_processing: true,
			processing_type: 'dual',
			// Additional context for existing projects
			...(existingProject && {
				existing_context_length: existingProject.context?.length || 0,
				existing_tasks_count: existingProject.tasks?.length || 0,
				existing_notes_count: existingProject.notes?.length || 0
			}),
			// Dual processing specific
			max_retries: options.retryAttempts || 3
		});

		try {
			let synthesisResult: BrainDumpParseResult;

			let isNewProject = !selectedProjectId;
			// Use dual processing if threshold is met
			synthesisResult = await this.processBrainDumpDual({
				brainDump,
				brainDumpId,
				userId,
				selectedProjectId,
				existingProject,
				displayedQuestions,
				options: { ...options, streamResults: true },
				prepAnalysisResult, // Pass analysis result for optimization
				processingDateTime
			});

			// Validate project questions
			if (synthesisResult.projectQuestions) {
				synthesisResult.projectQuestions = this.validateProjectQuestions(
					synthesisResult.projectQuestions
				);
			}

			// Execute operations if autoExecute is enabled (centralized here)
			if (
				options.autoExecute &&
				synthesisResult.operations &&
				synthesisResult.operations.length > 0
			) {
				try {
					const executionResult = await this.operationsExecutor.executeOperations({
						operations: synthesisResult.operations,
						userId,
						brainDumpId,
						projectQuestions: synthesisResult.projectQuestions
					});

					// Determine project info for status update
					let projectInfo: ProjectInfo | null = null;
					if (selectedProjectId) {
						projectInfo = {
							id: selectedProjectId,
							isNew: false
						};
					} else {
						// Check if a new project was created
						const newProject = executionResult.results?.find(
							(r: any) => r.table === 'projects' && r.operationType === 'create'
						);
						if (newProject) {
							projectInfo = {
								id: newProject.id,
								name: newProject.name || '',
								slug: newProject.slug || '',
								isNew: true
							};
						}
					}

					// Update status
					await this.statusService.updateToSaved(
						brainDumpId,
						userId,
						executionResult,
						synthesisResult.operations,
						projectInfo,
						{
							title: synthesisResult.title,
							summary: synthesisResult.summary,
							insights: synthesisResult.insights,
							tags: synthesisResult.tags,
							metadata: synthesisResult.metadata
						},
						Date.now() - startTime,
						'dual'
					);

					// Add execution result to synthesis result
					synthesisResult.executionResult = executionResult;
				} catch (execError) {
					console.error('Failed to auto-execute operations:', execError);
					// Continue without execution - operations are still available for manual execution
				}
			}

			// Log comprehensive activity (centralized logging)
			const duration = Date.now() - startTime;

			// Determine the specific event type
			let eventType = isNewProject
				? 'brain_dump_dual_new_project_completed'
				: 'brain_dump_dual_existing_project_completed';

			await this.activityLogger.logActivity(userId, eventType, {
				operations_count: synthesisResult.operations?.length || 0,
				duration_ms: duration,
				processing_time_ms: duration,
				input_length: brainDump.length,
				brain_dump_length: brainDump.length,
				mode: selectedProjectId ? 'update_existing' : 'create_new',
				processing_type: 'dual',
				auto_executed:
					options.autoExecute && synthesisResult.executionResult ? true : false,
				auto_execute: options.autoExecute || false,
				successful_operations: synthesisResult.executionResult?.successful?.length || 0,
				failed_operations: synthesisResult.executionResult?.failed?.length || 0,
				// Additional details for existing projects
				...(existingProject && {
					existing_context_length: existingProject.context?.length || 0,
					existing_tasks_count: existingProject.tasks?.length || 0,
					existing_notes_count: existingProject.notes?.length || 0,
					project_id: selectedProjectId,
					updated_project_context: synthesisResult.operations?.some(
						(op) => op.table === 'projects' && op.operation === 'update'
					)
				}),
				// Additional details for new projects
				...(isNewProject && {
					created_new_project: synthesisResult.operations?.some(
						(op) => op.table === 'projects' && op.operation === 'create'
					)
				}),
				// Dual processing specific details
				max_retries: options.retryAttempts || 3
			});

			return synthesisResult;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			console.error('Error parsing brain dump:', error);

			// Log to error logger
			const llmMetadata: LLMMetadata = {
				responseTimeMs: Date.now() - startTime,
				provider: 'openai',
				model: 'dual-processing'
			};

			await this.errorLogger.logBrainDumpError(error, brainDumpId, llmMetadata, {
				userId,
				projectId: selectedProjectId,
				metadata: {
					inputLength: brainDump.length,
					dualProcessing: true,
					options,
					errorContext: 'brain_dump_processing'
				}
			});

			await this.activityLogger.logActivity(userId, 'brain_dump_processing_failed', {
				error: errorMessage,
				duration_ms: Date.now() - startTime,
				input_length: brainDump.length
			});

			throw new Error(`Brain dump processing failed: ${errorMessage}`);
		}
	}

	// ==========================================
	// UNIFIED PROJECT PROCESSING
	// ==========================================
	private async processWithStrategy({
		brainDump,
		userId,
		selectedProjectId,
		displayedQuestions,
		options,
		brainDumpId,
		isNewProject,
		analysisResult,
		processingDateTime
	}: {
		brainDump: string;
		userId: string;
		selectedProjectId?: string;
		displayedQuestions?: DisplayedBrainDumpQuestion[];
		options: BrainDumpOptions;
		brainDumpId: string;
		isNewProject: boolean;
		analysisResult?: PreparatoryAnalysisResult | null;
		processingDateTime?: string;
	}): Promise<BrainDumpParseResult> {
		const startTime = Date.now();

		try {
			// Get appropriate system instructions based on project type
			const systemInstructionsPrompt = isNewProject
				? this.promptTemplateService.getOptimizedNewProjectPrompt(processingDateTime)
				: this.promptTemplateService.getOptimizedExistingProjectPrompt(
						selectedProjectId!,
						(
							await this.projectDataFetcher.getFullProjectData({
								userId,
								projectId: selectedProjectId!,
								options: { includeTasks: false, includePhases: false }
							})
						).fullProjectWithRelations?.start_date || undefined,
						processingDateTime
					);

			// Get project context
			let projectContextPrompt: string;
			if (isNewProject) {
				projectContextPrompt =
					'No project selected. Analyze the brain dump to determine whether to create a new project with context or create standalone notes based on the content complexity and scope.';
			} else {
				const fullProjectData = await this.projectDataFetcher.getFullProjectData({
					userId,
					projectId: selectedProjectId!,
					options: { includeTasks: true, includePhases: true }
				});
				projectContextPrompt = formatProjectData(fullProjectData);
			}

			// Get integrated questions prompt
			const questionsPrompt =
				TaskExtractionPromptService.getIntegratedQuestionsPrompt(displayedQuestions);

			const fullSystemPrompt = isNewProject
				? `${systemInstructionsPrompt}\n\n## Analysis Context:\n${projectContextPrompt}${questionsPrompt}`
				: `${systemInstructionsPrompt}\n\n## Current Project Data:\n${projectContextPrompt}${questionsPrompt}`;

			const fullUserPrompt = `Process this brain dump (occurred on ${processingDateTime || new Date().toISOString()}) into CRUD operations${
				isNewProject ? '' : ' also'
			} keep in mind that the brain dump may contain instructions for organizing the info:\n\n${brainDump}`;

			// Save prompt for auditing in development mode
			await savePromptForAudit({
				systemPrompt: fullSystemPrompt,
				userPrompt: fullUserPrompt,
				scenarioType: determineScenarioType({
					isNewProject,
					brainDumpLength: brainDump.length,
					isDualProcessing: false,
					isShortBrainDump: false
				}),
				metadata: {
					userId,
					projectId: selectedProjectId,
					brainDumpId,
					brainDumpLength: brainDump.length,
					hasDisplayedQuestions: !!displayedQuestions?.length,
					timestamp: new Date().toISOString()
				}
			});

			// Parse the brain dump using LLM

			const response = await this.llmService.getJSONResponse({
				systemPrompt: fullSystemPrompt,
				userPrompt: fullUserPrompt,
				userId,
				profile: 'balanced',
				operationType: 'brain_dump',
				brainDumpId
			});
			const parsed = validateSynthesisResult(response, selectedProjectId);

			// Process question analysis if present
			if (parsed.questionAnalysis && displayedQuestions && displayedQuestions.length > 0) {
				await this.updateQuestionStatus(
					parsed.questionAnalysis,
					displayedQuestions,
					brainDumpId,
					userId
				);
			}

			// Convert to processed format with unique IDs
			const operations: ParsedOperation[] = parsed.operations.map((op, index) => {
				// Ensure project update operations have the project ID for existing projects
				if (!isNewProject && op.table === 'projects' && op.operation === 'update') {
					if (!op?.data?.id) {
						op.data.id = selectedProjectId;
					}
				}

				const operation: ParsedOperation = {
					id: `op-${Date.now()}-${index}`,
					table: op.table,
					operation: op.operation,
					data: isNewProject ? { ...op.data, user_id: userId } : op.data,
					ref: op.ref,
					searchQuery: op.searchQuery,
					enabled: true
				};
				return operation;
			});

			// Note: Validation and auto-execution are now handled centrally in processBrainDump()
			// Just return the raw operations

			const processingTime = Date.now() - startTime;

			// Activity logging is now centralized in processBrainDump()

			const result = this.buildBrainDumpResult(
				operations,
				parsed,
				processingTime,
				undefined // Execution will be handled centrally
			);

			// Include project questions for silent saving (not validated here)
			result.projectQuestions = parsed.projectQuestions;

			return result;
		} catch (error) {
			console.error(
				`Error in processWithStrategy (${isNewProject ? 'new' : 'existing'} project):`,
				error
			);

			// Log to error logger
			await this.errorLogger.logBrainDumpError(
				error,
				brainDumpId,
				{
					responseTimeMs: Date.now() - startTime
				},
				{
					userId,
					projectId: selectedProjectId,
					metadata: {
						brainDumpLength: brainDump.length,
						errorContext: `processWithStrategy (${isNewProject ? 'new' : 'existing'})`
					}
				}
			);

			throw new Error(
				`${isNewProject ? 'New' : 'Existing'} project processing failed: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			);
		}
	}

	// ==========================================
	// SHARED HELPER METHODS
	// ==========================================

	private buildBrainDumpResult(
		operations: ParsedOperation[],
		parsed: BrainDumpParseResult,
		processingTime: number,
		executionResult?: ExecutionResult
	): BrainDumpParseResult {
		return {
			title: parsed?.title,
			operations: operations,
			summary: parsed.summary,
			insights: parsed.insights,
			tags: parsed.tags,
			metadata: {
				totalOperations: operations.length,
				tableBreakdown: this.getTableBreakdown(operations),
				processingTime,
				timestamp: new Date().toISOString(),
				processingNote: parsed.metadata?.processingNote || (parsed as any).processingNote,
				attemptNumber: 1
			},
			executionResult
		};
	}

	// ==========================================
	// TASK SCHEDULING HELPER
	// ==========================================

	/**
	 * Schedule tasks using TaskTimeSlotFinder before they are converted to operations
	 * Only schedules tasks that have a start_date set by the LLM
	 */
	private async adjustTaskScheduledDateTime(
		tasks: any[],
		userId: string,
		projectId?: string
	): Promise<any[]> {
		try {
			// Filter tasks that have start_date set (these need proper scheduling)
			const tasksWithDates = tasks.filter((task) => task.start_date);
			const tasksWithoutDates = tasks.filter((task) => !task.start_date);

			if (tasksWithDates.length === 0) {
				return tasks; // No tasks need scheduling
			}

			console.log(
				`Scheduling ${tasksWithDates.length} tasks with dates, leaving ${tasksWithoutDates.length} tasks without dates`
			);

			// Create temporary task objects for scheduling
			const tempTasks = tasksWithDates.map((task) => ({
				...task,
				id: `temp-${Date.now()}-${Math.random()}`, // Temporary ID for scheduling
				user_id: userId,
				project_id: projectId || null,
				// Keep the original start_date from the LLM
				start_date: task.start_date,
				status: task.status || 'pending',
				priority: task.priority || 'medium',
				duration_minutes: task.duration_minutes || 60
			}));

			// Schedule the tasks to find proper time slots
			const scheduledTasks = await this.taskTimeSlotFinder.scheduleTasks(
				tempTasks as Task[],
				userId
			);

			// Map scheduled times back to original tasks
			const scheduledMap = new Map();
			scheduledTasks.forEach((scheduledTask, index) => {
				if (index < tasksWithDates.length) {
					scheduledMap.set(tasksWithDates[index], scheduledTask.start_date);
				}
			});

			// Return all tasks with scheduled times applied only to tasks that had dates
			return tasks.map((task) => {
				if (scheduledMap.has(task)) {
					return {
						...task,
						start_date: scheduledMap.get(task)
					};
				}
				return task; // Keep task unchanged if it didn't have a date originally
			});
		} catch (error) {
			console.error('Error scheduling tasks:', error);
			// Return original tasks if scheduling fails
			return tasks;
		}
	}

	// ==========================================
	// HELPER METHODS
	// ==========================================

	private getTableBreakdown(operations: ParsedOperation[]): Record<string, number> {
		const breakdown: Record<string, number> = {};
		operations.forEach((op) => {
			breakdown[op.table] = (breakdown[op.table] || 0) + 1;
		});
		return breakdown;
	}

	private async processBrainDumpDual({
		brainDump,
		brainDumpId,
		userId,
		selectedProjectId,
		existingProject,
		displayedQuestions,
		options,
		prepAnalysisResult,
		processingDateTime
	}: {
		brainDump: string;
		brainDumpId: string;
		userId: string;
		selectedProjectId?: string;
		existingProject: ProjectWithRelations | null;
		displayedQuestions?: DisplayedBrainDumpQuestion[];
		options: BrainDumpOptions;
		prepAnalysisResult?: PreparatoryAnalysisResult | null;
		processingDateTime?: string;
	}): Promise<BrainDumpParseResult> {
		const maxRetries = options.retryAttempts || 3;
		const startTime = Date.now();
		const existingTasks = existingProject?.tasks || [];

		// Activity logging is now centralized in processBrainDump()

		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				// Run operations in parallel for better performance
				// For both new and existing projects, we can now run in parallel
				const [contextResult, tasksResult] = await Promise.allSettled([
					this.extractProjectContext({
						brainDump,
						existingProject,
						userId,
						selectedProjectId,
						prepAnalysisResult,
						processingDateTime
					}),
					this.extractTasks({
						brainDump,
						selectedProjectId,
						userId,
						existingTasks,
						displayedQuestions,
						prepAnalysisResult,
						processingDateTime
					})
				]);

				// Use appropriate merge function based on whether we have an existing project
				if (selectedProjectId) {
					// Existing project - use standard merge
					return await this.mergeDualProcessingResultsForExistingProject(
						contextResult,
						tasksResult,
						attempt,
						selectedProjectId,
						userId,
						brainDumpId,
						options
					);
				} else {
					// New project - use enhanced merge that handles project ID assignment
					return await this.mergeDualProcessingResultsForNewProject(
						contextResult,
						tasksResult,
						attempt,
						userId,
						brainDumpId,
						options
					);
				}
			} catch (error) {
				lastError = error instanceof Error ? error : new Error('Unknown error');

				// Log to error logger
				await this.errorLogger.logBrainDumpError(
					error,
					brainDumpId,
					{
						responseTimeMs: Date.now() - startTime
					},
					{
						userId,
						projectId: selectedProjectId,
						metadata: {
							attempt,
							maxRetries,
							brainDumpLength: brainDump.length,
							errorContext: 'dual_processing_retry'
						}
					}
				);

				// Retry logging handled by error logger

				// Exponential backoff
				if (attempt < maxRetries) {
					// Call retry callback if provided (for SSE retry messages)
					if (options.onRetry) {
						try {
							await options.onRetry(attempt + 1, maxRetries);
						} catch (callbackError) {
							// Don't let callback errors break the retry loop
							console.warn('onRetry callback failed:', callbackError);
						}
					}

					await new Promise((resolve) =>
						setTimeout(resolve, Math.pow(2, attempt) * 1000)
					);
				}
			}
		}

		throw new Error(
			`Dual processing failed after ${maxRetries} attempts: ${lastError?.message}`
		);
	}

	private async extractProjectContext({
		brainDump,
		existingProject,
		userId,
		selectedProjectId,
		prepAnalysisResult,
		processingDateTime
	}: {
		brainDump: string;
		existingProject: ProjectWithRelations | null;
		userId: string;
		selectedProjectId?: string;
		prepAnalysisResult?: PreparatoryAnalysisResult | null;
		processingDateTime?: string;
	}): Promise<BrainDumpParseResult> {
		// Determine if this is a new or existing project
		const isNewProject = !existingProject && !selectedProjectId;

		// Check if analysis recommends skipping context processing (optimization)
		if ( selectedProjectId && (
			!prepAnalysisResult?.braindump_classification ||
			!['mixed', 'strategic'].includes(prepAnalysisResult.braindump_classification))
		) {
			console.log(
				'[extractProjectContext] Skipping context processing based on analysis recommendation:',
				prepAnalysisResult?.processing_recommendation.reason
			);

			// Return minimal result indicating no context update needed
			return {
				title: 'Context Processing Skipped',
				summary: `Analysis determined context update not needed: ${prepAnalysisResult?.processing_recommendation.reason}`,
				insights: prepAnalysisResult?.analysis_summary || 'No insight',
				tags: [],
				operations: [], // No operations = no context update
				metadata: {
					totalOperations: 0,
					tableBreakdown: {},
					processingTime: 0,
					timestamp: new Date().toISOString(),
					processingNote: `Skipped based on analysis: ${prepAnalysisResult?.braindump_classification || 'No classification'}`
				}
			};
		}

		// NEVER add question generation to context processing
		// Questions are ONLY generated in task extraction to avoid duplication

		// Get system prompt without embedded project data
		const systemPrompt = this.promptTemplateService.getProjectContextSystemPrompt({
			selectedProjectId,
			processingDateTime,
			userId
		});

		// Format existing project data for user prompt (not system prompt)
		const projectDataSection = selectedProjectId
			? formatProjectData(
					await this.projectDataFetcher.getFullProjectData({
						userId,
						projectId: selectedProjectId,
						options: { includeTasks: false, includePhases: false }
					})
				)
			: 'No existing project data';

		// Build user prompt with project data
		const userPrompt = existingProject
			? `## Current Project Data:

${projectDataSection}

---

Process this brain dump for project context:

${brainDump}`
			: `Process this brain dump for project context:

${brainDump}`;

		// Save prompt for auditing in development mode
		await savePromptForAudit({
			systemPrompt,
			userPrompt,
			scenarioType: determineScenarioType({
				isNewProject: !existingProject,
				brainDumpLength: brainDump.length,
				isDualProcessing: true,
				processingType: 'context',
				isShortBrainDump: false
			}),
			metadata: {
				userId,
				projectId: selectedProjectId,
				brainDumpLength: brainDump.length,
				hasExistingProject: !!existingProject,
				existingContextLength: existingProject?.context?.length || 0,
				timestamp: new Date().toISOString()
			}
		});

		const response = await this.llmService.getJSONResponse({
			systemPrompt,
			userPrompt,
			userId,
			profile: 'balanced',
			operationType: 'brain_dump_context',
			projectId: selectedProjectId
		});

		// Now using the same validation as single processing
		const result = validateSynthesisResult(response, selectedProjectId);

		// Ensure questions are never returned from context processing
		result.questionAnalysis = undefined;
		result.projectQuestions = undefined;

		return result;
	}

	private async extractTasks({
		brainDump,
		selectedProjectId,
		userId,
		existingTasks,
		displayedQuestions,
		prepAnalysisResult,
		processingDateTime
	}: {
		brainDump: string;
		selectedProjectId?: string;
		userId: string;
		existingTasks?: Task[];
		displayedQuestions?: DisplayedBrainDumpQuestion[];
		prepAnalysisResult?: PreparatoryAnalysisResult | null;
		processingDateTime?: string;
	}): Promise<BrainDumpParseResult> {
		const isNewProject = !selectedProjectId;

		// Filter tasks based on analysis result (token optimization for existing projects)
		let tasksToPass = existingTasks;
		if (
			prepAnalysisResult &&
			prepAnalysisResult.relevant_task_ids.length > 0 &&
			existingTasks
		) {
			const relevantIds = new Set(prepAnalysisResult.relevant_task_ids);
			tasksToPass = existingTasks.filter((task) => relevantIds.has(task.id));
			console.log(
				`[extractTasks] Filtering tasks based on analysis: ${tasksToPass.length}/${existingTasks.length} tasks`
			);
		}

		const systemPrompt = this.promptTemplateService.getTaskExtractionPrompt(
			selectedProjectId,
			displayedQuestions,
			isNewProject,
			processingDateTime
		);

		// Format existing tasks for user prompt (not system prompt)
		const existingTasksSection = tasksToPass
			? DataFormatterService.formatExistingTasksForPrompt(tasksToPass)
			: 'No existing tasks';

		// Build user prompt with existing tasks data
		const userPrompt = selectedProjectId
			? `## Current Project Data:

${existingTasksSection}

---

Extract and update tasks from the following brain dump, also keep in mind that the brain dump may contain instructions for organizing the info:

${brainDump}`
			: `Extract tasks from the following brain dump, also keep in mind that the brain dump may contain instructions for organizing the info:

${brainDump}`;

		// Save prompt for auditing in development mode
		await savePromptForAudit({
			systemPrompt,
			userPrompt,
			scenarioType: determineScenarioType({
				isNewProject,
				brainDumpLength: brainDump.length,
				isDualProcessing: true,
				processingType: 'tasks',
				hasQuestions: !!displayedQuestions?.length,
				isShortBrainDump: false
			}),
			metadata: {
				userId,
				projectId: selectedProjectId,
				brainDumpLength: brainDump.length,
				existingTasksCount: existingTasks?.length || 0,
				hasDisplayedQuestions: !!displayedQuestions?.length,
				timestamp: new Date().toISOString()
			}
		});

		// Use dynamic model selection based on prompt complexity
		const totalPromptLength = systemPrompt.length + userPrompt.length;
		const preferredModels = selectModelsForPromptComplexity(
			totalPromptLength,
			isNewProject,
			true // isDualProcessing
		);

		const response = await this.llmService.getJSONResponse({
			systemPrompt,
			userPrompt,
			userId,
			profile: 'balanced',
			operationType: 'brain_dump_tasks',
			projectId: selectedProjectId
		});

		// Now using the same validation as single processing
		const result = validateSynthesisResult(response, selectedProjectId);

		// Schedule tasks within operations if needed
		if (result.operations && result.operations.length > 0) {
			const taskOps = result.operations.filter(
				(op) => op.table === 'tasks' && op.operation === 'create'
			);
			if (taskOps.length > 0 && userId && selectedProjectId) {
				// Extract tasks from operations for scheduling
				const tasksToSchedule = taskOps.map((op) => op.data);
				const scheduledTasks = await this.adjustTaskScheduledDateTime(
					tasksToSchedule,
					userId,
					selectedProjectId
				);

				// Update the operations with scheduled data
				let scheduleIndex = 0;
				result.operations = result.operations.map((op) => {
					if (op.table === 'tasks' && op.operation === 'create') {
						return {
							...op,
							data: scheduledTasks[scheduleIndex++]
						};
					}
					return op;
				});
			}
		}

		// Include question analysis and project questions if present
		result.questionAnalysis = response.result?.questionAnalysis;
		result.projectQuestions = response.result?.projectQuestions;

		return result;
	}

	private async mergeDualProcessingResultsForExistingProject(
		contextResult: PromiseSettledResult<BrainDumpParseResult>,
		tasksResult: PromiseSettledResult<BrainDumpParseResult>,
		attemptNumber: number,
		selectedProjectId?: string,
		userId?: string,
		brainDumpId?: string,
		options?: BrainDumpOptions
	): Promise<BrainDumpParseResult> {
		// VALIDATION: Check if both promises failed
		if (contextResult.status === 'rejected' && tasksResult.status === 'rejected') {
			const error = new Error(
				`Both context and task extraction failed. Context: ${contextResult.reason}. Tasks: ${tasksResult.reason}`
			);
			console.error('[BrainDumpProcessor] Dual processing complete failure:', error);

			// Log to error service if available
			if (this.errorLogger && brainDumpId) {
				await this.errorLogger.logBrainDumpError(
					error,
					brainDumpId,
					{
						responseTimeMs: 0
					},
					{
						userId,
						projectId: selectedProjectId,
						metadata: {
							attemptNumber,
							contextError: contextResult.reason,
							tasksError: tasksResult.reason,
							errorContext: 'dual_processing_complete_failure'
						}
					}
				);
			}

			// Return minimal result with error
			return {
				operations: [],
				title: 'Brain dump processing failed',
				summary:
					'Both context and task extraction failed. Please try again or contact support if the issue persists.',
				insights: '',
				tags: [],
				metadata: {
					totalOperations: 0,
					tableBreakdown: {},
					processingTime: 0,
					timestamp: new Date().toISOString(),
					processingMode: 'dual',
					attemptNumber,
					partialFailure: true,
					failureDetails: [
						`Context extraction failed: ${contextResult.reason}`,
						`Task extraction failed: ${tasksResult.reason}`
					]
				}
			};
		}

		const operations: ParsedOperation[] = [];
		const errors: string[] = [];
		let projectRef = 'new-project-1'; // Default project reference

		const date = formatDateTimeForDisplay(new Date().toISOString());
		let brainDumpTitle = `Big context brain dump- ${date}`;
		let brainDumpSummary = '';
		let brainDumpInsights = '';
		let brainDumpTags: string[] = [];
		let metadata: Partial<BrainDumpMetadata> = {};
		let projectQuestions: any[] | undefined;
		let questionAnalysis: any | undefined;

		// Process context first to establish project reference
		if (contextResult.status === 'fulfilled') {
			const contextValue = contextResult.value;
			brainDumpTitle = contextValue.title || brainDumpTitle;
			brainDumpSummary = contextValue.summary || '';
			brainDumpInsights = contextValue.insights || '';
			brainDumpTags = contextValue.tags || [];
			metadata = { ...metadata, ...contextValue.metadata };

			// Add context operations
			operations.push(...contextValue.operations);

			// Extract project reference from operations
			const createOp = contextValue.operations.find(
				(op) => op.table === 'projects' && op.operation === 'create' && op.ref
			);

			if (createOp?.ref) {
				projectRef = createOp.ref;
				console.log(`Project will be created with reference: ${projectRef}`);
			} else if (selectedProjectId) {
				// Using existing project
				console.log(`Using existing project ID: ${selectedProjectId}`);
			} else {
				console.warn('No project reference found and no selected project ID');
			}
		} else {
			errors.push(`Context processing failed: ${contextResult.reason}`);
			console.error('Context processing failed:', contextResult.reason);
		}

		// Process tasks with the correct reference
		if (tasksResult.status === 'fulfilled') {
			const tasksValue = tasksResult.value;

			// Merge metadata from tasks
			brainDumpTitle = tasksValue.title || brainDumpTitle;
			brainDumpSummary = tasksValue.summary || brainDumpSummary;
			brainDumpInsights = tasksValue.insights || brainDumpInsights;
			brainDumpTags = [...new Set([...brainDumpTags, ...(tasksValue.tags || [])])];
			metadata = { ...metadata, ...tasksValue.metadata };

			// Capture question analysis and project questions from tasks result
			questionAnalysis = tasksValue.questionAnalysis;
			projectQuestions = tasksValue.projectQuestions;

			// Fix project references in task operations if needed
			const taskOps = tasksValue.operations.map((op) => {
				if (op.table === 'tasks' && op.operation === 'create' && !selectedProjectId) {
					// Ensure new tasks reference the correct project
					return {
						...op,
						data: {
							...op.data,
							project_ref: projectRef,
							project_id: undefined
						}
					};
				}
				return op;
			});

			operations.push(...taskOps);

			console.log(
				`Added ${taskOps.length} task/note operations with project reference: ${selectedProjectId || projectRef}`
			);
		} else {
			errors.push(`Task extraction failed: ${tasksResult.reason}`);
			console.error('Task extraction failed:', tasksResult.reason);
		}

		// Validate operations have proper references
		const invalidOps = operations.filter((op) => {
			if ((op.table === 'tasks' || op.table === 'notes') && op.operation === 'create') {
				return !op.data.project_id && !op.data.project_ref;
			}
			return false;
		});

		if (invalidOps.length > 0) {
			console.error(`Found ${invalidOps.length} operations without proper project reference`);
			errors.push(`${invalidOps.length} operations missing project reference`);
		}

		// Note: Questions are kept in projectQuestions and will be saved
		// automatically when operations are executed, not shown as operations

		// Handle complete failure vs partial success
		const hasPartialSuccess = operations.length > 0;
		const failureMode =
			errors.length === 2 ? 'complete' : errors.length === 1 ? 'partial' : 'none';

		if (!hasPartialSuccess) {
			// Both processes failed completely
			throw new Error(`Dual processing failed completely: ${errors.join('; ')}`);
		}

		// Log partial failure details for monitoring
		if (errors.length > 0) {
			console.warn(`Dual processing completed with ${failureMode} failure:`, errors);
		}

		// Note: Validation and auto-execution are now handled centrally in processBrainDump()

		const mergedMetadata: BrainDumpMetadata = {
			...metadata,
			totalOperations: operations.length,
			tableBreakdown: this.getTableBreakdown(operations),
			processingTime: Date.now(),
			timestamp: new Date().toISOString(),
			processingMode: 'dual',
			attemptNumber,
			partialFailure: errors.length > 0,
			failureDetails: errors.length > 0 ? errors : undefined,
			projectReference: selectedProjectId || projectRef
		};

		return {
			title: brainDumpTitle,
			operations: operations,
			summary:
				brainDumpSummary ||
				`Processed with ${failureMode === 'none' ? 'full' : failureMode} success. ${operations.length} operations ready.`,
			insights:
				brainDumpInsights ||
				(errors.length > 0 ? `Partial processing: ${errors[0]}` : 'Successfully processed'),
			tags: brainDumpTags,
			metadata: mergedMetadata,
			executionResult: undefined, // Execution will be handled centrally
			// Include questions from task extraction for silent saving and question analysis for UI feedback
			projectQuestions: projectQuestions,
			questionAnalysis
		};
	}

	/**
	 * Enhanced merge function for new project creation that handles parallel processing
	 * and ensures tasks properly reference the newly created project ID
	 */
	private async mergeDualProcessingResultsForNewProject(
		contextResult: PromiseSettledResult<BrainDumpParseResult>,
		tasksResult: PromiseSettledResult<BrainDumpParseResult>,
		attemptNumber: number,
		userId: string,
		brainDumpId: string,
		options: BrainDumpOptions
	): Promise<BrainDumpParseResult> {
		const operations: ParsedOperation[] = [];
		const errors: string[] = [];
		let projectRef = 'new-project-1'; // Default project reference
		let projectCreateOp: ParsedOperation | undefined;
		const date = formatDateTimeForDisplay(new Date().toISOString());
		let brainDumpTitle = `Big context brain dump- ${date}`;
		let brainDumpSummary = '';
		let brainDumpInsights = '';
		let brainDumpTags: string[] = [];
		let metadata: Partial<BrainDumpMetadata> = {};
		let projectQuestions: any[] | undefined;
		let questionAnalysis: any | undefined;

		// Process context result first to identify the project creation operation
		if (contextResult.status === 'fulfilled') {
			const contextValue = contextResult.value;
			brainDumpTitle = contextValue.title || brainDumpTitle;
			brainDumpSummary = contextValue.summary || '';
			brainDumpInsights = contextValue.insights || '';
			brainDumpTags = contextValue.tags || [];
			metadata = { ...metadata, ...contextValue.metadata };

			// Find the project creation operation
			projectCreateOp = contextValue.operations.find(
				(op) => op.table === 'projects' && op.operation === 'create'
			);

			if (projectCreateOp?.ref) {
				projectRef = projectCreateOp.ref;
				console.log(`Found project creation with reference: ${projectRef}`);
			}

			// Add all context operations
			operations.push(...contextValue.operations);
		} else {
			errors.push(`Context processing failed: ${contextResult.reason}`);
			console.error('Context processing failed:', contextResult.reason);
		}

		// Process tasks result
		if (tasksResult.status === 'fulfilled') {
			const tasksValue = tasksResult.value;

			// Merge metadata from tasks
			brainDumpTitle = tasksValue.title || brainDumpTitle;
			brainDumpSummary = tasksValue.summary || brainDumpSummary;
			brainDumpInsights = tasksValue.insights || brainDumpInsights;
			brainDumpTags = [...new Set([...brainDumpTags, ...(tasksValue.tags || [])])];
			metadata = { ...metadata, ...tasksValue.metadata };

			// Capture question analysis and project questions
			questionAnalysis = tasksValue.questionAnalysis;
			projectQuestions = tasksValue.projectQuestions;

			// Process task operations - ensure they reference the project correctly
			const taskOps = tasksValue.operations.map((op) => {
				if ((op.table === 'tasks' || op.table === 'notes') && op.operation === 'create') {
					// If there's a project creation operation, ensure tasks reference it
					if (projectCreateOp) {
						return {
							...op,
							data: {
								...op.data,
								project_ref: projectRef,
								project_id: undefined // Clear any existing project_id
							}
						};
					}
					// If no project creation, keep tasks as standalone
					return op;
				}
				return op;
			});

			operations.push(...taskOps);
			console.log(
				`Added ${taskOps.length} task/note operations with project reference: ${projectRef}`
			);
		} else {
			errors.push(`Task extraction failed: ${tasksResult.reason}`);
			console.error('Task extraction failed:', tasksResult.reason);
		}

		// Validate operations have proper references
		const invalidOps = operations.filter((op) => {
			if ((op.table === 'tasks' || op.table === 'notes') && op.operation === 'create') {
				// Only require project reference if we have a project creation
				if (projectCreateOp) {
					return !op.data.project_id && !op.data.project_ref;
				}
			}
			return false;
		});

		if (invalidOps.length > 0) {
			console.error(`Found ${invalidOps.length} operations without proper project reference`);
			errors.push(`${invalidOps.length} operations missing project reference`);
		}

		// Handle complete failure vs partial success
		const hasPartialSuccess = operations.length > 0;
		const failureMode =
			errors.length === 2 ? 'complete' : errors.length === 1 ? 'partial' : 'none';

		if (!hasPartialSuccess) {
			// Both processes failed completely
			throw new Error(`Dual processing failed completely: ${errors.join('; ')}`);
		}

		// Log partial failure details
		if (errors.length > 0) {
			console.warn(`Dual processing completed with ${failureMode} failure:`, errors);
		}

		// Note: Validation and auto-execution are now handled centrally in processBrainDump()

		const mergedMetadata: BrainDumpMetadata = {
			...metadata,
			totalOperations: operations.length,
			tableBreakdown: this.getTableBreakdown(operations),
			processingTime: Date.now(),
			timestamp: new Date().toISOString(),
			processingMode: 'dual',
			attemptNumber,
			partialFailure: errors.length > 0,
			failureDetails: errors.length > 0 ? errors : undefined,
			projectReference: projectRef
		};

		return {
			title: brainDumpTitle,
			operations: operations,
			summary:
				brainDumpSummary ||
				`Processed with ${failureMode === 'none' ? 'full' : failureMode} success. ${operations.length} operations ready.`,
			insights:
				brainDumpInsights ||
				(errors.length > 0 ? `Partial processing: ${errors[0]}` : 'Successfully processed'),
			tags: brainDumpTags,
			metadata: {
				...mergedMetadata,
				projectCreate: !!projectCreateOp
			},
			projectQuestions: projectQuestions,
			questionAnalysis
		};
	}
}
