// apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts
/**
 * Plan Orchestrator Service
 *
 * Creates and orchestrates the execution of multi-step plans for the agentic chat system.
 * This service manages the entire plan lifecycle from creation through execution,
 * coordinating tool execution and executor agents as needed.
 *
 * @see {@link /apps/web/docs/features/agentic-chat/REFACTORING_SPEC.md} - Refactoring specification
 * @see {@link ../../../agent-planner-service.ts} - Original implementation reference
 *
 * Key responsibilities:
 * - Generate execution plans based on strategy
 * - Validate plan structure and dependencies
 * - Execute plan steps in proper order
 * - Coordinate tool and executor execution
 * - Track plan progress and handle failures
 * - Optimize plan execution for parallelization
 *
 * @module agentic-chat/planning
 */

import type {
	ServiceContext,
	PlannerContext,
	AgentPlan,
	PlanStep,
	BaseService,
	StreamCallback,
	StreamEvent,
	ToolExecutionResult,
	ExecutorResult,
	ExecutorSpawnParams,
	ToolExecutorFunction,
	PlanExecutionMode
} from '../shared/types';
import { PlanExecutionError } from '../shared/types';
import { ChatStrategy } from '$lib/types/agent-chat-enhancement';
import type {
	ChatToolCall,
	ChatContextType,
	AgentPlanMetadata,
	ChatToolDefinition
} from '@buildos/shared-types';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { formatToolSummaries } from '$lib/services/agentic-chat/tools/core/tools.config';
import { ToolExecutionService } from '../execution/tool-execution-service';
import { applyContextShiftToContext, extractContextShift } from '../shared/context-shift';
import { createLogger } from '$lib/utils/logger';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import type { JSONRequestOptions } from '$lib/services/smart-llm-service';
import { sanitizeLogData, sanitizeLogText } from '$lib/utils/logging-helpers';
import { getOptimalJSONProfile } from '../config/model-selection-config';

const logger = createLogger('PlanOrchestrator');

/**
 * Interface for LLM service (subset of SmartLLMService)
 */
interface LLMService {
	generateText(params: {
		systemPrompt: string;
		prompt: string;
		temperature?: number;
		maxTokens?: number;
		userId?: string;
		operationType?: string;
		chatSessionId?: string;
		agentSessionId?: string;
		agentPlanId?: string;
		agentExecutionId?: string;
	}): Promise<string>;
	getJSONResponse?<T = any>(options: JSONRequestOptions): Promise<T>;
}

/**
 * Interface for executor coordinator
 */
interface ExecutorCoordinator {
	spawnExecutor(params: ExecutorSpawnParams, context: ServiceContext): Promise<string>;
	waitForExecutor(executorId: string): Promise<ExecutorResult>;
}

/**
 * Interface for persistence service
 */
interface PersistenceService {
	createPlan(data: Omit<any, 'id'>): Promise<string>;
	updatePlan(id: string, data: Partial<any>): Promise<void>;
	getPlan(id: string): Promise<any | null>;
	updatePlanStep(
		planId: string,
		stepNumber: number,
		stepUpdate: Record<string, any>
	): Promise<void>;
}

/**
 * Plan validation result
 */
export interface PlanValidation {
	isValid: boolean;
	errors: string[];
}

export type PlanReviewVerdict = 'approved' | 'changes_requested' | 'rejected';

export interface PlanReviewResult {
	verdict: PlanReviewVerdict;
	notes?: string;
	reviewer?: string;
}

export interface PlanIntent {
	objective: string;
	contextType: ChatContextType;
	sessionId: string;
	userId: string;
	plannerAgentId: string;
	entityId?: string;
	requestedOutputs?: string[];
	priorityEntities?: string[];
	executionMode?: PlanExecutionMode;
	autoExecute?: boolean; // legacy alias for executionMode === 'auto_execute'
}

/**
 * Service for creating and orchestrating plans
 */
export class PlanOrchestrator implements BaseService {
	private static readonly PROJECT_CONTEXT_TOOLS = new Set([
		'get_onto_project_details',
		'list_onto_tasks',
		'list_onto_goals',
		'list_onto_plans',
		'list_onto_milestones',
		'list_onto_risks',
		'list_onto_requirements',
		'create_onto_task',
		'create_onto_goal',
		'create_onto_plan',
		'update_onto_project'
	]);
	private toolExecutionService: ToolExecutionService;

	constructor(
		private llmService: LLMService,
		toolExecutor: ToolExecutorFunction,
		private executorCoordinator: ExecutorCoordinator,
		private persistenceService: PersistenceService,
		private errorLogger?: ErrorLoggerService
	) {
		this.toolExecutionService = new ToolExecutionService(toolExecutor, undefined, errorLogger);
	}

	async initialize(): Promise<void> {}

	async cleanup(): Promise<void> {}

	/**
	 * Create an execution plan
	 */
	async createPlan(
		userMessage: string,
		strategy: ChatStrategy,
		plannerContext: PlannerContext,
		context: ServiceContext
	): Promise<AgentPlan> {
		const intent: PlanIntent = {
			objective: userMessage,
			contextType: context.contextType,
			sessionId: context.sessionId,
			userId: context.userId,
			entityId: context.entityId,
			plannerAgentId: context.plannerAgentId ?? plannerContext.metadata?.plannerAgentId ?? '',
			executionMode: 'auto_execute'
		};

		return this.createPlanFromIntent(intent, plannerContext, context, strategy);
	}

	async createPlanFromIntent(
		intent: PlanIntent,
		plannerContext: PlannerContext,
		context: ServiceContext,
		strategyOverride?: ChatStrategy
	): Promise<AgentPlan> {
		const strategy = strategyOverride ?? this.determineStrategyFromIntent(intent);
		const executionMode = this.resolveExecutionMode(intent);

		logger.info('Creating plan', {
			strategy,
			contextType: intent.contextType,
			executionMode,
			toolCount: plannerContext.availableTools.length
		});

		const plannerAgentId =
			intent.plannerAgentId ??
			context.plannerAgentId ??
			plannerContext.metadata?.plannerAgentId;

		if (!plannerAgentId) {
			throw new PlanExecutionError('Missing planner agent identifier for plan creation', {
				context,
				plannerContext
			});
		}

		try {
			const planData = await this.generatePlanWithLLM(
				intent,
				strategy,
				plannerContext,
				context
			);

			const plan: AgentPlan = {
				id: uuidv4(),
				sessionId: intent.sessionId,
				userId: intent.userId,
				plannerAgentId,
				userMessage: intent.objective,
				strategy,
				status: 'pending',
				steps: this.normalizeSteps(planData.steps),
				createdAt: new Date(),
				metadata: {
					estimatedDuration: this.estimateDuration(planData.steps),
					totalTokensUsed: 0,
					executionMode,
					contextType: intent.contextType,
					requestedOutputs: intent.requestedOutputs,
					priorityEntities: intent.priorityEntities
				}
			};

			const validation = this.validatePlan(plan);
			if (!validation.isValid) {
				throw new PlanExecutionError(
					`Invalid plan generated: ${validation.errors.join('; ')}`,
					{ plan, errors: validation.errors }
				);
			}

			if (intent.contextType === 'project_create') {
				this.enforceProjectCreationPlan(plan, plannerContext);
			}

			await this.persistenceService.createPlan({
				id: plan.id,
				session_id: plan.sessionId,
				user_id: plan.userId,
				planner_agent_id: plan.plannerAgentId,
				user_message: plan.userMessage,
				strategy: plan.strategy,
				status: plan.status,
				steps: plan.steps,
				metadata: plan.metadata,
				created_at: plan.createdAt.toISOString()
			});

			return plan;
		} catch (error) {
			logger.error(error as Error, {
				operation: 'create_plan',
				sessionId: intent.sessionId,
				contextType: intent.contextType,
				strategy
			});
			if (this.errorLogger) {
				const toolNames = plannerContext.availableTools.map((tool) => {
					const name = (tool as any)?.function?.name ?? (tool as any)?.name;
					return name ?? 'unknown';
				});
				const toolPreview = toolNames.slice(0, 20);
				void this.errorLogger.logError(error, {
					userId: intent.userId,
					projectId: context.contextScope?.projectId ?? context.entityId,
					operationType: 'plan_create',
					metadata: {
						sessionId: intent.sessionId,
						contextType: intent.contextType,
						strategy,
						objectivePreview: sanitizeLogText(intent.objective, 160),
						objectiveLength: intent.objective.length,
						executionMode,
						requestedOutputs: intent.requestedOutputs,
						priorityEntities: intent.priorityEntities,
						toolCount: toolNames.length,
						toolNames: toolPreview,
						toolNamesTruncated:
							toolNames.length > toolPreview.length
								? toolNames.length - toolPreview.length
								: undefined
					}
				});
			}
			throw new PlanExecutionError(
				`Failed to create plan: ${error instanceof Error ? error.message : 'Unknown error'}`,
				{ objective: intent.objective, strategy, error }
			);
		}
	}

	async persistDraft(plan: AgentPlan): Promise<void> {
		const metadata: AgentPlanMetadata = {
			...(plan.metadata ?? {}),
			draftSavedAt: new Date().toISOString(),
			review_status: 'pending_review'
		};
		plan.status = 'pending_review';
		plan.metadata = metadata;
		const { status: persistedStatus } = this.mapPlanStatusForPersistence(plan.status);
		await this.persistenceService.updatePlan(plan.id, {
			status: persistedStatus,
			metadata
		});
	}

	async reviewPlan(
		plan: AgentPlan,
		intent: PlanIntent,
		context: ServiceContext
	): Promise<PlanReviewResult> {
		const systemPrompt =
			'You are a meticulous project reviewer ensuring generated execution plans are safe, ordered correctly, and satisfy the BuildOS ontology workflows.';
		const prompt = this.buildPlanReviewPrompt(plan, intent);

		try {
			const response = await this.llmService.generateText({
				systemPrompt,
				prompt,
				temperature: 0.2,
				maxTokens: 600,
				userId: context.userId,
				operationType: 'plan_review',
				chatSessionId: plan.sessionId,
				agentPlanId: plan.id
			});

			return this.parsePlanReviewResponse(response);
		} catch (error) {
			logger.error(error as Error, {
				operation: 'plan_review',
				sessionId: plan.sessionId,
				planId: plan.id
			});
			if (this.errorLogger) {
				const stepCount = plan.steps?.length ?? 0;
				const toolNames = plan.steps
					.flatMap((step) => step.tools ?? [])
					.filter((tool) => typeof tool === 'string');
				const toolPreview = toolNames.slice(0, 20);
				void this.errorLogger.logError(error, {
					userId: context.userId,
					projectId: context.contextScope?.projectId ?? context.entityId,
					operationType: 'plan_review',
					metadata: {
						sessionId: plan.sessionId,
						planId: plan.id,
						stepCount,
						toolCount: toolNames.length,
						toolNames: toolPreview,
						toolNamesTruncated:
							toolNames.length > toolPreview.length
								? toolNames.length - toolPreview.length
								: undefined,
						planStatus: plan.status
					}
				});
			}
			return {
				verdict: 'approved',
				notes: 'Reviewer unavailable; defaulting to approval.',
				reviewer: 'plan_reviewer'
			};
		}
	}

	/**
	 * Execute a plan using proper topological ordering
	 * Steps are executed in dependency-respecting groups to ensure all
	 * dependencies are satisfied before a step runs
	 */
	async *executePlan(
		plan: AgentPlan,
		plannerContext: PlannerContext,
		context: ServiceContext,
		callback: StreamCallback
	): AsyncGenerator<StreamEvent, void, unknown> {
		logger.info('Executing plan', {
			planId: plan.id,
			stepCount: plan.steps.length,
			strategy: plan.strategy
		});

		// Update plan status
		plan.status = 'executing';
		await this.updatePlanStatus(plan.id, 'executing', undefined, plan.metadata);
		plan.metadata = {
			...(plan.metadata ?? {}),
			totalTokensUsed: plan.metadata?.totalTokensUsed ?? 0
		};

		// Track completed and failed steps
		const completedSteps = new Set<number>();
		const failedSteps = new Set<number>();
		const stepResults = new Map<number, any>();

		// Get execution groups (topologically sorted by dependencies)
		const executionGroups = this.getParallelExecutionGroups(plan);

		if (executionGroups.length === 0 && plan.steps.length > 0) {
			// Circular dependency detected
			const errorEvent: StreamEvent = {
				type: 'error',
				error: 'Plan has circular dependencies and cannot be executed'
			};
			yield errorEvent;
			await callback(errorEvent);
			plan.status = 'failed';
			await this.updatePlanStatus(plan.id, 'failed', undefined, plan.metadata);
			return;
		}

		logger.debug('Execution groups', { executionGroups });

		try {
			// Execute each group in order
			for (const group of executionGroups) {
				const runnableSteps: PlanStep[] = [];

				for (const stepNumber of group) {
					const step = plan.steps.find((s) => s.stepNumber === stepNumber);
					if (!step) {
						logger.warn('Step not found', { stepNumber, planId: plan.id });
						continue;
					}

					// Check if any dependency failed - skip this step if so
					const hasDependencyFailure = step.dependsOn?.some((dep) =>
						failedSteps.has(dep)
					);
					if (hasDependencyFailure) {
						logger.info('Skipping step due to failed dependency', {
							step: step.stepNumber,
							dependencies: step.dependsOn,
							failedSteps: Array.from(failedSteps)
						});
						step.status = 'skipped';
						step.error = 'Skipped due to failed dependency';
						await this.persistenceService.updatePlanStep(
							plan.id,
							step.stepNumber,
							step
						);
						continue;
					}

					step.status = 'executing';
					await this.persistenceService.updatePlanStep(plan.id, step.stepNumber, {
						status: step.status
					});

					const startEvent: StreamEvent = {
						type: 'step_start',
						step
					};
					yield startEvent;
					await callback(startEvent);

					runnableSteps.push(step);
				}

				const stepOutcomes = await Promise.all(
					runnableSteps.map(async (step) => {
						const emittedEvents: StreamEvent[] = [];
						let outcomeError: unknown;
						let fatalFailure = false;

						try {
							const { result, events: internalEvents } = await this.executeStep(
								step,
								plan,
								plannerContext,
								context,
								stepResults
							);

							this.accumulateTokensFromEvents(plan, internalEvents);
							emittedEvents.push(...internalEvents);

							step.status = 'completed';
							step.result = result;
							stepResults.set(step.stepNumber, result);
							completedSteps.add(step.stepNumber);
						} catch (error) {
							step.status = 'failed';
							step.error = error instanceof Error ? error.message : String(error);
							failedSteps.add(step.stepNumber);
							outcomeError = error;
							fatalFailure = this.shouldStopOnFailure(step, plan);
						}

						const completeEvent: StreamEvent = {
							type: 'step_complete',
							step
						};
						emittedEvents.push(completeEvent);

						await this.persistenceService.updatePlanStep(
							plan.id,
							step.stepNumber,
							step
						);

						return { events: emittedEvents, error: outcomeError, fatalFailure, step };
					})
				);

				let fatalError: { error?: unknown; step?: PlanStep } | undefined;
				for (const outcome of stepOutcomes) {
					for (const event of outcome.events) {
						yield event;
						await callback(event);
					}
					if (outcome.fatalFailure && !fatalError) {
						fatalError = { error: outcome.error, step: outcome.step };
					}
				}

				if (fatalError) {
					throw new PlanExecutionError('Critical plan step failed', {
						plan,
						error: fatalError.error,
						step: fatalError.step,
						stepNumber: fatalError.step?.stepNumber,
						stepDescription: fatalError.step?.description
					});
				}
			}

			// Mark plan as completed (even if some non-critical steps failed)
			const hasAnyFailures = failedSteps.size > 0;
			if (hasAnyFailures) {
				plan.status = 'completed_with_errors';
				plan.metadata = {
					...(plan.metadata ?? {}),
					has_errors: true,
					completion_status: 'completed_with_errors'
				};
			} else {
				plan.status = 'completed';
			}
			plan.completedAt = new Date();
			await this.updatePlanStatus(plan.id, plan.status, plan.completedAt, plan.metadata);

			// Emit done event
			const doneEvent: StreamEvent = {
				type: 'done',
				usage: {
					total_tokens: plan.metadata?.totalTokensUsed || 0
				}
			};
			yield doneEvent;
			await callback(doneEvent);
		} catch (error) {
			logger.error(error as Error, {
				operation: 'execute_plan',
				planId: plan.id,
				sessionId: plan.sessionId
			});
			if (this.errorLogger) {
				const details =
					error instanceof PlanExecutionError && error.details
						? error.details
						: undefined;
				const failedStep = details?.step as PlanStep | undefined;
				const sanitizedStepMeta = failedStep?.metadata
					? sanitizeLogData(failedStep.metadata)
					: undefined;
				const stepTools =
					failedStep?.tools && Array.isArray(failedStep.tools)
						? failedStep.tools
						: undefined;
				const stepInfo = failedStep
					? {
							stepNumber: failedStep.stepNumber,
							description: failedStep.description,
							tools: stepTools,
							executorRequired: failedStep.executorRequired,
							status: failedStep.status,
							error: failedStep.error,
							metadata: sanitizedStepMeta
						}
					: undefined;

				void this.errorLogger.logError(error, {
					userId: plan.userId,
					projectId: context.contextScope?.projectId ?? context.entityId,
					operationType: 'plan_execute',
					metadata: {
						sessionId: plan.sessionId,
						planId: plan.id,
						contextType: context.contextType,
						stepNumber: details?.stepNumber,
						stepDescription: details?.stepDescription,
						failedStep: stepInfo
					}
				});
			}
			// Mark plan as failed
			plan.status = 'failed';
			await this.updatePlanStatus(plan.id, 'failed', undefined, plan.metadata);

			// Emit error event
			const errorEvent: StreamEvent = {
				type: 'error',
				error: this.formatPlanExecutionError(error)
			};
			yield errorEvent;
			await callback(errorEvent);

			throw error;
		}
	}

	/**
	 * Validate a plan
	 */
	validatePlan(plan: AgentPlan): PlanValidation {
		const errors: string[] = [];

		// Check for empty plan
		if (!plan.steps || plan.steps.length === 0) {
			errors.push('Plan has no steps');
		}

		// Check step numbers
		const stepNumbers = new Set<number>();
		for (const step of plan.steps) {
			if (stepNumbers.has(step.stepNumber)) {
				errors.push(`Duplicate step number: ${step.stepNumber}`);
			}
			stepNumbers.add(step.stepNumber);
		}

		// Validate dependencies
		for (const step of plan.steps) {
			if (step.dependsOn) {
				for (const dep of step.dependsOn) {
					if (!stepNumbers.has(dep)) {
						errors.push(`Step ${step.stepNumber} has invalid dependency: ${dep}`);
					}
					if (dep >= step.stepNumber) {
						errors.push(`Step ${step.stepNumber} cannot depend on future step: ${dep}`);
					}
				}
			}
		}

		// Check for circular dependencies
		if (this.hasCircularDependencies(plan)) {
			errors.push('Plan has circular dependencies');
		}

		return {
			isValid: errors.length === 0,
			errors
		};
	}

	/**
	 * Optimize a plan for better execution
	 */
	async optimizePlan(plan: AgentPlan): Promise<AgentPlan> {
		logger.info('Optimizing plan', {
			planId: plan.id,
			originalStepCount: plan.steps.length
		});

		// Identify parallelizable steps
		const groups = this.getParallelExecutionGroups(plan);

		// Update step metadata with parallel group info
		for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
			const group = groups[groupIndex];
			if (!group || !Array.isArray(group)) continue;

			for (const stepNumber of group) {
				const step = plan.steps.find((s) => s.stepNumber === stepNumber);
				if (step) {
					step.metadata = {
						...step.metadata,
						parallelGroup: groupIndex,
						canParallelize: group.length > 1
					};
				}
			}
		}

		return plan;
	}

	/**
	 * Get parallel execution groups
	 */
	getParallelExecutionGroups(plan: AgentPlan): number[][] {
		const groups: number[][] = [];
		const processed = new Set<number>();

		// Build dependency graph
		const dependencies = new Map<number, number[]>();
		for (const step of plan.steps) {
			dependencies.set(step.stepNumber, step.dependsOn || []);
		}

		// Topological sort with grouping
		while (processed.size < plan.steps.length) {
			const currentGroup: number[] = [];

			for (const step of plan.steps) {
				if (processed.has(step.stepNumber)) continue;

				// Check if all dependencies are satisfied
				const deps = dependencies.get(step.stepNumber) || [];
				const canExecute = deps.every((dep) => processed.has(dep));

				if (canExecute) {
					currentGroup.push(step.stepNumber);
				}
			}

			if (currentGroup.length === 0) {
				// Circular dependency or error
				break;
			}

			groups.push(currentGroup);
			currentGroup.forEach((step) => processed.add(step));
		}

		return groups;
	}

	// ============================================
	// PRIVATE HELPER METHODS
	// ============================================

	/**
	 * Generate plan using LLM
	 */
	private static readonly PLAN_GENERATION_ATTEMPTS = 2;

	private async generatePlanWithLLM(
		intent: PlanIntent,
		strategy: ChatStrategy,
		plannerContext: PlannerContext,
		context: ServiceContext
	): Promise<{ steps: any[]; reasoning?: string }> {
		const systemPrompt = this.buildPlanSystemPrompt(strategy, plannerContext, context, intent);
		const basePrompt = this.buildPlanPrompt(intent, plannerContext);
		const llmWithJson = this.llmService as LLMService;
		const useJsonMode = typeof llmWithJson.getJSONResponse === 'function';
		let lastError: Error | null = null;

		const planComplexity =
			intent.objective.length > 4000
				? 'complex'
				: intent.objective.length > 1500
					? 'moderate'
					: 'simple';
		const planProfile = getOptimalJSONProfile('plan_generation', planComplexity);

		for (let attempt = 1; attempt <= PlanOrchestrator.PLAN_GENERATION_ATTEMPTS; attempt++) {
			const attemptPrompt =
				attempt === 1
					? basePrompt
					: `${basePrompt}\n\nIMPORTANT: Return ONLY valid JSON shaped like {"steps":[...],"reasoning":"..."} with at most 5 steps. Do not include markdown fences or commentary.`;

			try {
				if (useJsonMode && llmWithJson.getJSONResponse) {
					const jsonResponse = await llmWithJson.getJSONResponse({
						systemPrompt,
						userPrompt: attemptPrompt,
						temperature: 0.35,
						profile: planProfile,
						userId: context.userId,
						operationType: 'plan_generation',
						chatSessionId: context.sessionId,
						validation: { retryOnParseError: true }
					});
					const parsed =
						typeof jsonResponse === 'string'
							? this.tryParsePlanResponse(jsonResponse)
							: this.normalizePlanResponse(jsonResponse);
					if (parsed) {
						return parsed;
					}

					lastError = new Error('Invalid plan format from LLM');
					logger.warn('Plan response normalization failed', {
						attempt,
						responsePreview: sanitizeLogText(JSON.stringify(jsonResponse) ?? '', 200)
					});
					continue;
				}

				const response = await this.llmService.generateText({
					systemPrompt,
					prompt: attemptPrompt,
					temperature: 0.35,
					maxTokens: 1200,
					userId: context.userId,
					operationType: 'plan_generation',
					chatSessionId: context.sessionId
				});

				const parsed = this.tryParsePlanResponse(response);
				if (parsed) {
					return parsed;
				}

				lastError = new Error('Invalid plan format from LLM');
				logger.warn('Plan response parsing failed', {
					attempt,
					responsePreview: sanitizeLogText(response, 200),
					responseLength: response.length
				});
			} catch (error) {
				lastError =
					error instanceof Error ? error : new Error('Invalid plan format from LLM');
				logger.warn('Plan generation attempt failed', {
					attempt,
					error: lastError.message
				});
			}
		}

		throw lastError ?? new Error('Invalid plan format from LLM');
	}

	/**
	 * Build system prompt for plan generation
	 */
	private buildPlanSystemPrompt(
		strategy: ChatStrategy,
		plannerContext: PlannerContext,
		context: ServiceContext,
		intent?: PlanIntent
	): string {
		const toolList = plannerContext.availableTools
			.map((t) => (t as any).name || (t as any).function?.name || 'unknown')
			.join(', ');
		const toolSummaries = plannerContext.availableTools.length
			? formatToolSummaries(plannerContext.availableTools)
			: 'No tools available.';
		const toolRequirements = plannerContext.availableTools.length
			? this.buildToolRequirementsSummary(plannerContext.availableTools)
			: 'none';

		const strategyGuidance =
			strategy === ChatStrategy.PROJECT_CREATION || intent?.contextType === 'project_create'
				? `
PROJECT CREATION REQUIREMENTS (CRITICAL):
- Step 1 MUST classify the project (type_key) using taxonomy and gather key props/facets (template-free).
- A step MUST call create_onto_project with a complete spec (name, description, type_key, facets, entities + relationships). Only include task entities if the user explicitly mentioned SPECIFIC FUTURE ACTIONS they need to track (e.g., "I need to call the vendor"). Do NOT add tasks for planning, brainstorming, or work you can help with in the conversation. relationships is required even when empty; include at least one relationship when multiple entities exist.
- Include a context_document payload summarizing the braindump and plan so the project has a linked narrative.
- Only after create_onto_project succeeds may later steps expand on additional artifacts.
- Do NOT skip project creation; the user must leave this flow with a real ontology project.`
				: '';

		return `You are a plan generator for BuildOS chat.
Strategy: ${strategy}
Context type: ${intent?.contextType ?? context.contextType}
Available tools: ${toolList}
Tool summaries:
${toolSummaries}
Tool required parameters (include these when using the tool):
${toolRequirements}
${strategyGuidance}

Create a step-by-step execution plan.

Each step should have:
- stepNumber: Sequential number
- type: "research", "action", "analysis", or "synthesis"
- description: Clear description of what the step does
- tools: Array of tool names to use
- executorRequired: Boolean - true if step needs an executor agent
- dependsOn: Array of step numbers this step depends on (optional)
- metadata: Optional object for tool arguments (use metadata.toolArguments or metadata.arguments)

Guidelines:
- Keep plans minimal and focused
- Mark steps as executorRequired only for complex analysis
- For tools with required parameters, include them in metadata.toolArguments or metadata.arguments
- Use dependencies to ensure proper execution order
- For planner_stream, target 3-5 steps and mark executorRequired only when parallel execution is needed
- Keep each description under 200 characters and focus on actions, not final creative output
- The response must be strict JSON without prose or markdown fences

Return JSON: { steps: [...], reasoning: "Brief explanation" }`;
	}

	private buildToolRequirementsSummary(tools: ChatToolDefinition[]): string {
		const lines: string[] = [];

		for (const tool of tools) {
			const name = tool.function?.name || (tool as any).name || 'unknown';
			const paramSchema =
				(tool as any).function?.parameters || (tool as any).parameters || undefined;
			const required = Array.isArray(paramSchema?.required) ? paramSchema.required : [];

			if (required.length > 0) {
				lines.push(`- ${name}: ${required.join(', ')}`);
			}
		}

		return lines.length > 0 ? lines.join('\n') : 'none';
	}

	/**
	 * Build prompt for plan generation
	 */
	private buildPlanPrompt(intent: PlanIntent, plannerContext: PlannerContext): string {
		const projectCreationHint =
			intent.contextType === 'project_create'
				? `\nREMINDER: The plan must instantiate a new ontology project (create_onto_project) before tackling downstream tasks.`
				: '';

		const priorityEntities = intent.priorityEntities?.length
			? `\nPriority entities: ${intent.priorityEntities.join(', ')}`
			: '';
		const requestedOutputs = intent.requestedOutputs?.length
			? `\nRequested outputs: ${intent.requestedOutputs.join(', ')}`
			: '';

		return `User request: "${intent.objective}"

Context: ${plannerContext.locationContext}
${plannerContext.ontologyContext ? `Ontology available: ${JSON.stringify(plannerContext.ontologyContext.metadata)}` : ''}${priorityEntities}${requestedOutputs}${projectCreationHint}

Generate an execution plan to fulfill this request.`;
	}

	/**
	 * Normalize plan steps
	 */
	private normalizeSteps(steps: any[]): PlanStep[] {
		return steps.map((step, index) => {
			const metadata: Record<string, any> = {
				...(step.metadata ?? {})
			};

			if (step.toolArguments && metadata.toolArguments === undefined) {
				metadata.toolArguments = step.toolArguments;
			}
			if (step.arguments && metadata.arguments === undefined) {
				metadata.arguments = step.arguments;
			}

			return {
				stepNumber: step.stepNumber || index + 1,
				type: step.type || 'research',
				description: step.description || `Step ${index + 1}`,
				executorRequired: !!step.executorRequired,
				tools: Array.isArray(step.tools) ? step.tools : [],
				dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn : undefined,
				status: 'pending',
				metadata: Object.keys(metadata).length > 0 ? metadata : undefined
			};
		});
	}

	private enforceProjectCreationPlan(plan: AgentPlan, plannerContext: PlannerContext): void {
		const steps = plan.steps || [];
		const createProjectTools = new Set(['create_onto_project']);

		const createProjectStep = steps.find((step) => this.stepUsesTool(step, createProjectTools));

		if (!createProjectStep) {
			throw new PlanExecutionError('Project creation plan must call create_onto_project', {
				planId: plan.id,
				availableTools: plannerContext.availableTools.map(
					(tool) => tool.function.name || ''
				)
			});
		}

		const createStepNumber = createProjectStep.stepNumber;

		for (const step of steps) {
			if (!step.tools || step.tools.length === 0) {
				continue;
			}
			if (this.stepUsesTool(step, createProjectTools)) {
				continue;
			}

			const usesProjectContextTool = step.tools.some((tool) =>
				this.toolRequiresProjectId(tool, plannerContext)
			);
			if (!usesProjectContextTool) {
				continue;
			}

			if (step.stepNumber < createStepNumber) {
				throw new PlanExecutionError(
					'Project creation must occur before project-dependent steps',
					{
						planId: plan.id,
						stepNumber: step.stepNumber,
						createStepNumber
					}
				);
			}

			if (!step.dependsOn?.includes(createStepNumber)) {
				step.dependsOn = [...(step.dependsOn ?? []), createStepNumber];
			}
		}

		// Template selection is no longer required in template-free ontology
	}

	private stepUsesTool(step: PlanStep, toolNames: Set<string>): boolean {
		if (!step.tools || step.tools.length === 0) {
			return false;
		}
		return step.tools.some((tool) => toolNames.has(tool));
	}

	private buildPlanReviewPrompt(plan: AgentPlan, intent: PlanIntent): string {
		const stepsSummary = plan.steps
			.map((step) => {
				const tools = step.tools?.length ? step.tools.join(', ') : 'none';
				return `Step ${step.stepNumber}: ${step.description}\n  Tools: ${tools}\n  Executor required: ${step.executorRequired}\n`;
			})
			.join('\n');

		const requestedOutputs = intent.requestedOutputs?.length
			? intent.requestedOutputs.join(', ')
			: 'none noted';

		return `Review the following BuildOS execution plan.

Objective: ${intent.objective}
Context type: ${intent.contextType}
Execution mode: ${plan.metadata?.executionMode ?? 'auto_execute'}
Requested outputs: ${requestedOutputs}

Plan steps:
${stepsSummary}

Return JSON: {"verdict":"approved|changes_requested|rejected","notes":"short explanation"}`;
	}

	private parsePlanReviewResponse(response: string): PlanReviewResult {
		try {
			let payload = response.trim();
			if (payload.startsWith('```')) {
				payload = payload
					.replace(/```json?/i, '')
					.replace(/```$/, '')
					.trim();
			}
			const parsed = JSON.parse(payload);
			const verdict: PlanReviewVerdict =
				parsed.verdict &&
				['approved', 'changes_requested', 'rejected'].includes(parsed.verdict)
					? parsed.verdict
					: 'changes_requested';

			return {
				verdict,
				notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
				reviewer: 'plan_reviewer'
			};
		} catch (error) {
			logger.warn('Failed to parse plan review response', {
				responsePreview: sanitizeLogText(response, 200),
				responseLength: response.length
			});
			return {
				verdict: 'approved',
				notes: 'Reviewer output invalid; approving by default.',
				reviewer: 'plan_reviewer'
			};
		}
	}

	private determineStrategyFromIntent(intent: PlanIntent): ChatStrategy {
		if (intent.contextType === 'project_create') {
			return ChatStrategy.PROJECT_CREATION;
		}
		return ChatStrategy.PLANNER_STREAM;
	}

	private resolveExecutionMode(intent: PlanIntent): PlanExecutionMode {
		if (intent.executionMode) {
			return intent.executionMode;
		}
		if (intent.autoExecute === false) {
			return 'draft_only';
		}
		return 'auto_execute';
	}

	/**
	 * Check if step can be executed
	 */
	private canExecuteStep(step: PlanStep, completedSteps: Set<number>): boolean {
		if (!step.dependsOn || step.dependsOn.length === 0) {
			return true;
		}

		return step.dependsOn.every((dep) => completedSteps.has(dep));
	}

	/**
	 * Execute a single step
	 */
	private async executeStep(
		step: PlanStep,
		plan: AgentPlan,
		plannerContext: PlannerContext,
		context: ServiceContext,
		stepResults: Map<number, any>
	): Promise<{ result: any; events: StreamEvent[] }> {
		logger.info('Executing step', {
			stepNumber: step.stepNumber,
			type: step.type,
			executorRequired: step.executorRequired,
			tools: step.tools
		});

		const emittedEvents: StreamEvent[] = [];

		if (step.executorRequired) {
			// Spawn executor agent with structured parameters
			const spawnParams: ExecutorSpawnParams = {
				plan,
				step,
				plannerContext,
				previousStepResults: stepResults
			};

			const executorId = await this.executorCoordinator.spawnExecutor(spawnParams, context);

			const taskSummary = {
				stepNumber: step.stepNumber,
				description: step.description,
				tools: step.tools,
				type: step.type
			};

			// Emit executor spawned event
			emittedEvents.push({
				type: 'executor_spawned',
				executorId,
				task: taskSummary
			});

			// Wait for executor to complete
			const result = await this.executorCoordinator.waitForExecutor(executorId);

			// Emit executor result event
			emittedEvents.push({
				type: 'executor_result',
				executorId,
				result
			});

			if (!result.success) {
				const errorMessage =
					result.error instanceof Error
						? result.error.message
						: String(result.error || 'Executor failed');
				throw new Error(errorMessage);
			}

			return { result: result.data, events: emittedEvents };
		} else if (step.tools.length > 0) {
			// Execute tools directly with streaming events
			const aggregatedResults: any[] = [];

			for (const toolName of step.tools) {
				const args = this.buildToolArgs(
					toolName,
					step,
					stepResults,
					context,
					plannerContext
				);
				const normalizedArgs = this.applyToolArgumentDefaults(
					toolName,
					args,
					step,
					plannerContext
				);

				const toolCall: ChatToolCall = {
					id: uuidv4(),
					type: 'function',
					function: {
						name: toolName,
						arguments: JSON.stringify(normalizedArgs ?? {})
					}
				};

				const callEvent: StreamEvent = {
					type: 'tool_call',
					toolCall
				};
				emittedEvents.push(callEvent);

				const toolResult = await this.toolExecutionService.executeTool(
					toolCall,
					context,
					plannerContext.availableTools
				);

				const resultEvent: StreamEvent = {
					type: 'tool_result',
					result: toolResult
				};
				emittedEvents.push(resultEvent);

				if (toolResult.streamEvents) {
					for (const event of toolResult.streamEvents) {
						emittedEvents.push(event);
					}
				}

				if (!toolResult.success) {
					const message =
						typeof toolResult.error === 'string'
							? toolResult.error
							: toolResult.error?.message || `Tool ${toolName} failed`;
					throw new Error(message);
				}

				const contextShift = extractContextShift(toolResult);
				if (contextShift) {
					applyContextShiftToContext(context, contextShift);
				}

				aggregatedResults.push(toolResult.data);
			}

			// Return combined results (preserve original shape for downstream steps)
			const resultPayload =
				aggregatedResults.length === 1 ? aggregatedResults[0] : aggregatedResults;
			return { result: resultPayload, events: emittedEvents };
		} else {
			// No execution needed
			return { result: { completed: true }, events: emittedEvents };
		}
	}

	private tryParsePlanResponse(response: string): { steps: any[]; reasoning?: string } | null {
		const candidates = this.buildPlanResponseCandidates(response);

		for (const candidate of candidates) {
			try {
				const parsed = JSON.parse(candidate);
				const normalized = this.normalizePlanResponse(parsed);
				if (normalized) {
					return normalized;
				}
			} catch {
				continue;
			}
		}

		return null;
	}

	private buildPlanResponseCandidates(raw: string): string[] {
		const candidates = new Set<string>();
		const trimmed = raw.trim();
		if (!trimmed) return [];

		const withoutFences = this.stripCodeFences(trimmed);
		if (withoutFences) {
			candidates.add(withoutFences);
		}

		const objectBlock = this.extractBalancedBlock(withoutFences, '{', '}');
		if (objectBlock) {
			candidates.add(objectBlock);
		}

		const arrayBlock = this.extractBalancedBlock(withoutFences, '[', ']');
		if (arrayBlock) {
			candidates.add(arrayBlock);
			candidates.add(`{"steps": ${arrayBlock}}`);
		}

		return Array.from(candidates).filter(Boolean);
	}

	private stripCodeFences(text: string): string {
		let cleaned = text;
		if (cleaned.startsWith('```')) {
			cleaned = cleaned.replace(/^```json\s*/i, '');
			cleaned = cleaned.replace(/^```\s*/i, '');
			cleaned = cleaned.replace(/\s*```$/i, '');
		}
		return cleaned.trim();
	}

	private extractBalancedBlock(
		text: string,
		openChar: '{' | '[',
		closeChar: '}' | ']'
	): string | null {
		if (!text) return null;
		const start = text.indexOf(openChar);
		if (start === -1) return null;

		let depth = 0;
		let inString = false;
		let isEscaped = false;

		for (let i = start; i < text.length; i++) {
			const char = text[i];

			if (inString) {
				if (isEscaped) {
					isEscaped = false;
					continue;
				}
				if (char === '\\') {
					isEscaped = true;
					continue;
				}
				if (char === '"') {
					inString = false;
					continue;
				}
			} else if (char === '"') {
				inString = true;
				continue;
			} else if (char === openChar) {
				depth++;
			} else if (char === closeChar) {
				depth--;
				if (depth === 0) {
					return text.slice(start, i + 1);
				}
			}
		}

		return null;
	}

	private normalizePlanResponse(data: any): { steps: any[]; reasoning?: string } | null {
		if (!data) return null;

		if (Array.isArray(data)) {
			return { steps: data };
		}

		if (Array.isArray(data.steps)) {
			let reasoning: string | undefined;
			if (typeof data.reasoning === 'string') {
				reasoning = data.reasoning;
			} else if (data.reasoning) {
				reasoning = JSON.stringify(data.reasoning);
			}

			return {
				steps: data.steps,
				reasoning
			};
		}

		return null;
	}

	/**
	 * Build tool arguments from context
	 */
	private buildToolArgs(
		toolName: string,
		step: PlanStep,
		stepResults: Map<number, any>,
		context: ServiceContext,
		plannerContext: PlannerContext
	): Record<string, any> {
		// Extract relevant data from previous steps
		const args: Record<string, any> = {
			...(step.metadata?.toolArguments ?? {}),
			...(step.metadata?.arguments ?? {})
		};

		const projectIdSupport = this.getProjectIdSupport(toolName, plannerContext);
		if (!projectIdSupport.supports) {
			delete args.project_id;
		} else {
			const normalizedInitialProject = this.normalizeProjectId(args.project_id);
			if (normalizedInitialProject) {
				args.project_id = normalizedInitialProject;
			} else {
				delete args.project_id;
			}

			if (!args.project_id) {
				const metaProjectId = this.normalizeProjectId(step.metadata?.projectId);
				if (metaProjectId) {
					args.project_id = metaProjectId;
				}
			}
		}

		// Add context from dependencies
		if (step.dependsOn) {
			for (const dep of step.dependsOn) {
				const depResult = stepResults.get(dep);
				if (depResult) {
					// Extract relevant fields based on tool
					if (toolName.includes('create') && depResult.id) {
						args.parent_id = depResult.id;
					}
					// Add more mapping logic as needed
				}
			}
		}

		if (toolName === 'create_onto_project') {
			this.mergeCreateOntoProjectArgsFromDependencies(args, step, stepResults);
		}

		if (projectIdSupport.supports && !args.project_id) {
			const projectId = this.resolveProjectId(step, stepResults, context);
			if (projectId) {
				args.project_id = projectId;
			}
		}

		if (projectIdSupport.supports && args.project_id) {
			const normalized = this.normalizeProjectId(args.project_id);
			if (normalized) {
				args.project_id = normalized;
			} else {
				delete args.project_id;
			}
		}

		if (projectIdSupport.requires && !args.project_id) {
			throw new Error(
				`Missing project context for tool ${toolName}. Provide project_id in plan metadata or ensure dependencies return a project id.`
			);
		}

		if (toolName === 'get_field_info' && !args.entity_type) {
			args.entity_type = this.inferFieldInfoEntityType(context);
		}

		return args;
	}

	private mergeCreateOntoProjectArgsFromDependencies(
		args: Record<string, any>,
		step: PlanStep,
		stepResults: Map<number, any>
	): void {
		if (!step.dependsOn?.length) {
			return;
		}

		let hasProject = this.isRecord(args.project);
		let hasEntities = Array.isArray(args.entities);
		let hasRelationships = Array.isArray(args.relationships);
		let hasContextDocument = this.isRecord(args.context_document);
		let hasClarifications = Array.isArray(args.clarifications);
		let hasMeta = this.isRecord(args.meta);

		for (const dep of step.dependsOn) {
			const depResult = stepResults.get(dep);
			if (!depResult) {
				continue;
			}

			const extracted = this.extractCreateOntoProjectArgs(depResult);
			if (!extracted) {
				continue;
			}

			if (!hasProject && this.isRecord(extracted.project)) {
				args.project = extracted.project;
				hasProject = true;
			}
			if (!hasEntities && Array.isArray(extracted.entities)) {
				args.entities = extracted.entities;
				hasEntities = true;
			}
			if (!hasRelationships && Array.isArray(extracted.relationships)) {
				args.relationships = extracted.relationships;
				hasRelationships = true;
			}
			if (!hasContextDocument && this.isRecord(extracted.context_document)) {
				args.context_document = extracted.context_document;
				hasContextDocument = true;
			}
			if (!hasClarifications && Array.isArray(extracted.clarifications)) {
				args.clarifications = extracted.clarifications;
				hasClarifications = true;
			}
			if (!hasMeta && this.isRecord(extracted.meta)) {
				args.meta = extracted.meta;
				hasMeta = true;
			}

			if (
				hasProject &&
				hasEntities &&
				hasRelationships &&
				hasContextDocument &&
				hasClarifications &&
				hasMeta
			) {
				break;
			}
		}
	}

	private extractCreateOntoProjectArgs(
		value: unknown,
		visited: Set<unknown> = new Set()
	): Record<string, any> | undefined {
		if (!value || typeof value !== 'object') {
			return undefined;
		}

		if (visited.has(value)) {
			return undefined;
		}
		visited.add(value);

		if (Array.isArray(value)) {
			for (const item of value) {
				const extracted = this.extractCreateOntoProjectArgs(item, visited);
				if (extracted) {
					return extracted;
				}
			}
			return undefined;
		}

		const candidate = value as Record<string, any>;
		const direct = this.pickCreateOntoProjectArgs(candidate);
		if (direct) {
			return direct;
		}

		const nestedKeys = [
			'project_spec',
			'projectSpec',
			'projectSpecArgs',
			'projectSpecPayload',
			'spec',
			'payload',
			'data',
			'result'
		];

		for (const key of nestedKeys) {
			if (!(key in candidate)) {
				continue;
			}
			const extracted = this.extractCreateOntoProjectArgs(candidate[key], visited);
			if (extracted) {
				return extracted;
			}
		}

		return undefined;
	}

	private pickCreateOntoProjectArgs(
		candidate: Record<string, any>
	): Record<string, any> | undefined {
		const extracted: Record<string, any> = {};

		if (this.isRecord(candidate.project)) {
			extracted.project = candidate.project;
		}
		if (Array.isArray(candidate.entities)) {
			extracted.entities = candidate.entities;
		}
		if (Array.isArray(candidate.relationships)) {
			extracted.relationships = candidate.relationships;
		}

		const contextDocument = this.isRecord(candidate.context_document)
			? candidate.context_document
			: this.isRecord(candidate.contextDocument)
				? candidate.contextDocument
				: undefined;
		if (contextDocument) {
			extracted.context_document = contextDocument;
		}

		if (Array.isArray(candidate.clarifications)) {
			extracted.clarifications = candidate.clarifications;
		}
		if (this.isRecord(candidate.meta)) {
			extracted.meta = candidate.meta;
		}

		return Object.keys(extracted).length > 0 ? extracted : undefined;
	}

	private getToolDefinition(
		toolName: string,
		plannerContext: PlannerContext
	): ChatToolDefinition | undefined {
		return plannerContext.availableTools.find((tool) => {
			const name = (tool as any).function?.name ?? (tool as any).name;
			return name === toolName;
		});
	}

	private getToolParameterSchema(
		toolName: string,
		plannerContext: PlannerContext
	): Record<string, any> | undefined {
		const toolDef = this.getToolDefinition(toolName, plannerContext);
		if (!toolDef) {
			return undefined;
		}
		return (toolDef as any).function?.parameters || (toolDef as any).parameters;
	}

	private getProjectIdSupport(
		toolName: string,
		plannerContext: PlannerContext
	): { supports: boolean; requires: boolean } {
		const paramSchema = this.getToolParameterSchema(toolName, plannerContext);
		if (paramSchema && typeof paramSchema === 'object') {
			const required = Array.isArray(paramSchema.required) ? paramSchema.required : [];
			const supports =
				'project_id' in (paramSchema.properties ?? {}) || required.includes('project_id');
			return { supports, requires: required.includes('project_id') };
		}

		const fallback = PlanOrchestrator.PROJECT_CONTEXT_TOOLS.has(toolName);
		return { supports: fallback, requires: fallback };
	}

	private applyToolArgumentDefaults(
		toolName: string,
		args: Record<string, any>,
		step: PlanStep,
		plannerContext: PlannerContext
	): Record<string, any> {
		const paramSchema = this.getToolParameterSchema(toolName, plannerContext);
		if (!paramSchema) {
			return args;
		}

		const required = Array.isArray(paramSchema?.required) ? paramSchema.required : [];
		if (required.length === 0) {
			return args;
		}

		const resolved = { ...args };
		const fallbackTitle = this.buildFallbackTitle(step);
		const properties = paramSchema.properties ?? {};

		for (const requiredParam of required) {
			if (resolved[requiredParam] !== undefined && resolved[requiredParam] !== null) {
				continue;
			}

			const paramDef = properties[requiredParam];
			if (paramDef && typeof paramDef === 'object' && 'default' in paramDef) {
				const defaultValue = (paramDef as Record<string, any>).default;
				if (Array.isArray(defaultValue)) {
					resolved[requiredParam] = [...defaultValue];
				} else if (this.isRecord(defaultValue)) {
					resolved[requiredParam] = { ...defaultValue };
				} else if (defaultValue !== undefined) {
					resolved[requiredParam] = defaultValue;
				}
				continue;
			}

			if (requiredParam === 'title' || requiredParam === 'name') {
				if (fallbackTitle) {
					resolved[requiredParam] = fallbackTitle;
				}
			} else if (requiredParam === 'description' && step.description) {
				resolved[requiredParam] = step.description;
			}
		}

		if (toolName === 'create_onto_project') {
			if (!Array.isArray(resolved.entities)) {
				resolved.entities = [];
			}
			if (!Array.isArray(resolved.relationships)) {
				resolved.relationships = [];
			}
		}

		return resolved;
	}

	private buildFallbackTitle(step: PlanStep): string {
		const base = step.description?.trim() || `Step ${step.stepNumber}`;
		if (base.length <= 120) {
			return base;
		}
		return `${base.slice(0, 117)}...`;
	}

	private toolRequiresProjectId(toolName: string, plannerContext?: PlannerContext): boolean {
		if (plannerContext) {
			return this.getProjectIdSupport(toolName, plannerContext).requires;
		}
		return PlanOrchestrator.PROJECT_CONTEXT_TOOLS.has(toolName);
	}

	private resolveProjectId(
		step: PlanStep,
		stepResults: Map<number, any>,
		context: ServiceContext
	): string | undefined {
		const metaProjectId = this.normalizeProjectId(step.metadata?.projectId);
		if (metaProjectId) {
			return metaProjectId;
		}

		const scopedProjectId = this.normalizeProjectId(context.contextScope?.projectId);
		if (scopedProjectId) {
			return scopedProjectId;
		}

		if (context.contextType === 'project' && context.entityId) {
			const contextProjectId = this.normalizeProjectId(context.entityId);
			if (contextProjectId) {
				return contextProjectId;
			}
		}

		const focusProjectId = this.normalizeProjectId(context.projectFocus?.projectId);
		if (focusProjectId) {
			return focusProjectId;
		}

		if (step.dependsOn) {
			for (const dep of step.dependsOn) {
				const depResult = stepResults.get(dep);
				const candidate = this.extractProjectIdFromResult(depResult);
				if (candidate) {
					return candidate;
				}
			}
		}

		return undefined;
	}

	private extractProjectIdFromResult(result: any): string | undefined {
		if (!result) {
			return undefined;
		}

		if (typeof result === 'string') {
			return this.normalizeProjectId(result);
		}

		if (Array.isArray(result)) {
			for (const item of result) {
				const candidate = this.extractProjectIdFromResult(item);
				if (candidate) {
					return candidate;
				}
			}
			return undefined;
		}

		if (typeof result === 'object') {
			const nestedKeys = ['project_id', 'id'];
			for (const key of nestedKeys) {
				if (key in result) {
					const candidate = this.normalizeProjectId((result as Record<string, any>)[key]);
					if (candidate) {
						if (key === 'id' && !this.looksLikeProject(result as Record<string, any>)) {
							// Skip ambiguous ids unless object looks like a project
							continue;
						}
						return candidate;
					}
				}
			}

			const deeperKeys = ['project', 'projects', 'data', 'result', 'items'];
			for (const key of deeperKeys) {
				const nested = (result as Record<string, any>)[key];
				const candidate = this.extractProjectIdFromResult(nested);
				if (candidate) {
					return candidate;
				}
			}
		}

		return undefined;
	}

	private normalizeProjectId(value: any): string | undefined {
		if (typeof value !== 'string') {
			return undefined;
		}
		const trimmed = value.trim();
		if (!trimmed) {
			return undefined;
		}
		return uuidValidate(trimmed) ? trimmed : undefined;
	}

	private looksLikeProject(value: Record<string, any>): boolean {
		const projectHints = ['phases', 'dimensions', 'status', 'workspace_id'];
		return projectHints.some((hint) => hint in value);
	}

	private isRecord(value: unknown): value is Record<string, any> {
		return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
	}

	/**
	 * Check if plan has circular dependencies
	 */
	private hasCircularDependencies(plan: AgentPlan): boolean {
		const visited = new Set<number>();
		const visiting = new Set<number>();

		const hasCycle = (stepNumber: number): boolean => {
			if (visiting.has(stepNumber)) return true;
			if (visited.has(stepNumber)) return false;

			visiting.add(stepNumber);

			const step = plan.steps.find((s) => s.stepNumber === stepNumber);
			if (step?.dependsOn) {
				for (const dep of step.dependsOn) {
					if (hasCycle(dep)) return true;
				}
			}

			visiting.delete(stepNumber);
			visited.add(stepNumber);
			return false;
		};

		for (const step of plan.steps) {
			if (hasCycle(step.stepNumber)) return true;
		}

		return false;
	}

	/**
	 * Estimate duration for plan
	 */
	private estimateDuration(steps: any[]): number {
		// Simple heuristic: 2 seconds per tool, 5 seconds per executor
		let duration = 0;
		for (const step of steps) {
			if (step.executorRequired) {
				duration += 5000;
			} else if (step.tools && step.tools.length > 0) {
				duration += step.tools.length * 2000;
			} else {
				duration += 1000;
			}
		}
		return duration;
	}

	/**
	 * Check if should stop on failure
	 */
	private shouldStopOnFailure(step: PlanStep, plan: AgentPlan): boolean {
		// Check if other steps depend on this one
		const hasDependents = plan.steps.some(
			(s) => s.dependsOn && s.dependsOn.includes(step.stepNumber)
		);

		// Stop if critical step or has dependents
		return step.type === 'research' || hasDependents;
	}

	/**
	 * Update plan status in database
	 */
	private mapPlanStatusForPersistence(status: AgentPlan['status']): {
		status: 'pending' | 'executing' | 'completed' | 'failed';
		metadataPatch?: Record<string, any>;
	} {
		switch (status) {
			case 'pending_review':
				return {
					status: 'pending',
					metadataPatch: { review_status: 'pending_review' }
				};
			case 'completed_with_errors':
				return {
					status: 'completed',
					metadataPatch: { has_errors: true, completion_status: 'completed_with_errors' }
				};
			default:
				return { status: status as 'pending' | 'executing' | 'completed' | 'failed' };
		}
	}

	private async updatePlanStatus(
		planId: string,
		status: AgentPlan['status'],
		completedAt?: Date,
		metadata?: AgentPlan['metadata']
	): Promise<void> {
		const { status: persistedStatus, metadataPatch } = this.mapPlanStatusForPersistence(status);
		const mergedMetadata = metadataPatch ? { ...(metadata ?? {}), ...metadataPatch } : metadata;

		const updateData: Record<string, any> = {
			status: persistedStatus,
			completed_at: completedAt?.toISOString()
		};
		if (mergedMetadata) {
			updateData.metadata = mergedMetadata;
		}

		await this.persistenceService.updatePlan(planId, updateData);
	}

	private accumulateTokensFromEvents(plan: AgentPlan, events: StreamEvent[]): void {
		if (!events.length) {
			return;
		}

		let totalTokens = plan.metadata?.totalTokensUsed ?? 0;
		let delta = 0;

		for (const event of events) {
			if (event.type === 'tool_result') {
				const tokensUsed =
					event.result.tokensUsed ??
					this.extractTokensFromMetadata(event.result.metadata);
				if (typeof tokensUsed === 'number') {
					delta += tokensUsed;
				}
			}

			if (event.type === 'executor_result') {
				const tokensUsed =
					event.result.metadata?.tokensUsed ??
					this.extractTokensFromMetadata(event.result.metadata);
				if (typeof tokensUsed === 'number') {
					delta += tokensUsed;
				}
			}
		}

		if (delta > 0) {
			totalTokens += delta;
			plan.metadata = {
				...(plan.metadata ?? {}),
				totalTokensUsed: totalTokens
			};
		}
	}

	private extractTokensFromMetadata(metadata?: Record<string, any>): number | undefined {
		if (!metadata || typeof metadata !== 'object') {
			return undefined;
		}

		const candidates: Array<number | undefined> = [
			metadata.tokensUsed,
			metadata.tokens_used,
			metadata.usage?.total_tokens,
			metadata.usage?.totalTokens
		];

		for (const value of candidates) {
			if (typeof value === 'number' && Number.isFinite(value)) {
				return value;
			}
		}

		return undefined;
	}

	private formatPlanExecutionError(error: unknown): string {
		const fallback = this.extractErrorMessage(error) || 'Plan execution failed';
		if (!(error instanceof PlanExecutionError)) {
			return fallback;
		}

		const details = error.details ?? {};
		const typedDetails = details as Record<string, any>;
		const step = typedDetails.step as PlanStep | undefined;
		const stepNumber =
			typeof typedDetails.stepNumber === 'number'
				? typedDetails.stepNumber
				: step?.stepNumber;
		const stepDescription =
			typeof typedDetails.stepDescription === 'string'
				? typedDetails.stepDescription
				: step?.description;
		const rootError = this.extractErrorMessage(typedDetails.error);
		const baseMessage = error.message || fallback;
		const stepLabel =
			stepNumber !== undefined
				? `Step ${stepNumber}${stepDescription ? `: ${stepDescription}` : ''}`
				: undefined;

		if (stepLabel) {
			const messageWithStep = `${baseMessage} (${stepLabel})`;
			if (rootError && rootError !== baseMessage) {
				return `${messageWithStep} - ${rootError}`;
			}
			return messageWithStep;
		}

		if (rootError && rootError !== baseMessage) {
			return `${baseMessage} - ${rootError}`;
		}

		return baseMessage || fallback;
	}

	private extractErrorMessage(error: unknown): string {
		if (!error) {
			return '';
		}

		if (error instanceof Error && error.message) {
			return error.message;
		}

		if (typeof error === 'string') {
			return error;
		}

		if (typeof error === 'object') {
			const message = (error as { message?: unknown }).message;
			if (typeof message === 'string') {
				return message;
			}
			try {
				return JSON.stringify(error);
			} catch {
				return String(error);
			}
		}

		return String(error);
	}

	private inferFieldInfoEntityType(context: ServiceContext): string {
		const focusType = context.projectFocus?.focusType;
		if (focusType && focusType !== 'project-wide') {
			switch (focusType) {
				case 'task':
					return 'ontology_task';
				case 'goal':
					return 'ontology_goal';
				case 'plan':
					return 'ontology_plan';
			}
		}

		switch (context.contextType) {
			case 'project':
			case 'project_create':
			case 'project_audit':
			case 'project_forecast':
				return 'ontology_project';
			case 'calendar':
				return 'ontology_plan';
			default:
				return 'ontology_project';
		}
	}
}
