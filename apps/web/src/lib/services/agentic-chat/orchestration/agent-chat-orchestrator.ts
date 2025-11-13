// apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts
import { v4 as uuidv4 } from 'uuid';
import type {
	AgentChatRequest,
	ServiceContext,
	StreamCallback,
	StreamEvent,
	PlannerContext,
	AgentPlan,
	ToolExecutionResult,
	PersistenceOperations,
	PlanExecutionMode,
	ExecutorResult
} from '../shared/types';
import type { PlanOrchestrator, PlanIntent } from '../planning/plan-orchestrator';
import type { ToolExecutionService, VirtualToolHandler } from '../execution/tool-execution-service';
import type { ResponseSynthesizer, SynthesisUsage } from '../synthesis/response-synthesizer';
import type { AgentContextService } from '../../agent-context-service';
import type {
	ChatToolCall,
	ChatToolDefinition,
	LLMMessage,
	ChatContextType,
	ChatToolResult
} from '@buildos/shared-types';
import type { TextProfile } from '../../smart-llm-service';
import { SmartLLMService } from '../../smart-llm-service';
// import type { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import type { LastTurnContext } from '$lib/types/agent-chat-enhancement';

const PLAN_TOOL_DEFINITION: ChatToolDefinition = {
	type: 'function',
	function: {
		name: 'agent_create_plan',
		description:
			'Generate a BuildOS execution plan for multi-step objectives. Can auto-execute, draft for review, or request an internal reviewer before execution.',
		parameters: {
			type: 'object',
			properties: {
				objective: {
					type: 'string',
					description: 'What you want to accomplish end-to-end.'
				},
				execution_mode: {
					type: 'string',
					enum: ['auto_execute', 'draft_only', 'agent_review'],
					description:
						'Default is auto_execute. Use draft_only to return the plan for approval, or agent_review to have a reviewer critique before execution.'
				},
				auto_execute: {
					type: 'boolean',
					description: 'Deprecated alias for execution_mode === auto_execute.'
				},
				requested_outputs: {
					type: 'array',
					items: { type: 'string' },
					description: 'Specific deliverables the user expects.'
				},
				priority_entities: {
					type: 'array',
					items: { type: 'string' },
					description: 'IDs or slugs the plan must focus on.'
				}
			},
			required: ['objective']
		}
	}
};

const MAX_TOOL_CALLS_PER_TURN = 8;
const MAX_SESSION_DURATION_MS = 90_000;

type LLMStreamEvent =
	| { type: 'text'; content?: string }
	| { type: 'tool_call'; tool_call?: ChatToolCall }
	| { type: 'done'; usage?: { total_tokens?: number } }
	| { type: 'error'; error?: string };

export interface AgentChatOrchestratorDependencies {
	planOrchestrator: PlanOrchestrator;
	toolExecutionService: ToolExecutionService;
	responseSynthesizer: ResponseSynthesizer;
	persistenceService: PersistenceOperations;
	contextService: AgentContextService;
	llmService: SmartLLMService;
	errorLogger?: ErrorLoggerService;
}

export class AgentChatOrchestrator {
	constructor(private deps: AgentChatOrchestratorDependencies) {}

	async *streamConversation(
		request: AgentChatRequest,
		callback: StreamCallback
	): AsyncGenerator<StreamEvent, void, unknown> {
		const { contextService, persistenceService } = this.deps;
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

			const messages = this.buildPlannerMessages(plannerContext, request.userMessage);

			const tools = this.appendVirtualTools(plannerContext.availableTools);
			const virtualHandlers = this.createVirtualToolHandlers({
				request,
				plannerContext,
				serviceContext
			});

			for await (const event of this.runPlannerLoop({
				request,
				messages,
				tools,
				plannerContext,
				serviceContext,
				virtualHandlers
			})) {
				yield event;
				await callback(event);
			}
		} catch (error) {
			console.error('[AgentChatOrchestrator] Error during orchestration', error);
			if (this.deps.errorLogger) {
				await this.deps.errorLogger.logError(error, {
					userId: request.userId,
					operationType: 'agent_chat_orchestration',
					metadata: {
						sessionId: request.sessionId,
						contextType: request.contextType
					}
				});
			}

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

	private buildPlannerMessages(
		plannerContext: PlannerContext,
		userMessage: string
	): LLMMessage[] {
		const messages: LLMMessage[] = [
			{ role: 'system', content: plannerContext.systemPrompt },
			{
				role: 'system',
				content: `## Context Snapshot\n${plannerContext.locationContext}`
			},
			...plannerContext.conversationHistory,
			{ role: 'user', content: userMessage }
		];

		if (plannerContext.userProfile) {
			messages.splice(1, 0, {
				role: 'system',
				content: `## User Preferences\n${plannerContext.userProfile}`
			});
		}

		return messages;
	}

	private appendVirtualTools(tools: ChatToolDefinition[]): ChatToolDefinition[] {
		const existingPlanTool = tools.find(
			(tool) => (tool as any)?.function?.name === PLAN_TOOL_DEFINITION.function.name
		);
		if (existingPlanTool) {
			return tools;
		}
		return [...tools, PLAN_TOOL_DEFINITION];
	}

	private createVirtualToolHandlers(params: {
		request: AgentChatRequest;
		plannerContext: PlannerContext;
		serviceContext: ServiceContext;
	}): Record<string, VirtualToolHandler> {
		const { request, plannerContext, serviceContext } = params;
		return {
			agent_create_plan: async ({ args }) =>
				this.handlePlanToolCall({
					rawArgs: args,
					plannerContext,
					serviceContext,
					request
				})
		};
	}

	private async *runPlannerLoop(params: {
		request: AgentChatRequest;
		messages: LLMMessage[];
		tools: ChatToolDefinition[];
		plannerContext: PlannerContext;
		serviceContext: ServiceContext;
		virtualHandlers: Record<string, VirtualToolHandler>;
	}): AsyncGenerator<StreamEvent, void, unknown> {
		const { llmService, toolExecutionService } = this.deps;
		const { request, messages, tools, serviceContext, plannerContext, virtualHandlers } =
			params;

		const startTime = Date.now();
		let toolCallCount = 0;
		let lastUsage: { total_tokens: number } | undefined;
		let continueLoop = true;

		yield this.buildAgentStateEvent(
			'thinking',
			serviceContext.contextType,
			'Analyzing request...'
		);

		while (continueLoop) {
			this.ensureWithinLimits(startTime, toolCallCount);
			let assistantBuffer = '';
			const pendingToolCalls: ChatToolCall[] = [];

			const profile = this.resolvePlannerProfile(serviceContext.contextType);

			for await (const chunk of llmService.streamText({
				messages,
				tools,
				tool_choice: 'auto',
				userId: serviceContext.userId,
				profile,
				temperature: 0.4,
				maxTokens: 1800,
				sessionId: serviceContext.sessionId,
				operationType: 'planner_stream'
			}) as AsyncGenerator<LLMStreamEvent>) {
				if (chunk.type === 'text' && chunk.content) {
					assistantBuffer += chunk.content;
					yield { type: 'text', content: chunk.content };
				} else if (chunk.type === 'tool_call' && chunk.tool_call) {
					pendingToolCalls.push(chunk.tool_call);
					yield { type: 'tool_call', toolCall: chunk.tool_call };
				} else if (chunk.type === 'done') {
					if (chunk.usage?.total_tokens) {
						lastUsage = { total_tokens: chunk.usage.total_tokens };
					}
				} else if (chunk.type === 'error') {
					throw new Error(chunk.error || 'LLM streaming error');
				}
			}

			if (pendingToolCalls.length === 0) {
				if (assistantBuffer.trim().length === 0) {
					yield { type: 'done', usage: lastUsage };
					return;
				}

				messages.push({
					role: 'assistant',
					content: assistantBuffer
				});

				yield this.buildAgentStateEvent(
					'waiting_on_user',
					serviceContext.contextType,
					'Ready for your response.'
				);
				yield { type: 'done', usage: lastUsage };
				return;
			}

			messages.push({
				role: 'assistant',
				content: assistantBuffer,
				tool_calls: pendingToolCalls
			});

			for (const toolCall of pendingToolCalls) {
				toolCallCount++;
				this.ensureWithinLimits(startTime, toolCallCount);

				const result = await toolExecutionService.executeTool(
					toolCall,
					serviceContext,
					tools,
					{
						virtualHandlers
					}
				);

				yield { type: 'tool_result', result };
				const contextShift =
					(result as any)?.context_shift ??
					result?.data?.context_shift ??
					result?.result?.context_shift;
				if (contextShift) {
					const normalizedShiftContext = this.normalizeChatContextType(
						(contextShift.new_context as ChatContextType) ?? serviceContext.contextType
					);
					serviceContext.contextType = normalizedShiftContext;
					if (contextShift.entity_id) {
						serviceContext.entityId = contextShift.entity_id;
					}
					serviceContext.lastTurnContext = this.buildContextShiftSnapshot(
						contextShift,
						normalizedShiftContext
					);
				}

				if (result.streamEvents) {
					for (const event of result.streamEvents) {
						yield event;
					}
				}

				const toolMessage: LLMMessage = {
					role: 'tool',
					content: JSON.stringify(this.normalizeToolResultForLLM(result)),
					tool_call_id: toolCall.id
				};
				messages.push(toolMessage);
			}
		}
	}

	private ensureWithinLimits(startTime: number, toolCallCount: number): void {
		if (Date.now() - startTime > MAX_SESSION_DURATION_MS) {
			throw new Error('Planner session exceeded time limit. Please try again.');
		}
		if (toolCallCount > MAX_TOOL_CALLS_PER_TURN) {
			throw new Error('Planner hit tool usage limit. Please refine your request.');
		}
	}

	private async handlePlanToolCall(params: {
		rawArgs: Record<string, any>;
		plannerContext: PlannerContext;
		serviceContext: ServiceContext;
		request: AgentChatRequest;
	}): Promise<ToolExecutionResult> {
		const { rawArgs, plannerContext, serviceContext, request } = params;
		const streamEvents: StreamEvent[] = [];

		const executionMode = this.normalizeExecutionMode(
			rawArgs.execution_mode,
			rawArgs.auto_execute
		);
		const objective =
			typeof rawArgs.objective === 'string' && rawArgs.objective.trim().length > 0
				? rawArgs.objective
				: request.userMessage;

		const intent: PlanIntent = {
			objective,
			contextType: serviceContext.contextType,
			sessionId: serviceContext.sessionId,
			userId: serviceContext.userId,
			entityId: serviceContext.entityId,
			plannerAgentId: plannerContext.metadata.plannerAgentId || request.sessionId,
			executionMode,
			requestedOutputs: this.normalizeStringArray(rawArgs.requested_outputs),
			priorityEntities: this.normalizeStringArray(rawArgs.priority_entities)
		};

		try {
			const plan = await this.deps.planOrchestrator.createPlanFromIntent(
				intent,
				plannerContext,
				serviceContext
			);

			streamEvents.push({ type: 'plan_created', plan });

			switch (executionMode) {
				case 'draft_only':
					return await this.handleDraftOnlyPlan({
						plan,
						streamEvents,
						serviceContext
					});

				case 'agent_review':
					return await this.handleAgentReviewPlan({
						plan,
						intent,
						streamEvents,
						plannerContext,
						serviceContext
					});

				case 'auto_execute':
				default:
					return await this.handleAutoExecutePlan({
						plan,
						streamEvents,
						plannerContext,
						serviceContext
					});
			}
		} catch (error) {
			console.error('[AgentChatOrchestrator] Plan tool execution failed', error);
			streamEvents.push(
				this.buildAgentStateEvent(
					'waiting_on_user',
					serviceContext.contextType,
					'Plan creation failed. Try rephrasing your request.'
				)
			);

			return {
				success: false,
				error: error instanceof Error ? error.message : 'Plan tool failed',
				streamEvents
			};
		}
	}

	private async handleAutoExecutePlan(params: {
		plan: AgentPlan;
		streamEvents: StreamEvent[];
		plannerContext: PlannerContext;
		serviceContext: ServiceContext;
	}): Promise<ToolExecutionResult> {
		const { plan, streamEvents, plannerContext, serviceContext } = params;

		streamEvents.push(
			this.buildAgentStateEvent(
				'executing_plan',
				serviceContext.contextType,
				'Executing plan...'
			)
		);

		const execution = await this.executePlan(plan, plannerContext, serviceContext);
		streamEvents.push(...execution.events);
		streamEvents.push(
			this.buildAgentStateEvent(
				'waiting_on_user',
				serviceContext.contextType,
				'Plan complete. Ready for the next instruction.'
			)
		);

		return {
			success: true,
			data: {
				status: 'executed',
				plan_id: plan.id,
				summary: execution.summary
			},
			streamEvents
		};
	}

	private async handleDraftOnlyPlan(params: {
		plan: AgentPlan;
		streamEvents: StreamEvent[];
		serviceContext: ServiceContext;
	}): Promise<ToolExecutionResult> {
		const { plan, streamEvents, serviceContext } = params;
		const summary = this.summarizePlan(plan);

		await this.deps.planOrchestrator.persistDraft(plan);
		streamEvents.push({
			type: 'plan_ready_for_review',
			plan,
			summary
		});
		streamEvents.push(
			this.buildAgentStateEvent(
				'waiting_on_user',
				serviceContext.contextType,
				'Plan drafted. Share feedback or say “run it” to execute.'
			)
		);

		return {
			success: true,
			data: {
				status: 'pending_review',
				plan_id: plan.id,
				summary
			},
			streamEvents
		};
	}

	private async handleAgentReviewPlan(params: {
		plan: AgentPlan;
		intent: PlanIntent;
		streamEvents: StreamEvent[];
		plannerContext: PlannerContext;
		serviceContext: ServiceContext;
	}): Promise<ToolExecutionResult> {
		const { plan, intent, streamEvents, plannerContext, serviceContext } = params;

		const review = await this.deps.planOrchestrator.reviewPlan(plan, intent, serviceContext);
		streamEvents.push({
			type: 'plan_review',
			plan,
			verdict: review.verdict,
			notes: review.notes,
			reviewer: review.reviewer
		});

		if (review.verdict === 'approved') {
			streamEvents.push(
				this.buildAgentStateEvent(
					'executing_plan',
					serviceContext.contextType,
					'Reviewer approved the plan. Executing now...'
				)
			);
			const execution = await this.executePlan(plan, plannerContext, serviceContext);
			streamEvents.push(...execution.events);
			streamEvents.push(
				this.buildAgentStateEvent(
					'waiting_on_user',
					serviceContext.contextType,
					'Plan complete. Ready for the next instruction.'
				)
			);

			return {
				success: true,
				data: {
					status: 'executed',
					plan_id: plan.id,
					summary: execution.summary,
					review
				},
				streamEvents
			};
		}

		await this.deps.planOrchestrator.persistDraft(plan);
		const summary = this.summarizePlan(plan);
		streamEvents.push({
			type: 'plan_ready_for_review',
			plan,
			summary,
			recommendations: intent.requestedOutputs
		});
		streamEvents.push(
			this.buildAgentStateEvent(
				'waiting_on_user',
				serviceContext.contextType,
				'Reviewer requested changes. Adjust the plan and try again.'
			)
		);

		return {
			success: true,
			data: {
				status: 'changes_requested',
				plan_id: plan.id,
				summary,
				review
			},
			streamEvents
		};
	}

	private async executePlan(
		plan: AgentPlan,
		plannerContext: PlannerContext,
		serviceContext: ServiceContext
	): Promise<{ events: StreamEvent[]; summary: string; usage?: { total_tokens: number } }> {
		const events: StreamEvent[] = [];
		const executorResults: ExecutorResult[] = [];
		const collectedToolResults: ToolExecutionResult[] = [];
		let planUsage: { total_tokens: number } | undefined;

		for await (const event of this.deps.planOrchestrator.executePlan(
			plan,
			plannerContext,
			serviceContext,
			async () => {}
		)) {
			if (event.type === 'done') {
				if (event.usage) {
					planUsage = event.usage;
				}
				continue;
			}

			events.push(event);

			switch (event.type) {
				case 'executor_result':
					executorResults.push(event.result);
					break;
				case 'tool_result':
					collectedToolResults.push(event.result);
					break;
			}
		}

		const response = await this.deps.responseSynthesizer.synthesizeComplexResponse(
			plan,
			executorResults.length > 0 ? executorResults : collectedToolResults,
			serviceContext
		);

		return {
			events,
			summary: response.text,
			usage: planUsage ?? this.toStreamUsage(response.usage)
		};
	}

	private normalizeExecutionMode(
		mode?: PlanExecutionMode | string,
		autoExecute?: boolean
	): PlanExecutionMode {
		if (mode === 'draft_only' || mode === 'agent_review' || mode === 'auto_execute') {
			return mode;
		}
		if (autoExecute === false) {
			return 'draft_only';
		}
		return 'auto_execute';
	}

	private normalizeStringArray(value: unknown): string[] | undefined {
		if (!Array.isArray(value)) {
			return undefined;
		}
		const normalized = value
			.map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
			.filter(Boolean);
		return normalized.length > 0 ? normalized : undefined;
	}

	private summarizePlan(plan: AgentPlan): string {
		return plan.steps
			.map(
				(step: any) =>
					`${step.stepNumber}. ${step.description}${
						step.executorRequired ? ' (executor)' : ''
					}`
			)
			.join('\n');
	}

	private normalizeChatContextType(contextType?: ChatContextType | string): ChatContextType {
		if (!contextType) return 'global';
		return (contextType as ChatContextType) === 'general'
			? 'global'
			: (contextType as ChatContextType);
	}

	private buildContextShiftSnapshot(
		contextShift: {
			new_context?: ChatContextType | string;
			entity_id?: string;
			entity_name?: string;
			entity_type?: 'project' | 'task' | 'plan' | 'goal' | 'document' | 'output';
			message?: string;
		},
		defaultContext: ChatContextType
	): LastTurnContext {
		const entities: LastTurnContext['entities'] = {};

		const assignEntity = (slot: keyof LastTurnContext['entities'], id?: string) => {
			if (!id) return;
			if (slot === 'task_ids' || slot === 'goal_ids') {
				if (!entities[slot]) entities[slot] = [];
				if (!entities[slot]!.includes(id)) {
					entities[slot]!.push(id);
				}
				return;
			}
			if (!(entities as any)[slot]) {
				(entities as any)[slot] = id;
			}
		};

		switch (contextShift.entity_type) {
			case 'project':
				assignEntity('project_id', contextShift.entity_id);
				break;
			case 'task':
				assignEntity('task_ids', contextShift.entity_id);
				break;
			case 'plan':
				assignEntity('plan_id', contextShift.entity_id);
				break;
			case 'goal':
				assignEntity('goal_ids', contextShift.entity_id);
				break;
			case 'document':
				assignEntity('document_id', contextShift.entity_id);
				break;
			case 'output':
				assignEntity('output_id', contextShift.entity_id);
				break;
		}

		const summary =
			contextShift.message ??
			`Context shifted to ${contextShift.entity_name ?? contextShift.entity_type ?? defaultContext}.`;

		return {
			summary,
			entities,
			context_type: this.normalizeChatContextType(contextShift.new_context ?? defaultContext),
			data_accessed: ['context_shift'],
			timestamp: new Date().toISOString()
		};
	}

	private buildAgentStateEvent(
		state: 'thinking' | 'executing_plan' | 'waiting_on_user',
		contextType: ChatContextType,
		details: string
	): StreamEvent {
		return {
			type: 'agent_state',
			state,
			contextType,
			details
		};
	}

	private resolvePlannerProfile(contextType: ChatContextType): TextProfile {
		switch (contextType) {
			case 'project_audit':
			case 'project_forecast':
				return 'quality';
			case 'task_update':
			case 'calendar':
				return 'speed';
			default:
				return 'balanced';
		}
	}

	private normalizeToolResultForLLM(result: ToolExecutionResult): ChatToolResult {
		return {
			tool_call_id: result.toolCallId,
			result: result.data ?? null,
			success: result.success,
			error: result.error
		};
	}

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

	private toStreamUsage(usage?: SynthesisUsage): { total_tokens: number } | undefined {
		if (!usage || typeof usage.totalTokens !== 'number') {
			return undefined;
		}
		return { total_tokens: usage.totalTokens };
	}
}
