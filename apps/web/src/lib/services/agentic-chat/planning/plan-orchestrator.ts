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
	ExecutorSpawnParams
} from '../shared/types';
import { PlanExecutionError } from '../shared/types';
import { ChatStrategy } from '$lib/types/agent-chat-enhancement';
import type { ChatToolCall } from '@buildos/shared-types';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';

/**
 * Tool executor function type
 */
export type ToolExecutorFunction = (
	toolName: string,
	args: Record<string, any>,
	context: ServiceContext
) => Promise<any>;

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
	}): Promise<string>;
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

/**
 * Service for creating and orchestrating plans
 */
export class PlanOrchestrator implements BaseService {
	private static readonly PROJECT_CONTEXT_TOOLS = new Set([
		'get_onto_project_details',
		'list_onto_tasks',
		'list_onto_goals',
		'list_onto_plans',
		'create_onto_task',
		'create_onto_goal',
		'create_onto_plan',
		'update_onto_project'
	]);

	constructor(
		private llmService: LLMService,
		private toolExecutor: ToolExecutorFunction,
		private executorCoordinator: ExecutorCoordinator,
		private persistenceService: PersistenceService
	) {}

	/**
	 * Create an execution plan
	 */
	async createPlan(
		userMessage: string,
		strategy: ChatStrategy,
		plannerContext: PlannerContext,
		context: ServiceContext
	): Promise<AgentPlan> {
		console.log('[PlanOrchestrator] Creating plan', {
			strategy,
			contextType: context.contextType,
			toolCount: plannerContext.availableTools.length
		});

		const plannerAgentId = context.plannerAgentId ?? plannerContext.metadata?.plannerAgentId;

		if (!plannerAgentId) {
			throw new PlanExecutionError('Missing planner agent identifier for plan creation', {
				context,
				plannerContext
			});
		}

		try {
			// Generate plan using LLM
			const planData = await this.generatePlanWithLLM(
				userMessage,
				strategy,
				plannerContext,
				context
			);

			// Create plan structure
			const plan: AgentPlan = {
				id: uuidv4(),
				sessionId: context.sessionId,
				userId: context.userId,
				plannerAgentId,
				userMessage,
				strategy,
				status: 'pending',
				steps: this.normalizeSteps(planData.steps),
				createdAt: new Date(),
				metadata: {
					estimatedDuration: this.estimateDuration(planData.steps),
					totalTokensUsed: 0
				}
			};

			// Validate plan
			const validation = this.validatePlan(plan);
			if (!validation.isValid) {
				throw new PlanExecutionError(
					`Invalid plan generated: ${validation.errors.join('; ')}`,
					{ plan, errors: validation.errors }
				);
			}

			// Save to database
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
			console.error('[PlanOrchestrator] Failed to create plan:', error);
			throw new PlanExecutionError(
				`Failed to create plan: ${error instanceof Error ? error.message : 'Unknown error'}`,
				{ userMessage, strategy, error }
			);
		}
	}

	/**
	 * Execute a plan
	 */
	async *executePlan(
		plan: AgentPlan,
		plannerContext: PlannerContext,
		context: ServiceContext,
		callback: StreamCallback
	): AsyncGenerator<StreamEvent, void, unknown> {
		console.log('[PlanOrchestrator] Executing plan', {
			planId: plan.id,
			stepCount: plan.steps.length,
			strategy: plan.strategy
		});

		// Update plan status
		plan.status = 'executing';
		await this.updatePlanStatus(plan.id, 'executing');

		// Track completed steps
		const completedSteps = new Set<number>();
		const stepResults = new Map<number, any>();

		try {
			// Execute steps
			for (const step of plan.steps) {
				// Check dependencies
				if (!this.canExecuteStep(step, completedSteps)) {
					console.log('[PlanOrchestrator] Skipping step due to unmet dependencies', {
						step: step.stepNumber,
						dependencies: step.dependsOn
					});
					continue;
				}

				// Emit step start event
				const startEvent: StreamEvent = {
					type: 'step_start',
					step
				};
				yield startEvent;
				await callback(startEvent);

				try {
					// Execute step
					const { result, events: internalEvents } = await this.executeStep(
						step,
						plan,
						plannerContext,
						context,
						stepResults
					);

					for (const internalEvent of internalEvents) {
						yield internalEvent;
						await callback(internalEvent);
					}

					// Update step status
					step.status = 'completed';
					step.result = result;
					stepResults.set(step.stepNumber, result);
					completedSteps.add(step.stepNumber);

					// Emit step complete event
					const completeEvent: StreamEvent = {
						type: 'step_complete',
						step
					};
					yield completeEvent;
					await callback(completeEvent);

					// Update plan in database
					await this.persistenceService.updatePlanStep(plan.id, step.stepNumber, step);
				} catch (error) {
					// Handle step failure
					step.status = 'failed';
					step.error = error instanceof Error ? error.message : String(error);

					// Emit step complete with error
					const errorEvent: StreamEvent = {
						type: 'step_complete',
						step
					};
					yield errorEvent;
					await callback(errorEvent);

					// Update plan in database
					await this.persistenceService.updatePlanStep(plan.id, step.stepNumber, step);

					// Check if we should continue
					if (this.shouldStopOnFailure(step, plan)) {
						throw new PlanExecutionError(
							`Critical step ${step.stepNumber} failed: ${step.error}`,
							{ plan, step, error }
						);
					}
				}
			}

			// Mark plan as completed
			plan.status = 'completed';
			plan.completedAt = new Date();
			await this.updatePlanStatus(plan.id, 'completed', plan.completedAt);

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
			// Mark plan as failed
			plan.status = 'failed';
			await this.updatePlanStatus(plan.id, 'failed');

			// Emit error event
			const errorEvent: StreamEvent = {
				type: 'error',
				error: error instanceof Error ? error.message : 'Plan execution failed'
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
		console.log('[PlanOrchestrator] Optimizing plan', {
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
	private async generatePlanWithLLM(
		userMessage: string,
		strategy: ChatStrategy,
		plannerContext: PlannerContext,
		context: ServiceContext
	): Promise<{ steps: any[]; reasoning?: string }> {
		const systemPrompt = this.buildPlanSystemPrompt(strategy, plannerContext, context);
		const prompt = this.buildPlanPrompt(userMessage, plannerContext);

		const response = await this.llmService.generateText({
			systemPrompt,
			prompt,
			temperature: 0.4,
			maxTokens: 1500,
			userId: context.userId,
			operationType: 'plan_generation'
		});

		try {
			// Extract JSON from markdown code blocks if present
			let jsonString = response.trim();
			if (jsonString.startsWith('```json')) {
				// Remove opening ```json and closing ```
				jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
			} else if (jsonString.startsWith('```')) {
				// Remove opening ``` and closing ```
				jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
			}
			return JSON.parse(jsonString);
		} catch (error) {
			console.error('[PlanOrchestrator] Failed to parse plan response:', error);
			console.error('[PlanOrchestrator] Raw response:', response);
			throw new Error('Invalid plan format from LLM');
		}
	}

	/**
	 * Build system prompt for plan generation
	 */
	private buildPlanSystemPrompt(
		strategy: ChatStrategy,
		plannerContext: PlannerContext,
		context: ServiceContext
	): string {
		const toolList = plannerContext.availableTools
			.map((t) => (t as any).name || (t as any).function?.name || 'unknown')
			.join(', ');

		return `You are a plan generator for BuildOS chat.
Strategy: ${strategy}
Context type: ${context.contextType}
Available tools: ${toolList}

Create a step-by-step execution plan.

Each step should have:
- stepNumber: Sequential number
- type: "research", "action", "analysis", or "synthesis"
- description: Clear description of what the step does
- tools: Array of tool names to use
- executorRequired: Boolean - true if step needs an executor agent
- dependsOn: Array of step numbers this step depends on (optional)

Guidelines:
- Keep plans minimal and focused
- Mark steps as executorRequired only for complex analysis
- Use dependencies to ensure proper execution order
- For simple_research strategy, keep to 1-2 steps
- For complex_research, can have multiple coordinated steps

Return JSON: { steps: [...], reasoning: "Brief explanation" }`;
	}

	/**
	 * Build prompt for plan generation
	 */
	private buildPlanPrompt(userMessage: string, plannerContext: PlannerContext): string {
		return `User request: "${userMessage}"

Context: ${plannerContext.locationContext}
${plannerContext.ontologyContext ? `Ontology available: ${JSON.stringify(plannerContext.ontologyContext.metadata)}` : ''}

Generate an execution plan to fulfill this request.`;
	}

	/**
	 * Normalize plan steps
	 */
	private normalizeSteps(steps: any[]): PlanStep[] {
		return steps.map((step, index) => ({
			stepNumber: step.stepNumber || index + 1,
			type: step.type || 'research',
			description: step.description || `Step ${index + 1}`,
			executorRequired: !!step.executorRequired,
			tools: Array.isArray(step.tools) ? step.tools : [],
			dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn : undefined,
			status: 'pending',
			metadata: step.metadata
		}));
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
		console.log('[PlanOrchestrator] Executing step', {
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
				const errorMessage = result.error instanceof Error ? result.error.message : String(result.error || 'Executor failed');
				throw new Error(errorMessage);
			}

			return { result: result.data, events: emittedEvents };
		} else if (step.tools.length > 0) {
			// Execute tools directly with streaming events
			const aggregatedResults: any[] = [];

			for (const toolName of step.tools) {
				const args = this.buildToolArgs(toolName, step, stepResults, context);

				const toolCall: ChatToolCall = {
					id: uuidv4(),
					type: 'function',
					function: {
						name: toolName,
						arguments: JSON.stringify(args ?? {})
					}
				};

				const callEvent: StreamEvent = {
					type: 'tool_call',
					toolCall
				};
				emittedEvents.push(callEvent);

				try {
					const result = await this.toolExecutor(toolName, args, context);
					const toolResult: ToolExecutionResult = {
						success: true,
						data: result,
						toolName,
						toolCallId: toolCall.id
					};

					const resultEvent: StreamEvent = {
						type: 'tool_result',
						result: toolResult
					};
					emittedEvents.push(resultEvent);

					aggregatedResults.push(result);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					const toolResult: ToolExecutionResult = {
						success: false,
						error: message,
						toolName,
						toolCallId: toolCall.id
					};

					const resultEvent: StreamEvent = {
						type: 'tool_result',
						result: toolResult
					};
					emittedEvents.push(resultEvent);

					throw error;
				}
			}

			// Return combined results (preserve original shape for downstream steps)
			const resultPayload = aggregatedResults.length === 1 ? aggregatedResults[0] : aggregatedResults;
			return { result: resultPayload, events: emittedEvents };
		} else {
			// No execution needed
			return { result: { completed: true }, events: emittedEvents };
		}
	}

	/**
	 * Build tool arguments from context
	 */
	private buildToolArgs(
		toolName: string,
		step: PlanStep,
		stepResults: Map<number, any>,
		context: ServiceContext
	): Record<string, any> {
		// Extract relevant data from previous steps
		const args: Record<string, any> = {
			...(step.metadata?.toolArguments ?? {}),
			...(step.metadata?.arguments ?? {})
		};

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

		if (!args.project_id && this.toolRequiresProjectId(toolName)) {
			const projectId = this.resolveProjectId(step, stepResults, context);
			if (projectId) {
				args.project_id = projectId;
			}
		}

		const requiresProject = this.toolRequiresProjectId(toolName);
		if (requiresProject && args.project_id) {
			const normalized = this.normalizeProjectId(args.project_id);
			if (normalized) {
				args.project_id = normalized;
			} else {
				delete args.project_id;
			}
		}

		if (requiresProject && !args.project_id) {
			throw new Error(
				`Missing project context for tool ${toolName}. Provide project_id in plan metadata or ensure dependencies return a project id.`
			);
		}

		return args;
	}

	private toolRequiresProjectId(toolName: string): boolean {
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

		if (context.contextType === 'project' && context.entityId) {
			const contextProjectId = this.normalizeProjectId(context.entityId);
			if (contextProjectId) {
				return contextProjectId;
			}
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
	private async updatePlanStatus(
		planId: string,
		status: string,
		completedAt?: Date
	): Promise<void> {
		await this.persistenceService.updatePlan(planId, {
			status,
			completed_at: completedAt?.toISOString()
		});
	}
}
