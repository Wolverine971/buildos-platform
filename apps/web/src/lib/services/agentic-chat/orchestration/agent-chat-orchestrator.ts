// apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts
/**
 * Agent Chat Orchestrator
 *
 * Coordinates the refactored agentic chat services end-to-end, including:
 * - Context initialization and planner agent provisioning
 * - Strategy analysis and streaming of intermediate events
 * - Tool execution for simple strategies
 * - Plan orchestration and executor coordination for complex strategies
 * - Response synthesis and final streaming output
 */

import { v4 as uuidv4 } from 'uuid';
import { ChatStrategy } from '../../../types/agent-chat-enhancement';
import type {
	AgentChatRequest,
	ServiceContext,
	StreamCallback,
	StreamEvent,
	PlannerContext,
	ToolExecutionResult,
	ExecutorResult,
	PersistenceOperations
} from '../shared/types';
import type { StrategyAnalyzer } from '../analysis/strategy-analyzer';
import type { PlanOrchestrator } from '../planning/plan-orchestrator';
import type { ToolExecutionService } from '../execution/tool-execution-service';
import type { ResponseSynthesizer } from '../synthesis/response-synthesizer';
import type { ExecutorCoordinator } from '../execution/executor-coordinator';
import type { AgentContextService } from '../../agent-context-service';
import type { ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';

export interface AgentChatOrchestratorDependencies {
	strategyAnalyzer: StrategyAnalyzer;
	planOrchestrator: PlanOrchestrator;
	toolExecutionService: ToolExecutionService;
	responseSynthesizer: ResponseSynthesizer;
	executorCoordinator: ExecutorCoordinator;
	persistenceService: PersistenceOperations;
	contextService: AgentContextService;
}

export class AgentChatOrchestrator {
	constructor(private deps: AgentChatOrchestratorDependencies) {}

	/**
	 * Execute the chat flow and stream events back to the caller
	 */
	async *streamConversation(
		request: AgentChatRequest,
		callback: StreamCallback
	): AsyncGenerator<StreamEvent, void, unknown> {
		const {
			strategyAnalyzer,
			planOrchestrator,
			toolExecutionService,
			responseSynthesizer,
			persistenceService,
			contextService
		} = this.deps;

		const conversationHistory = request.conversationHistory ?? [];
		let plannerContext: PlannerContext;
		let plannerAgentId: string | undefined;

		try {
			plannerContext = await contextService.buildPlannerContext({
				sessionId: request.sessionId,
				userId: request.userId,
				conversationHistory,
				userMessage: request.userMessage,
				contextType: request.contextType,
				entityId: request.entityId,
				...(request.ontologyContext ? { ontologyContext: request.ontologyContext } : {}),
				...(request.lastTurnContext ? { lastTurnContext: request.lastTurnContext } : {})
			});

			plannerAgentId = await this.createPlannerAgentRecord(
				persistenceService,
				plannerContext,
				request
			);

			// Attach planner agent metadata for downstream consumers
			plannerContext.metadata = {
				...plannerContext.metadata,
				plannerAgentId
			};

			const serviceContext: ServiceContext = {
				sessionId: request.sessionId,
				userId: request.userId,
				plannerAgentId,
				contextType: request.contextType,
				entityId: request.entityId,
				conversationHistory,
				ontologyContext: request.ontologyContext,
				lastTurnContext: request.lastTurnContext
			};

			// Emit session event if present
			if (request.chatSession) {
				const sessionEvent: StreamEvent = {
					type: 'session',
					session: request.chatSession
				};
				yield sessionEvent;
				await callback(sessionEvent);
			}

			if (request.ontologyContext) {
				const ontologyEvent: StreamEvent = {
					type: 'ontology_loaded',
					summary: `Ontology context loaded for ${request.ontologyContext.type}`
				};
				yield ontologyEvent;
				await callback(ontologyEvent);
			}

			if (request.lastTurnContext) {
				const lastTurnEvent: StreamEvent = {
					type: 'last_turn_context',
					context: request.lastTurnContext
				};
				yield lastTurnEvent;
				await callback(lastTurnEvent);
			}

			const analysis = await strategyAnalyzer.analyzeUserIntent(
				request.userMessage,
				plannerContext,
				serviceContext,
				request.lastTurnContext
			);

			const analysisEvent: StreamEvent = {
				type: 'analysis',
				analysis
			};
			yield analysisEvent;
			await callback(analysisEvent);

			const strategyEvent: StreamEvent = {
				type: 'strategy_selected',
				strategy: analysis.primary_strategy,
				confidence: analysis.confidence
			};
			yield strategyEvent;
			await callback(strategyEvent);

			switch (analysis.primary_strategy) {
				case ChatStrategy.SIMPLE_RESEARCH:
					for await (const event of this.handleSimpleStrategy(
						analysis,
						request,
						serviceContext,
						plannerContext
					)) {
						yield event;
						await callback(event);
					}
					break;

				case ChatStrategy.COMPLEX_RESEARCH:
					for await (const event of this.handleComplexStrategy(
						analysis,
						request,
						serviceContext,
						plannerContext
					)) {
						yield event;
						await callback(event);
					}
					break;

				case ChatStrategy.ASK_CLARIFYING:
				default:
					for await (const event of this.handleClarifyingStrategy(
						analysis,
						request,
						serviceContext
					)) {
						yield event;
						await callback(event);
					}
					break;
			}
		} catch (error) {
			console.error('[AgentChatOrchestrator] Error during orchestration', error);
			const message =
				error instanceof Error ? error.message : 'Unknown error during agent orchestration';
			const errorEvent: StreamEvent = { type: 'error', error: message };
			yield errorEvent;
			await callback(errorEvent);
		} finally {
			if (plannerAgentId) {
				await this.safeUpdatePlannerStatus(plannerAgentId);
			}
		}
	}

	/**
	 * Handle simple research strategy by executing tools directly
	 */
	private async *handleSimpleStrategy(
		analysis: Awaited<ReturnType<StrategyAnalyzer['analyzeUserIntent']>>,
		request: AgentChatRequest,
		serviceContext: ServiceContext,
		plannerContext: PlannerContext
	): AsyncGenerator<StreamEvent, void, unknown> {
		const { toolExecutionService, responseSynthesizer } = this.deps;
		const toolDefinitions = this.resolveTools(analysis.required_tools, plannerContext);

		const toolCalls = this.buildToolCalls(toolDefinitions, serviceContext, request.userMessage);
		const toolResults: ToolExecutionResult[] = [];

		for (const toolCall of toolCalls) {
			const callEvent: StreamEvent = { type: 'tool_call', toolCall };
			yield callEvent;

			const result = await toolExecutionService.executeTool(
				toolCall,
				serviceContext,
				plannerContext.availableTools
			);

			const resultEvent: StreamEvent = { type: 'tool_result', result };
			yield resultEvent;

			toolResults.push(result);
		}

		const responseText = await responseSynthesizer.synthesizeSimpleResponse(
			request.userMessage,
			toolResults,
			serviceContext
		);

		const textEvent: StreamEvent = { type: 'text', content: responseText };
		yield textEvent;

		const doneEvent: StreamEvent = { type: 'done' };
		yield doneEvent;
	}

	/**
	 * Handle complex research strategy via plan orchestration and executors
	 */
	private async *handleComplexStrategy(
		analysis: Awaited<ReturnType<StrategyAnalyzer['analyzeUserIntent']>>,
		request: AgentChatRequest,
		serviceContext: ServiceContext,
		plannerContext: PlannerContext
	): AsyncGenerator<StreamEvent, void, unknown> {
		const { planOrchestrator, responseSynthesizer } = this.deps;
		const executorResults: ExecutorResult[] = [];
		const collectedToolResults: ToolExecutionResult[] = [];

		const plan = await planOrchestrator.createPlan(
			request.userMessage,
			analysis.primary_strategy,
			plannerContext,
			serviceContext
		);

		const planEvent: StreamEvent = { type: 'plan_created', plan };
		yield planEvent;

		for await (const event of planOrchestrator.executePlan(
			plan,
			plannerContext,
			serviceContext,
			async () => {}
		)) {
			// Skip internal done event - orchestrator will emit final done
			if (event.type === 'done') {
				continue;
			}

			yield event;

			switch (event.type) {
				case 'executor_result':
					executorResults.push(event.result);
					break;
				case 'tool_result':
					collectedToolResults.push(event.result);
					break;
			}
		}

		const responseText = await responseSynthesizer.synthesizeComplexResponse(
			plan,
			executorResults.length > 0 ? executorResults : collectedToolResults,
			serviceContext
		);

		const textEvent: StreamEvent = { type: 'text', content: responseText };
		yield textEvent;

		const doneEvent: StreamEvent = { type: 'done' };
		yield doneEvent;
	}

	/**
	 * Handle clarifying questions strategy
	 */
	private async *handleClarifyingStrategy(
		analysis: Awaited<ReturnType<StrategyAnalyzer['analyzeUserIntent']>>,
		request: AgentChatRequest,
		serviceContext: ServiceContext
	): AsyncGenerator<StreamEvent, void, unknown> {
		const { responseSynthesizer } = this.deps;
		const questions = analysis.clarifying_questions ?? [
			'Could you clarify what you would like me to look up?'
		];

		const clarifyingEvent: StreamEvent = { type: 'clarifying_questions', questions };
		yield clarifyingEvent;

		const responseText = await responseSynthesizer.synthesizeClarifyingQuestions(
			questions,
			serviceContext
		);

		const textEvent: StreamEvent = { type: 'text', content: responseText };
		yield textEvent;

		const doneEvent: StreamEvent = { type: 'done' };
		yield doneEvent;
	}

	/**
	 * Persist planner agent record
	 */
	private async createPlannerAgentRecord(
		persistence: PersistenceOperations,
		plannerContext: PlannerContext,
		request: AgentChatRequest
	): Promise<string> {
		const agentData = {
			type: 'planner' as const,
			name: `Planner-${request.sessionId.slice(0, 8)}`,
			model_preference: 'deepseek/deepseek-chat',
			available_tools: plannerContext.availableTools.map((tool) => this.getToolName(tool)),
			permissions: 'read_write' as const,
			system_prompt: plannerContext.systemPrompt,
			created_for_session: request.sessionId,
			user_id: request.userId,
			status: 'active' as const
		};

		return persistence.createAgent(agentData);
	}

	/**
	 * Resolve tool definitions from planner context
	 */
	private resolveTools(
		requiredTools: string[] | undefined,
		plannerContext: PlannerContext
	): ChatToolDefinition[] {
		if (!requiredTools || requiredTools.length === 0) {
			return [];
		}

		return requiredTools
			.map((toolName) =>
				plannerContext.availableTools.find(
					(tool) =>
						this.getToolName(tool) === toolName ||
						(tool as any)?.function?.name === toolName
				)
			)
			.filter((tool): tool is ChatToolDefinition => !!tool);
	}

	/**
	 * Build tool calls for the strategy
	 */
	private buildToolCalls(
		tools: ChatToolDefinition[],
		context: ServiceContext,
		userMessage: string
	): ChatToolCall[] {
		return tools.map((tool) => {
			const args = this.buildToolArguments(tool, context, userMessage);

			return {
				id: uuidv4(),
				type: 'function',
				function: {
					name: this.getToolName(tool),
					arguments: JSON.stringify(args ?? {})
				}
			};
		});
	}

	/**
	 * Build tool arguments heuristically from context
	 */
	private buildToolArguments(
		tool: ChatToolDefinition,
		context: ServiceContext,
		userMessage: string
	): Record<string, unknown> {
		const params = (tool.function?.parameters?.properties ?? {}) as Record<string, unknown>;
		const args: Record<string, unknown> = {};

		if ('session_id' in params) {
			args.session_id = context.sessionId;
		}

		if ('context_type' in params) {
			args.context_type = context.contextType;
		}

		if (context.entityId) {
			if ('project_id' in params && context.contextType === 'project') {
				args.project_id = context.entityId;
			}
			if ('task_id' in params && context.contextType === 'task') {
				args.task_id = context.entityId;
			}
			if ('entity_id' in params && !args.project_id && !args.task_id) {
				args.entity_id = context.entityId;
			}
		}

		if ('query' in params && userMessage.length > 0) {
			args.query = userMessage;
		}

		return args;
	}

	private getToolName(tool: ChatToolDefinition): string {
		if ((tool as any)?.function?.name) {
			return (tool as any).function.name;
		}
		return (tool as any).name;
	}

	private async safeUpdatePlannerStatus(plannerAgentId: string): Promise<void> {
		try {
			await this.deps.persistenceService.updateAgent(plannerAgentId, { status: 'completed' });
		} catch (error) {
			console.warn('[AgentChatOrchestrator] Failed to update planner agent status', {
				plannerAgentId,
				error
			});
		}
	}
}
