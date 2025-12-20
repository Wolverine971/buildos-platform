// apps/web/src/lib/services/agentic-chat/execution/executor-coordinator.ts
/**
 * Executor Coordinator Service
 *
 * Coordinates executor agents for complex plan steps. Responsibilities include:
 * - Spawning executor agent records with appropriate capabilities
 * - Dispatching tasks to the AgentExecutorService
 * - Tracking in-flight executor runs and returning structured results
 * - Updating persistence status on completion or failure
 *
 * @see {@link /apps/web/docs/features/agentic-chat/REFACTORING_SPEC.md}
 */

import { v4 as uuidv4 } from 'uuid';
import type {
	ExecutorResult,
	ExecutorSpawnParams,
	PersistenceOperations,
	ServiceContext
} from '../shared/types';
import { PlanExecutionError } from '../shared/types';
import type { AgentPermission, ChatToolDefinition } from '@buildos/shared-types';
import type {
	AgentExecutorService,
	ExecuteTaskParams,
	ExecutorResult as AgentExecutorRunResult
} from '../../agent-executor-service';
import type { ExecutorTask } from '../../agent-context-service';
import { TOOL_METADATA } from '../tools/core/definitions';

/**
 * Configuration options for the executor coordinator
 */
export interface ExecutorCoordinatorOptions {
	/**
	 * Default LLM model used for executor agents
	 */
	defaultExecutorModel?: string;

	/**
	 * Default system prompt applied to executor agents when none provided
	 */
	defaultSystemPrompt?: string;

	/**
	 * Maximum number of executors that can run concurrently
	 * (not currently enforced – reserved for future enhancements)
	 */
	maxConcurrency?: number;
}

const DEFAULT_EXECUTOR_MODEL = 'deepseek/deepseek-coder';
const DEFAULT_EXECUTOR_PROMPT =
	'You are a BuildOS executor agent focused on completing a single, well-defined task. Use only the provided tools and return concise, structured results.';

/**
 * Coordinator responsible for managing executor agents
 */
export class ExecutorCoordinator {
	private activeExecutors = new Map<string, Promise<ExecutorResult>>();

	constructor(
		private executorService: AgentExecutorService,
		private persistenceService: PersistenceOperations,
		private options: ExecutorCoordinatorOptions = {}
	) {}

	/**
	 * Spawn a new executor agent for the provided plan step
	 */
	async spawnExecutor(params: ExecutorSpawnParams, context: ServiceContext): Promise<string> {
		const resolvedTools = this.resolveTools(
			params.step.tools,
			params.plannerContext.availableTools
		);
		const permissions = this.resolveExecutorPermissions(params.step.tools, resolvedTools);
		const tools = this.filterToolsForPermission(resolvedTools, permissions);

		if (tools.length === 0) {
			console.warn(
				'[ExecutorCoordinator] No tools resolved for executor step',
				params.step.tools
			);
		}

		const executorSystemPrompt =
			this.options.defaultSystemPrompt ??
			this.buildExecutorPrompt(
				params,
				context,
				tools.map((tool) => this.getToolName(tool))
			);

		const executorAgentId = await this.createExecutorAgentRecord(
			params,
			context,
			tools,
			permissions,
			executorSystemPrompt
		);

		const executorTask = this.buildExecutorTask(params, context);

		const executionPromise = this.runExecutor(
			{
				executorId: executorAgentId,
				sessionId: context.sessionId,
				userId: context.userId,
				task: executorTask,
				tools,
				planId: params.plan.id,
				stepNumber: params.step.stepNumber,
				plannerAgentId: context.plannerAgentId,
				contextType: context.contextType,
				entityId: context.entityId
			},
			params
		);

		this.activeExecutors.set(executorAgentId, executionPromise);
		return executorAgentId;
	}

	/**
	 * Wait for an executor to finish and return the final result
	 */
	async waitForExecutor(executorId: string): Promise<ExecutorResult> {
		const execution = this.activeExecutors.get(executorId);

		if (!execution) {
			throw new PlanExecutionError(`Executor ${executorId} not found`, { executorId });
		}

		try {
			return await execution;
		} finally {
			this.activeExecutors.delete(executorId);
		}
	}

	/**
	 * Resolve tool definitions for executor usage
	 */
	private resolveTools(
		toolNames: string[],
		availableTools: ChatToolDefinition[]
	): ChatToolDefinition[] {
		if (!toolNames || toolNames.length === 0) {
			return [];
		}

		return toolNames
			.map((toolName) =>
				availableTools.find(
					(tool) =>
						this.getToolName(tool) === toolName ||
						// Some configurations expose `function.name`
						(tool as any)?.function?.name === toolName
				)
			)
			.filter((tool): tool is ChatToolDefinition => !!tool);
	}

	/**
	 * Create executor agent record in persistence layer
	 */
	private async createExecutorAgentRecord(
		params: ExecutorSpawnParams,
		context: ServiceContext,
		tools: ChatToolDefinition[],
		permissions: AgentPermission,
		systemPrompt: string
	): Promise<string> {
		const executorName = `Executor-${params.plan.id.slice(0, 8)}-S${params.step.stepNumber}`;

		const agentData = {
			type: 'executor' as const,
			name: executorName,
			model_preference: this.options.defaultExecutorModel ?? DEFAULT_EXECUTOR_MODEL,
			available_tools: tools.map((tool) => this.getToolName(tool)),
			permissions,
			system_prompt: systemPrompt,
			created_for_session: context.sessionId,
			created_for_plan: params.plan.id,
			user_id: context.userId,
			status: 'active' as const
		};

		try {
			return await this.persistenceService.createAgent(agentData);
		} catch (error) {
			throw new PlanExecutionError('Failed to persist executor agent record', {
				error,
				stepNumber: params.step.stepNumber
			});
		}
	}

	/**
	 * Build executor task payload
	 */
	private buildExecutorTask(params: ExecutorSpawnParams, context: ServiceContext): ExecutorTask {
		const contextData = Object.fromEntries(params.previousStepResults.entries());

		return {
			id: `${params.plan.id}-step-${params.step.stepNumber}-${uuidv4()}`,
			description: params.step.description,
			goal: `Complete plan step ${params.step.stepNumber} for strategy ${params.plan.strategy}`,
			constraints: this.buildConstraints(params),
			contextData: {
				...contextData,
				planId: params.plan.id,
				stepNumber: params.step.stepNumber,
				contextType: context.contextType,
				entityId: context.entityId
			}
		};
	}

	/**
	 * Build execution constraints for the executor task
	 */
	private buildConstraints(params: ExecutorSpawnParams): string[] {
		const constraints: string[] = [];

		if (params.step.dependsOn && params.step.dependsOn.length > 0) {
			constraints.push(
				`Incorporate outputs from plan steps ${params.step.dependsOn.join(', ')}`
			);
		}

		if (params.step.tools.length > 0) {
			constraints.push(
				`Use only the assigned tools: ${params.step.tools
					.map((tool) => `\`${tool}\``)
					.join(', ')}`
			);
		} else {
			constraints.push('Use reasoning and summarization without additional tools');
		}

		constraints.push('Return structured JSON data that can be used by subsequent plan steps');

		return constraints;
	}

	/**
	 * Execute the task and update persistence
	 */
	private async runExecutor(
		params: ExecuteTaskParams,
		spawnParams: ExecutorSpawnParams
	): Promise<ExecutorResult> {
		try {
			const result = await this.executorService.executeTask(params);
			await this.updateExecutorStatus(params.executorId, result);

			return this.mapExecutorResult(params, result);
		} catch (error) {
			const failure: AgentExecutorRunResult = {
				executorId: params.executorId,
				success: false,
				error: error instanceof Error ? error.message : 'Executor failed',
				data: undefined,
				durationMs: 0,
				tokensUsed: 0,
				toolCallsMade: 0
			};

			await this.updateExecutorStatus(params.executorId, failure);

			return this.mapExecutorResult(params, failure);
		}
	}

	/**
	 * Update executor agent status in persistence
	 */
	private async updateExecutorStatus(
		executorId: string,
		result: AgentExecutorRunResult
	): Promise<void> {
		try {
			await this.persistenceService.updateAgent(executorId, {
				status: result.success ? 'completed' : 'failed',
				completed_at: new Date().toISOString()
			});
		} catch (error) {
			console.warn('[ExecutorCoordinator] Failed to update executor status', {
				executorId,
				error
			});
		}
	}

	/**
	 * Map AgentExecutorService result into shared ExecutorResult format
	 */
	private mapExecutorResult(
		params: ExecuteTaskParams,
		result: AgentExecutorRunResult
	): ExecutorResult {
		return {
			executorId: params.executorId,
			taskId: params.task.id,
			success: result.success,
			data: result.data,
			error: result.error,
			duration: result.durationMs,
			metadata: {
				tokensUsed: result.tokensUsed,
				toolCallsMade: result.toolCallsMade
			}
		};
	}

	/**
	 * Derive a human-readable tool name from definition
	 */
	private getToolName(tool: ChatToolDefinition): string {
		if ((tool as any)?.function?.name) {
			return (tool as any).function.name;
		}
		return (tool as any).name;
	}

	private resolveExecutorPermissions(
		toolNames: string[],
		tools: ChatToolDefinition[]
	): AgentPermission {
		const hasWriteToolName = toolNames.some((toolName) => this.isWriteToolName(toolName));
		if (hasWriteToolName) {
			return 'read_write';
		}

		const hasWriteTool = tools.some((tool) => this.isWriteToolName(this.getToolName(tool)));
		return hasWriteTool ? 'read_write' : 'read_only';
	}

	private filterToolsForPermission(
		tools: ChatToolDefinition[],
		permissions: AgentPermission
	): ChatToolDefinition[] {
		if (permissions === 'read_write') {
			return tools;
		}

		return tools.filter((tool) => !this.isWriteToolName(this.getToolName(tool)));
	}

	private isWriteToolName(toolName: string): boolean {
		return TOOL_METADATA[toolName]?.category === 'write';
	}

	/**
	 * Build executor system prompt
	 */
	private buildExecutorPrompt(
		params: ExecutorSpawnParams,
		context: ServiceContext,
		tools: string[]
	): string {
		const basePrompt = this.options.defaultSystemPrompt ?? DEFAULT_EXECUTOR_PROMPT;

		const toolList = tools.length > 0 ? tools.join(', ') : 'no explicit tools (reasoning only)';
		const dependencyInfo =
			params.step.dependsOn && params.step.dependsOn.length > 0
				? `Previous steps available: ${params.step.dependsOn.join(', ')}.`
				: 'No prior step dependencies.';

		return `${basePrompt}

Plan ID: ${params.plan.id}
Step ${params.step.stepNumber}: ${params.step.description}
Context type: ${context.contextType}${context.entityId ? ` (entity ${context.entityId})` : ''}
Allowed tools: ${toolList}
${dependencyInfo}

Return structured JSON with fields that can be used by future plan steps.`;
	}
}
