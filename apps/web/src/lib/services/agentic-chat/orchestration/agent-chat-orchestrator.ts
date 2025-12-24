// apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts
/**
 * Agent Chat Orchestrator
 *
 * What this file is:
 * - The top-level runtime loop that drives a single agentic chat request.
 *
 * Purpose:
 * - Build planner context, select tools, stream the planner loop, and execute tools.
 * - Handle context refreshes, plan meta tool calls, and event streaming.
 *
 * Why / when to use:
 * - Use for the main chat flow that coordinates planning + tool execution.
 * - This is the entry point for request-level orchestration.
 */

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
// import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import type { LastTurnContext } from '$lib/types/agent-chat-enhancement';
import { createEnhancedLLMWrapper, type EnhancedLLMWrapper } from '../config/enhanced-llm-wrapper';
import { AGENTIC_CHAT_LIMITS } from '../config/agentic-chat-limits';
import {
	ProjectCreationAnalyzer,
	type ClarificationRoundMetadata
} from '../analysis/project-creation-analyzer';
import { StrategyAnalyzer } from '../analysis/strategy-analyzer';
import { ToolSelectionService } from '../analysis/tool-selection-service';
import { normalizeContextType } from '../../../../routes/api/agent/stream/utils/context-utils';
import { buildDebugContextInfo, isDebugModeEnabled } from '../observability';
import { ErrorLoggerService } from '../../errorLogger.service';
import { applyContextShiftToContext, extractContextShift } from '../shared/context-shift';
import { ALL_TOOLS } from '$lib/services/agentic-chat/tools/core/tools.config';

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
	errorLogger: ErrorLoggerService;
}

export class AgentChatOrchestrator {
	private enhancedLLM: EnhancedLLMWrapper;
	private projectCreationAnalyzer: ProjectCreationAnalyzer;
	private strategyAnalyzer: StrategyAnalyzer;
	private toolSelectionService: ToolSelectionService;

	constructor(private deps: AgentChatOrchestratorDependencies) {
		// Create enhanced wrapper for intelligent model selection
		this.enhancedLLM = createEnhancedLLMWrapper(deps.llmService);
		// Create analyzer for project creation clarifying questions
		this.projectCreationAnalyzer = new ProjectCreationAnalyzer(deps.llmService);
		this.strategyAnalyzer = new StrategyAnalyzer(deps.llmService);
		this.toolSelectionService = new ToolSelectionService(this.strategyAnalyzer);
	}

	async *streamConversation(
		request: AgentChatRequest,
		callback: StreamCallback
	): AsyncGenerator<StreamEvent, void, unknown> {
		const { contextService, persistenceService } = this.deps;
		const conversationHistory = request.conversationHistory ?? [];

		let plannerContext: PlannerContext;
		let plannerAgentId: string | undefined;
		let doneEmitted = false;

		try {
			plannerContext = await contextService.buildPlannerContext({
				sessionId: request.sessionId,
				userId: request.userId,
				conversationHistory,
				userMessage: request.userMessage,
				contextType: request.contextType,
				entityId: request.entityId,
				...(request.ontologyContext ? { ontologyContext: request.ontologyContext } : {}),
				...(request.lastTurnContext ? { lastTurnContext: request.lastTurnContext } : {}),
				projectFocus: request.projectFocus ?? null
			});

			const contextScope =
				request.ontologyContext?.scope ??
				(request.entityId ? { projectId: request.entityId } : undefined);

			const serviceContext: ServiceContext = {
				sessionId: request.sessionId,
				userId: request.userId,
				contextType: request.contextType,
				entityId: request.entityId,
				conversationHistory,
				ontologyContext: request.ontologyContext,
				lastTurnContext: request.lastTurnContext,
				projectFocus: request.projectFocus ?? null,
				contextScope
			};

			plannerContext = await this.applyToolSelection({
				request,
				plannerContext,
				serviceContext
			});

			// Emit tool selection telemetry
			const toolSelectionMeta = plannerContext.metadata?.toolSelection;
			if (toolSelectionMeta) {
				const telemetryEvent: StreamEvent = {
					type: 'telemetry',
					event: 'tool_selection',
					data: {
						mode: toolSelectionMeta.mode,
						defaultToolCount: toolSelectionMeta.defaultToolNames?.length ?? 0,
						selectedToolCount: toolSelectionMeta.selectedToolNames?.length ?? 0,
						addedTools: toolSelectionMeta.addedTools ?? [],
						removedTools: toolSelectionMeta.removedTools ?? [],
						strategy: toolSelectionMeta.strategy,
						confidence: toolSelectionMeta.confidence,
						contextType: serviceContext.contextType
					}
				};
				yield telemetryEvent;
				await callback(telemetryEvent);
			}

			plannerAgentId = await this.createPlannerAgentRecord(
				persistenceService,
				plannerContext,
				request
			);

			plannerContext.metadata = {
				...plannerContext.metadata,
				plannerAgentId
			};
			serviceContext.plannerAgentId = plannerAgentId;

			// === DEBUG CONTEXT EMISSION ===
			// If debug mode is enabled, emit full context info for observability
			if (isDebugModeEnabled()) {
				const debugEvent: StreamEvent = {
					type: 'debug_context',
					debug: buildDebugContextInfo({
						plannerContext,
						requestId: uuidv4(),
						projectFocus: request.projectFocus,
						ontologyContext: request.ontologyContext
					})
				};
				yield debugEvent;
				await callback(debugEvent);
			}

			if (request.chatSession) {
				const sessionEvent: StreamEvent = {
					type: 'session',
					session: request.chatSession
				};
				yield sessionEvent;
				await callback(sessionEvent);
			}

			// if (request.ontologyContext) {
			// 	const ontologyEvent: StreamEvent = {
			// 		type: 'ontology_loaded',
			// 		summary: `Ontology context loaded for ${request.ontologyContext.type}`
			// 	};
			// 	yield ontologyEvent;
			// 	await callback(ontologyEvent);
			// }

			if (request.lastTurnContext) {
				const lastTurnEvent: StreamEvent = {
					type: 'last_turn_context',
					context: request.lastTurnContext
				};
				yield lastTurnEvent;
				await callback(lastTurnEvent);
			}

			if (plannerContext.metadata.compressionUsage) {
				const usageEvent: StreamEvent = {
					type: 'context_usage',
					usage: plannerContext.metadata.compressionUsage
				};
				yield usageEvent;
				await callback(usageEvent);
			}

			// === PROJECT CREATION CLARIFICATION CHECK ===
			// For project_create context, check if we need to ask clarifying questions
			// before proceeding with the planner loop
			if (request.contextType === 'project_create') {
				const clarificationResult = await this.checkProjectCreationClarification(
					request,
					serviceContext,
					callback
				);

				if (clarificationResult.needsClarification) {
					// Emit clarifying questions and return early
					for (const event of clarificationResult.events) {
						yield event;
						await callback(event);
					}

					// Emit done event
					const doneEvent: StreamEvent = { type: 'done' };
					doneEmitted = true;
					yield doneEvent;
					await callback(doneEvent);
					return;
				}
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
				if (event.type === 'done') {
					doneEmitted = true;
				}
				yield event;
				await callback(event);
			}
		} catch (error) {
			if (this.isAbortError(error) || request.abortSignal?.aborted) {
				doneEmitted = true;
				return;
			}

			console.error('[AgentChatOrchestrator] Error during orchestration', error);
			await this.deps.errorLogger.logError(error, {
				userId: request.userId,
				operationType: 'agent_chat_orchestration',
				metadata: {
					sessionId: request.sessionId,
					contextType: request.contextType
				}
			});

			const message =
				error instanceof Error ? error.message : 'Unknown error during agent orchestration';
			const errorEvent: StreamEvent = { type: 'error', error: message };
			yield errorEvent;
			await callback(errorEvent);
			if (!doneEmitted) {
				const doneEvent: StreamEvent = { type: 'done' };
				doneEmitted = true;
				yield doneEvent;
				await callback(doneEvent);
			}
		} finally {
			if (plannerAgentId) {
				await this.safeUpdatePlannerStatus(plannerAgentId);
			}
			if (!doneEmitted && !request.abortSignal?.aborted) {
				const doneEvent: StreamEvent = { type: 'done' };
				yield doneEvent;
				await callback(doneEvent);
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

	private async applyToolSelection(params: {
		request: AgentChatRequest;
		plannerContext: PlannerContext;
		serviceContext: ServiceContext;
	}): Promise<PlannerContext> {
		const { request, plannerContext, serviceContext } = params;
		try {
			const selection = await this.toolSelectionService.selectTools({
				message: request.userMessage,
				plannerContext,
				serviceContext,
				lastTurnContext: request.lastTurnContext ?? plannerContext.lastTurnContext
			});

			return {
				...plannerContext,
				availableTools: selection.tools,
				metadata: {
					...plannerContext.metadata,
					toolSelection: selection.metadata,
					strategyAnalysis: selection.analysis
				}
			};
		} catch (error) {
			console.warn('[AgentChatOrchestrator] Tool selection failed, using default tools', {
				error
			});
			return plannerContext;
		}
	}

	private refreshPlannerMessages(messages: LLMMessage[], plannerContext: PlannerContext): void {
		if (messages.length === 0) {
			return;
		}

		if (messages[0]?.role === 'system') {
			messages[0] = {
				...messages[0],
				content: plannerContext.systemPrompt
			};
		}

		const profileContent = plannerContext.userProfile
			? `## User Preferences\n${plannerContext.userProfile}`
			: undefined;
		const profileIndex = messages.findIndex(
			(message) =>
				message.role === 'system' &&
				typeof message.content === 'string' &&
				message.content.startsWith('## User Preferences')
		);

		if (profileContent) {
			if (profileIndex >= 0) {
				messages[profileIndex] = {
					...messages[profileIndex],
					role: 'system' as const,
					content: profileContent
				};
			} else {
				messages.splice(1, 0, {
					role: 'system',
					content: profileContent
				});
			}
		} else if (profileIndex >= 0) {
			messages.splice(profileIndex, 1);
		}

		const snapshotContent = `## Context Snapshot\n${plannerContext.locationContext}`;
		const snapshotIndex = messages.findIndex(
			(message) =>
				message.role === 'system' &&
				typeof message.content === 'string' &&
				message.content.startsWith('## Context Snapshot')
		);

		if (snapshotIndex >= 0) {
			messages[snapshotIndex] = {
				...messages[snapshotIndex],
				role: 'system' as const,
				content: snapshotContent
			};
			return;
		}

		const updatedProfileIndex = messages.findIndex(
			(message) =>
				message.role === 'system' &&
				typeof message.content === 'string' &&
				message.content.startsWith('## User Preferences')
		);
		const insertIndex = Math.min(
			messages.length,
			Math.max(1, updatedProfileIndex >= 0 ? updatedProfileIndex + 1 : 1)
		);
		messages.splice(insertIndex, 0, {
			role: 'system',
			content: snapshotContent
		});
	}

	private appendVirtualTools(tools: ChatToolDefinition[]): ChatToolDefinition[] {
		// ChatToolDefinition is well-typed with function.name property
		// No need for 'as any' cast - tools array is already typed
		const existingPlanTool = tools.find(
			(tool) => tool?.function?.name === PLAN_TOOL_DEFINITION.function.name
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

	private async refreshPlannerContextAfterShift(params: {
		request: AgentChatRequest;
		serviceContext: ServiceContext;
		messages: LLMMessage[];
	}): Promise<{
		plannerContext: PlannerContext;
		tools: ChatToolDefinition[];
		virtualHandlers: Record<string, VirtualToolHandler>;
	} | null> {
		const { request, serviceContext, messages } = params;
		try {
			let refreshedPlannerContext = await this.deps.contextService.buildPlannerContext({
				sessionId: serviceContext.sessionId,
				userId: serviceContext.userId,
				conversationHistory: serviceContext.conversationHistory,
				userMessage: request.userMessage,
				contextType: serviceContext.contextType,
				entityId: serviceContext.entityId,
				...(serviceContext.ontologyContext
					? { ontologyContext: serviceContext.ontologyContext }
					: {}),
				...(serviceContext.lastTurnContext
					? { lastTurnContext: serviceContext.lastTurnContext }
					: {}),
				projectFocus: serviceContext.projectFocus ?? null
			});

			refreshedPlannerContext = await this.applyToolSelection({
				request,
				plannerContext: refreshedPlannerContext,
				serviceContext
			});

			this.refreshPlannerMessages(messages, refreshedPlannerContext);

			const refreshedTools = this.appendVirtualTools(refreshedPlannerContext.availableTools);
			const refreshedVirtualHandlers = this.createVirtualToolHandlers({
				request,
				plannerContext: refreshedPlannerContext,
				serviceContext
			});

			return {
				plannerContext: refreshedPlannerContext,
				tools: refreshedTools,
				virtualHandlers: refreshedVirtualHandlers
			};
		} catch (error) {
			console.warn('[AgentChatOrchestrator] Failed to refresh planner context', {
				error
			});
			return null;
		}
	}

	private async *runPlannerLoop(params: {
		request: AgentChatRequest;
		messages: LLMMessage[];
		tools: ChatToolDefinition[];
		plannerContext: PlannerContext;
		serviceContext: ServiceContext;
		virtualHandlers: Record<string, VirtualToolHandler>;
	}): AsyncGenerator<StreamEvent, void, unknown> {
		const { toolExecutionService } = this.deps;
		const { request, messages, tools, serviceContext, virtualHandlers, plannerContext } =
			params;
		let currentPlannerContext = plannerContext;
		let currentTools = tools;
		let currentVirtualHandlers = virtualHandlers;

		const startTime = Date.now();
		let toolCallCount = 0;
		let lastUsage: { total_tokens: number } | undefined;
		let continueLoop = true;
		let toolMissRetryUsed = false;

		yield this.buildAgentStateEvent(
			'thinking',
			serviceContext.contextType,
			'Analyzing request...'
		);

		while (continueLoop) {
			if (request.abortSignal?.aborted) {
				return;
			}
			this.ensureWithinLimits(startTime, toolCallCount);
			let assistantBuffer = '';
			const pendingToolCalls: ChatToolCall[] = [];

			const elapsedMs = Date.now() - startTime;
			const remainingMs = AGENTIC_CHAT_LIMITS.MAX_SESSION_DURATION_MS - elapsedMs;
			if (remainingMs <= 0) {
				throw new Error('Planner session exceeded time limit. Please try again.');
			}

			const streamAbortController = new AbortController();
			let timeoutTriggered = false;
			const timeoutId = setTimeout(() => {
				timeoutTriggered = true;
				streamAbortController.abort();
			}, remainingMs);

			const handleRequestAbort = () => {
				streamAbortController.abort();
			};
			if (request.abortSignal) {
				if (request.abortSignal.aborted) {
					streamAbortController.abort();
				} else {
					request.abortSignal.addEventListener('abort', handleRequestAbort);
				}
			}

			// Use enhanced wrapper for intelligent model selection
			// The wrapper will automatically select the best profile based on context
			try {
				for await (const chunk of this.enhancedLLM.streamText({
					messages,
					tools: currentTools,
					tool_choice: 'auto',
					userId: serviceContext.userId,
					// Let the wrapper decide the optimal profile unless explicitly set
					profile: undefined, // Will be auto-selected based on context
					temperature: 0.4, // Can be overridden by wrapper if needed
					maxTokens: 1800, // Can be overridden by wrapper if needed
					sessionId: serviceContext.sessionId,
					// Pass context for optimization and usage logging (builds chat_stream_${contextType})
					contextType: serviceContext.contextType,
					operationType: 'planner_stream',
					// Pass entity IDs for usage tracking
					entityId: serviceContext.entityId,
					projectId: serviceContext.contextScope?.projectId,
					signal: streamAbortController.signal
				}) as AsyncGenerator<LLMStreamEvent>) {
					if (request.abortSignal?.aborted) {
						return;
					}
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
			} finally {
				clearTimeout(timeoutId);
				if (request.abortSignal) {
					request.abortSignal.removeEventListener('abort', handleRequestAbort);
				}
			}

			if (request.abortSignal?.aborted) {
				return;
			}

			if (timeoutTriggered) {
				throw new Error('LLM stream timeout. Please try again.');
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

			let retryWithExpandedTools = false;
			for (const toolCall of pendingToolCalls) {
				if (request.abortSignal?.aborted) {
					return;
				}
				toolCallCount++;
				this.ensureWithinLimits(startTime, toolCallCount);

				const result = await toolExecutionService.executeTool(
					toolCall,
					serviceContext,
					currentTools,
					{
						virtualHandlers: currentVirtualHandlers,
						abortSignal: request.abortSignal
					}
				);

				// Track tool_not_loaded errors for telemetry - indicates tool selection miss
				if (result.errorType === 'tool_not_loaded') {
					console.warn('[AgentChatOrchestrator] Tool not loaded - selection miss', {
						toolName: result.toolName,
						sessionId: serviceContext.sessionId,
						contextType: serviceContext.contextType
					});
					// Emit telemetry event for tracking
					yield {
						type: 'telemetry',
						event: 'tool_selection_miss',
						data: {
							toolName: result.toolName,
							contextType: serviceContext.contextType,
							loadedToolCount: currentTools.length
						}
					} as StreamEvent;
				}

				yield { type: 'tool_result', result };

				// Type-safe context shift extraction
				const contextShift = extractContextShift(result);
				if (contextShift) {
					const { normalizedContext, normalizedEntityId, changed } =
						applyContextShiftToContext(serviceContext, contextShift);

					serviceContext.lastTurnContext = this.buildContextShiftSnapshot(
						{
							...contextShift,
							entity_id: normalizedEntityId
						},
						normalizedContext
					);

					if (changed) {
						const refreshed = await this.refreshPlannerContextAfterShift({
							request,
							serviceContext,
							messages
						});
						if (refreshed) {
							currentPlannerContext = refreshed.plannerContext;
							currentTools = refreshed.tools;
							currentVirtualHandlers = refreshed.virtualHandlers;
						}
					}

					// Persistence handled by the stream layer (chat_sessions).
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

				if (result.errorType === 'tool_not_loaded' && !toolMissRetryUsed) {
					toolMissRetryUsed = true;
					const expanded = this.expandToolPoolAfterMiss({
						request,
						serviceContext,
						plannerContext: currentPlannerContext,
						messages,
						missedToolName: result.toolName
					});
					currentPlannerContext = expanded.plannerContext;
					currentTools = expanded.tools;
					currentVirtualHandlers = expanded.virtualHandlers;
					retryWithExpandedTools = true;
				}

				if (retryWithExpandedTools) {
					break;
				}
			}

			if (retryWithExpandedTools) {
				continue;
			}
		}
	}

	private expandToolPoolAfterMiss(params: {
		request: AgentChatRequest;
		serviceContext: ServiceContext;
		plannerContext: PlannerContext;
		messages: LLMMessage[];
		missedToolName: string;
	}): {
		plannerContext: PlannerContext;
		tools: ChatToolDefinition[];
		virtualHandlers: Record<string, VirtualToolHandler>;
	} {
		const { request, serviceContext, plannerContext, messages, missedToolName } = params;
		const expandedPlannerContext: PlannerContext = {
			...plannerContext,
			availableTools: ALL_TOOLS
		};

		messages.push({
			role: 'system',
			content: `Tool "${missedToolName}" was not loaded. Tool pool expanded to full catalog; replan with available tools.`
		});

		return {
			plannerContext: expandedPlannerContext,
			tools: this.appendVirtualTools(expandedPlannerContext.availableTools),
			virtualHandlers: this.createVirtualToolHandlers({
				request,
				plannerContext: expandedPlannerContext,
				serviceContext
			})
		};
	}

	private ensureWithinLimits(startTime: number, toolCallCount: number): void {
		if (Date.now() - startTime > AGENTIC_CHAT_LIMITS.MAX_SESSION_DURATION_MS) {
			throw new Error('Planner session exceeded time limit. Please try again.');
		}
		if (toolCallCount > AGENTIC_CHAT_LIMITS.MAX_TOOL_CALLS_PER_TURN) {
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
				streamEvents,
				toolName: 'agent_create_plan',
				toolCallId: `virtual-${uuidv4()}`
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
			streamEvents,
			toolName: 'agent_create_plan',
			toolCallId: `virtual-${uuidv4()}`
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
			streamEvents,
			toolName: 'agent_create_plan',
			toolCallId: `virtual-${uuidv4()}`
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
				streamEvents,
				toolName: 'agent_create_plan',
				toolCallId: `virtual-${uuidv4()}`
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
			streamEvents,
			toolName: 'agent_create_plan',
			toolCallId: `virtual-${uuidv4()}`
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

		const combinedResults =
			executorResults.length > 0 || collectedToolResults.length > 0
				? [...executorResults, ...collectedToolResults]
				: [];
		const response = await this.deps.responseSynthesizer.synthesizeComplexResponse(
			plan,
			combinedResults,
			serviceContext
		);

		const synthesisTokens = response.usage?.totalTokens ?? 0;
		const planTokens = plan.metadata?.totalTokensUsed ?? 0;
		const combinedTokens = planTokens + synthesisTokens;

		if (synthesisTokens > 0) {
			plan.metadata = {
				...(plan.metadata ?? {}),
				totalTokensUsed: combinedTokens
			};
			try {
				await this.deps.persistenceService.updatePlan(plan.id, {
					metadata: plan.metadata
				});
			} catch (error) {
				console.warn('[AgentChatOrchestrator] Failed to persist synthesis usage', {
					planId: plan.id,
					error
				});
			}
		}

		return {
			events,
			summary: response.text,
			usage:
				combinedTokens > 0
					? { total_tokens: combinedTokens }
					: (planUsage ?? this.toStreamUsage(response.usage))
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
			context_type: normalizeContextType(contextShift.new_context ?? defaultContext),
			data_accessed: ['context_shift'],
			timestamp: new Date().toISOString()
		};
	}

	/**
	 * Check if project creation needs clarifying questions before proceeding
	 *
	 * Flow:
	 * 1. Extract clarification metadata from request (or create initial)
	 * 2. Analyze user message for intent sufficiency
	 * 3. If sufficient context, return { needsClarification: false }
	 * 4. If insufficient, generate friendly intro message + questions, return events
	 * 5. Include updated metadata for the next round in the response
	 */
	private async checkProjectCreationClarification(
		request: AgentChatRequest,
		serviceContext: ServiceContext,
		callback: StreamCallback
	): Promise<{
		needsClarification: boolean;
		events: StreamEvent[];
		updatedMetadata?: ClarificationRoundMetadata;
	}> {
		const existingMetadata = request.projectClarificationMetadata;
		const roundNumber = existingMetadata?.roundNumber ?? 0;

		console.log('[AgentChatOrchestrator] Checking project creation clarification', {
			roundNumber,
			messageLength: request.userMessage.length,
			hasExistingMetadata: !!existingMetadata
		});

		// Convert to analyzer format
		const analyzerMetadata: ClarificationRoundMetadata | undefined = existingMetadata
			? {
					roundNumber: existingMetadata.roundNumber,
					accumulatedContext: existingMetadata.accumulatedContext,
					previousQuestions: existingMetadata.previousQuestions,
					previousResponses: existingMetadata.previousResponses
				}
			: undefined;

		try {
			const analysis = await this.projectCreationAnalyzer.analyzeIntent(
				request.userMessage,
				request.userId,
				analyzerMetadata
			);

			console.log('[AgentChatOrchestrator] Project creation analysis result', {
				hasSufficientContext: analysis.hasSufficientContext,
				confidence: analysis.confidence,
				hasQuestions: !!analysis.clarifyingQuestions?.length,
				inferredType: analysis.inferredProjectType
			});

			// If sufficient context, proceed with project creation
			if (analysis.hasSufficientContext) {
				return { needsClarification: false, events: [] };
			}

			// Generate clarifying questions response
			const events: StreamEvent[] = [];

			// First, emit agent state showing we're thinking
			events.push(
				this.buildAgentStateEvent(
					'thinking',
					'project_create',
					'Understanding your project...'
				)
			);

			// Generate a friendly intro message
			const introMessage = this.generateClarificationIntro(
				roundNumber,
				analysis.inferredProjectType
			);

			// Emit text with the intro
			events.push({ type: 'text', content: introMessage });

			// Build updated metadata for next round
			const questions = analysis.clarifyingQuestions ?? [
				"Could you tell me more about what kind of project you'd like to create?"
			];
			const updatedMetadata: ClarificationRoundMetadata = {
				roundNumber: roundNumber + 1,
				accumulatedContext: existingMetadata?.accumulatedContext
					? `${existingMetadata.accumulatedContext}\n\nUser: ${request.userMessage}`
					: request.userMessage,
				previousQuestions: [...(existingMetadata?.previousQuestions ?? []), ...questions],
				previousResponses: [
					...(existingMetadata?.previousResponses ?? []),
					request.userMessage
				]
			};

			// Emit the clarifying questions event with updated metadata
			events.push({ type: 'clarifying_questions', questions, metadata: updatedMetadata });

			// Emit agent state showing we're waiting
			events.push(
				this.buildAgentStateEvent(
					'waiting_on_user',
					'project_create',
					'Waiting for more details...'
				)
			);

			return {
				needsClarification: true,
				events,
				updatedMetadata
			};
		} catch (error) {
			console.error(
				'[AgentChatOrchestrator] Project creation clarification check failed:',
				error
			);

			// On error, proceed with project creation (don't block the user)
			return { needsClarification: false, events: [] };
		}
	}

	/**
	 * Generate a friendly intro message for clarifying questions
	 */
	private generateClarificationIntro(roundNumber: number, inferredType?: string): string {
		if (roundNumber === 0) {
			// First round - welcoming intro
			if (inferredType) {
				return `Great! I'd love to help you create a ${inferredType} project. To make sure I set this up perfectly for you, I have a quick question:\n\n`;
			}
			return `I'd be happy to help you create a new project! To make sure I set things up well, could you help me understand a bit more?\n\n`;
		}

		// Second round - acknowledge their input
		return `Thanks for the additional details! Just one more thing to make sure I get this right:\n\n`;
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

	// Removed unused resolvePlannerProfile method - profile selection is now handled by EnhancedLLMWrapper

	private normalizeToolResultForLLM(result: ToolExecutionResult): ChatToolResult {
		return {
			tool_call_id: result.toolCallId,
			result: result.data ?? null,
			success: result.success,
			error: typeof result.error === 'string' ? result.error : result.error?.message
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

	private isAbortError(error: unknown): boolean {
		if (!error || typeof error !== 'object') {
			return false;
		}
		const maybeError = error as { name?: string; message?: string };
		return (
			maybeError.name === 'AbortError' ||
			(typeof maybeError.message === 'string' &&
				maybeError.message.toLowerCase().includes('aborted'))
		);
	}
}
