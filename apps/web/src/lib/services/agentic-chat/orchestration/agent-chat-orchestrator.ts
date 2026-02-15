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
import type {
	PlanOrchestrator,
	PlanIntent,
	ProvidedPlanInput
} from '../planning/plan-orchestrator';
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
import { SmartLLMService } from '../../smart-llm-service';
// import type { ErrorLoggerService } from '$lib/services/errorLogger.service';
// import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import type { LastTurnContext, StrategyAnalysis } from '$lib/types/agent-chat-enhancement';
import { ChatStrategy } from '$lib/types/agent-chat-enhancement';
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
import { enrichOntologyUpdateArgs, isOntologyUpdateTool } from '../shared/tool-arg-enrichment';
import { ALL_TOOLS } from '$lib/services/agentic-chat/tools/core/tools.config';
import { createLogger } from '$lib/utils/logger';
import { sanitizeLogData, sanitizeLogText } from '$lib/utils/logging-helpers';
import { dev } from '$app/environment';
import { isToolGatewayEnabled } from '$lib/services/agentic-chat/tools/registry/gateway-config';
import { getToolRegistry } from '$lib/services/agentic-chat/tools/registry/tool-registry';

const logger = createLogger('AgentChatOrchestrator');

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
				},
				plan: {
					type: 'object',
					description:
						'Optional prebuilt plan JSON. When provided, the planner emits steps directly and plan generation is skipped.',
					properties: {
						strategy: {
							type: 'string',
							enum: [
								'planner_stream',
								'project_creation',
								'ask_clarifying_questions'
							],
							description: 'Optional strategy override for the provided plan.'
						},
						reasoning: {
							type: 'string',
							description: 'Optional reasoning summary for the provided plan.'
						},
						steps: {
							type: 'array',
							description: 'Plan steps in execution order.',
							items: {
								type: 'object',
								properties: {
									stepNumber: { type: 'number' },
									type: { type: 'string' },
									description: { type: 'string' },
									tools: { type: 'array', items: { type: 'string' } },
									executorRequired: { type: 'boolean' },
									dependsOn: { type: 'array', items: { type: 'number' } },
									metadata: { type: 'object' }
								},
								required: ['description']
							}
						}
					}
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
	private streamCallback?: StreamCallback;

	constructor(private deps: AgentChatOrchestratorDependencies) {
		// Create enhanced wrapper for intelligent model selection
		this.enhancedLLM = createEnhancedLLMWrapper(deps.llmService);
		// Create analyzer for project creation clarifying questions
		this.projectCreationAnalyzer = new ProjectCreationAnalyzer(
			deps.llmService,
			deps.errorLogger
		);
		this.strategyAnalyzer = new StrategyAnalyzer(deps.llmService, deps.errorLogger);
		this.toolSelectionService = new ToolSelectionService(this.strategyAnalyzer);
	}

	private async yieldToEventLoop(): Promise<void> {
		const setImmediateFn =
			typeof (globalThis as typeof globalThis & { setImmediate?: unknown }).setImmediate ===
			'function'
				? (globalThis as typeof globalThis & { setImmediate: (cb: () => void) => void })
						.setImmediate
				: null;
		if (setImmediateFn) {
			await new Promise<void>((resolve) => setImmediateFn(resolve));
			return;
		}
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	}

	async *streamConversation(
		request: AgentChatRequest,
		callback: StreamCallback
	): AsyncGenerator<StreamEvent, void, unknown> {
		const { contextService, persistenceService } = this.deps;
		const conversationHistory = request.conversationHistory ?? [];
		const timingMetricsId = request.timingMetricsId;

		let plannerContext: PlannerContext | undefined;
		let plannerAgentId: string | undefined;
		let doneEmitted = false;

		this.streamCallback = callback;

		if (request.contextType === 'project_create') {
			const ackEvent: StreamEvent = {
				type: 'text',
				content: 'Got it — give me a moment to review your project details...'
			};
			yield ackEvent;
			await callback(ackEvent);
		}
		try {
			const contextBuildStart = Date.now();
			plannerContext = await contextService.buildPlannerContext({
				sessionId: request.sessionId,
				userId: request.userId,
				conversationHistory,
				userMessage: request.userMessage,
				contextType: request.contextType,
				entityId: request.entityId,
				...(request.ontologyContext ? { ontologyContext: request.ontologyContext } : {}),
				...(request.lastTurnContext ? { lastTurnContext: request.lastTurnContext } : {}),
				projectFocus: request.projectFocus ?? null,
				contextCache: request.contextCache,
				deferCompression: true
			});
			void this.safeUpdateTimingMetric(timingMetricsId, {
				context_build_ms: Date.now() - contextBuildStart
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
				timingMetricsId,
				ontologyContext: request.ontologyContext,
				lastTurnContext: request.lastTurnContext,
				projectFocus: request.projectFocus ?? null,
				contextScope
			};

			const toolSelectionStart = Date.now();
			plannerContext = await this.applyToolSelection({
				request,
				plannerContext,
				serviceContext
			});
			void this.safeUpdateTimingMetric(timingMetricsId, {
				tool_selection_ms: Date.now() - toolSelectionStart
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
			void this.safeUpdateTimingMetric(timingMetricsId, {
				planner_agent_id: plannerAgentId
			});

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
				const clarificationStart = Date.now();
				const clarificationResult = await this.checkProjectCreationClarification(request);
				void this.safeUpdateTimingMetric(timingMetricsId, {
					clarification_ms: Date.now() - clarificationStart
				});

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

			const tools = this.appendVirtualTools({
				plannerContext,
				serviceContext,
				request
			});
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

			logger.error(error as Error, {
				operation: 'stream_conversation',
				sessionId: request.sessionId,
				contextType: request.contextType
			});
			const toolNames =
				plannerContext?.availableTools?.map((tool) => this.getToolName(tool)) ?? [];
			const toolPreview = toolNames.slice(0, 20);
			await this.deps.errorLogger.logError(error, {
				userId: request.userId,
				operationType: 'agent_chat_orchestration',
				metadata: {
					sessionId: request.sessionId,
					contextType: request.contextType,
					messageLength: request.userMessage.length,
					messagePreview: sanitizeLogText(request.userMessage, 160),
					toolCount: toolNames.length,
					toolNames: toolPreview,
					toolNamesTruncated:
						toolNames.length > toolPreview.length
							? toolNames.length - toolPreview.length
							: undefined
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
			this.streamCallback = undefined;
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
			logger.warn('Tool selection failed, using default tools', {
				error: error instanceof Error ? error.message : String(error),
				sessionId: serviceContext.sessionId,
				contextType: serviceContext.contextType
			});
			const toolNames = plannerContext.availableTools.map((tool) => this.getToolName(tool));
			const toolPreview = toolNames.slice(0, 20);
			void this.deps.errorLogger.logError(
				error,
				{
					userId: serviceContext.userId,
					operationType: 'tool_selection',
					metadata: {
						sessionId: serviceContext.sessionId,
						contextType: serviceContext.contextType,
						messageLength: request.userMessage.length,
						messagePreview: sanitizeLogText(request.userMessage, 160),
						toolCount: toolNames.length,
						toolNames: toolPreview,
						toolNamesTruncated:
							toolNames.length > toolPreview.length
								? toolNames.length - toolPreview.length
								: undefined
					}
				},
				'warning'
			);
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

	private appendVirtualTools(params: {
		plannerContext: PlannerContext;
		serviceContext: ServiceContext;
		request: AgentChatRequest;
	}): ChatToolDefinition[] {
		const { plannerContext, serviceContext, request } = params;
		const tools = plannerContext.availableTools;
		const existingPlanTool = tools.find(
			(tool) => tool?.function?.name === PLAN_TOOL_DEFINITION.function.name
		);
		if (existingPlanTool) {
			return tools;
		}

		if (!this.shouldEnablePlanTool({ plannerContext, serviceContext, request })) {
			return tools;
		}

		return [...tools, PLAN_TOOL_DEFINITION];
	}

	private shouldEnablePlanTool(params: {
		plannerContext: PlannerContext;
		serviceContext: ServiceContext;
		request: AgentChatRequest;
	}): boolean {
		const { plannerContext, serviceContext, request } = params;

		if (serviceContext.contextType === 'project_create') {
			return true;
		}

		const analysis = plannerContext.metadata?.strategyAnalysis as StrategyAnalysis | undefined;
		if (analysis?.needs_clarification) {
			return false;
		}

		if (analysis?.primary_strategy === ChatStrategy.PROJECT_CREATION) {
			return true;
		}

		if (analysis) {
			if (!analysis.can_complete_directly) {
				return true;
			}
			if (analysis.estimated_steps >= 3) {
				return true;
			}
			if ((analysis.required_tools?.length ?? 0) >= 3) {
				return true;
			}
		}

		const message = request.userMessage?.toLowerCase() ?? '';
		if (message.length > 400) {
			return true;
		}
		if (message.includes('\n')) {
			return true;
		}

		const planKeywords = [
			'plan',
			'strategy',
			'roadmap',
			'audit',
			'analyze',
			'compare',
			'synthesize',
			'report',
			'research',
			'investigate',
			'multi-step'
		];

		return planKeywords.some((keyword) => message.includes(keyword));
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
				projectFocus: serviceContext.projectFocus ?? null,
				contextCache: request.contextCache,
				deferCompression: true
			});

			refreshedPlannerContext = await this.applyToolSelection({
				request,
				plannerContext: refreshedPlannerContext,
				serviceContext
			});

			this.refreshPlannerMessages(messages, refreshedPlannerContext);

			const refreshedTools = this.appendVirtualTools({
				plannerContext: refreshedPlannerContext,
				serviceContext,
				request
			});
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
			logger.warn('Failed to refresh planner context', {
				error: error instanceof Error ? error.message : String(error),
				sessionId: serviceContext.sessionId,
				contextType: serviceContext.contextType
			});
			void this.deps.errorLogger.logError(
				error,
				{
					userId: serviceContext.userId,
					operationType: 'context_refresh',
					metadata: {
						sessionId: serviceContext.sessionId,
						contextType: serviceContext.contextType,
						entityId: serviceContext.entityId,
						messageLength: request.userMessage.length,
						messagePreview: sanitizeLogText(request.userMessage, 160)
					}
				},
				'warning'
			);
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
		let loggedDocToolSchema = false;

		const startTime = Date.now();
		let toolCallCount = 0;
		let lastUsage: { total_tokens: number } | undefined;
		let continueLoop = true;
		let toolMissRetryUsed = false;
		let validationRetryUsed = false;

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
			let chunksSinceYield = 0;
			let lastYieldAt = Date.now();

			const streamAbortController = new AbortController();

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

			if (dev && !loggedDocToolSchema) {
				const docTool = currentTools.find(
					(tool) => tool?.function?.name === 'create_onto_document'
				);
				if (docTool) {
					const params =
						(docTool as any).function?.parameters || (docTool as any).parameters;
					const properties = params?.properties ? Object.keys(params.properties) : [];
					logger.debug('create_onto_document tool schema', {
						required: params?.required ?? [],
						properties
					});
				} else {
					logger.debug('create_onto_document tool schema missing from available tools');
				}
				loggedDocToolSchema = true;
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
						const enrichedToolCall = this.enrichToolCallArguments(
							chunk.tool_call,
							currentPlannerContext,
							serviceContext
						);
						pendingToolCalls.push(enrichedToolCall);
						yield { type: 'tool_call', toolCall: enrichedToolCall };
						const opEvent = this.buildOperationEventFromToolCall(
							enrichedToolCall,
							'start'
						);
						if (opEvent) {
							yield opEvent;
						}
					} else if (chunk.type === 'done') {
						if (chunk.usage?.total_tokens) {
							lastUsage = { total_tokens: chunk.usage.total_tokens };
						}
					} else if (chunk.type === 'error') {
						throw new Error(chunk.error || 'LLM streaming error');
					}

					chunksSinceYield++;
					if (chunksSinceYield >= 64 || Date.now() - lastYieldAt >= 16) {
						await this.yieldToEventLoop();
						chunksSinceYield = 0;
						lastYieldAt = Date.now();
					}
				}
			} finally {
				if (request.abortSignal) {
					request.abortSignal.removeEventListener('abort', handleRequestAbort);
				}
			}

			if (request.abortSignal?.aborted) {
				return;
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
			let retryWithValidationRepair = false;
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
					logger.warn('Tool not loaded - selection miss', {
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
				const opEvent = this.buildOperationEventFromToolCall(
					toolCall,
					result.success ? 'success' : 'error',
					result
				);
				if (opEvent) {
					yield opEvent;
				}

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
					let eventsSinceYield = 0;
					let eventsLastYieldAt = Date.now();
					for (const event of result.streamEvents) {
						yield event;
						eventsSinceYield++;
						if (eventsSinceYield >= 32 || Date.now() - eventsLastYieldAt >= 16) {
							await this.yieldToEventLoop();
							eventsSinceYield = 0;
							eventsLastYieldAt = Date.now();
						}
					}
				}

				const toolMessage: LLMMessage = {
					role: 'tool',
					content: JSON.stringify(this.normalizeToolResultForLLM(result)),
					tool_call_id: toolCall.id
				};
				messages.push(toolMessage);

				if (result.errorType === 'validation_error' && !validationRetryUsed) {
					validationRetryUsed = true;
					messages.push({
						role: 'system',
						content: this.buildValidationRepairInstruction({
							result,
							toolCall
						})
					});
					retryWithValidationRepair = true;
				}

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

				if (retryWithExpandedTools || retryWithValidationRepair) {
					break;
				}
			}

			if (retryWithExpandedTools || retryWithValidationRepair) {
				continue;
			}
		}
	}

	private buildValidationRepairInstruction(params: {
		result: ToolExecutionResult;
		toolCall: ChatToolCall;
	}): string {
		const { result } = params;
		const toolName = result.toolName || 'unknown';
		const error = result.error ? String(result.error) : 'Tool validation failed.';
		const gatewayPayload = result.data as Record<string, any> | null | undefined;
		const gatewayError = gatewayPayload?.error as Record<string, any> | undefined;
		const helpPath =
			typeof gatewayError?.help_path === 'string' ? gatewayError.help_path : undefined;
		const opLabel = typeof gatewayPayload?.op === 'string' ? gatewayPayload?.op : undefined;

		const missingParams = new Set(
			Array.from(error.matchAll(/Missing required parameter: ([a-z0-9_.]+)/gi)).map(
				(match) => match[1]
			)
		);
		const missingIdMatch =
			error.match(/Missing required parameter: ([a-z_]+_id)/i) ??
			error.match(/Invalid ([a-z_]+_id): expected UUID/i);
		const idKey = missingIdMatch?.[1];
		let isUpdateTool = toolName.startsWith('update_onto_');
		if (!isUpdateTool && helpPath) {
			const registryEntry = getToolRegistry().ops[helpPath];
			if (registryEntry?.tool_name?.startsWith('update_onto_')) {
				isUpdateTool = true;
			}
		}
		const missingUpdateFields = /No update fields provided/i.test(error);

		const guidance: string[] = [
			`Tool "${helpPath ?? opLabel ?? toolName}" failed validation: ${error}`,
			'Do not guess or fabricate IDs. Never use placeholders.'
		];

		if (toolName === 'create_onto_project' || helpPath === 'onto.project.create') {
			const needsProjectPayload =
				missingParams.has('project') ||
				missingParams.has('project.name') ||
				missingParams.has('project.type_key') ||
				missingParams.has('entities') ||
				missingParams.has('relationships');

			if (needsProjectPayload) {
				guidance.push(
					'create_onto_project requires: project { name, type_key }, entities: [], relationships: [] (even if empty). If details are missing, include clarifications[] and still send the project skeleton.'
				);
			}
		}

		if (helpPath) {
			guidance.push(`Call tool_help("${helpPath}") to verify required args, then retry.`);
		}

		if (idKey) {
			guidance.push(
				`Find a valid ${idKey} using list/search/detail tools (or ask a clarifying question), then retry.`
			);
		}

		if (isUpdateTool && missingUpdateFields) {
			guidance.push(
				'Include at least one field to change (e.g., state_key, title, description, priority).'
			);
		}

		if (!idKey && !(isUpdateTool && missingUpdateFields)) {
			guidance.push(
				'Fix the arguments to match the tool schema; if unsure, fetch details first or ask the user.'
			);
		}

		guidance.push('Replan and try again once with available tools.');
		return guidance.join(' ');
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

		if (isToolGatewayEnabled()) {
			messages.push({
				role: 'system',
				content:
					'Tool gateway is enabled. Use tool_help("root") to discover ops, then call tool_exec with the exact args.'
			});

			return {
				plannerContext,
				tools: this.appendVirtualTools({
					plannerContext,
					serviceContext,
					request
				}),
				virtualHandlers: this.createVirtualToolHandlers({
					request,
					plannerContext,
					serviceContext
				})
			};
		}
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
			tools: this.appendVirtualTools({
				plannerContext: expandedPlannerContext,
				serviceContext,
				request
			}),
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
		const providedPlan = this.normalizeProvidedPlan(rawArgs.plan);

		try {
			const plan = providedPlan
				? await this.deps.planOrchestrator.createPlanFromProvidedSteps(
						intent,
						plannerContext,
						serviceContext,
						providedPlan
					)
				: await this.deps.planOrchestrator.createPlanFromIntent(
						intent,
						plannerContext,
						serviceContext
					);

			await this.emitStreamEvent({ type: 'plan_created', plan }, streamEvents);

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
			logger.error(error as Error, {
				operation: 'plan_tool_execution',
				sessionId: serviceContext.sessionId
			});
			const sanitizedArgs = sanitizeLogData(rawArgs ?? {});
			void this.deps.errorLogger.logError(error, {
				userId: serviceContext.userId,
				projectId: serviceContext.contextScope?.projectId ?? serviceContext.entityId,
				operationType: 'plan_tool_execution',
				operationPayload:
					sanitizedArgs && typeof sanitizedArgs === 'object'
						? (sanitizedArgs as Record<string, any>)
						: undefined,
				metadata: {
					sessionId: serviceContext.sessionId,
					contextType: serviceContext.contextType,
					executionMode,
					providedPlan: Boolean(providedPlan),
					objectivePreview: sanitizeLogText(objective, 160),
					objectiveLength: objective.length,
					requestedOutputs: intent.requestedOutputs,
					priorityEntities: intent.priorityEntities
				}
			});
			await this.emitStreamEvent(
				this.buildAgentStateEvent(
					'waiting_on_user',
					serviceContext.contextType,
					'Plan creation failed. Try rephrasing your request.'
				),
				streamEvents
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

		await this.emitStreamEvent(
			this.buildAgentStateEvent(
				'executing_plan',
				serviceContext.contextType,
				'Executing plan...'
			),
			streamEvents
		);

		const execution = await this.executePlan(plan, plannerContext, serviceContext);
		if (!this.streamCallback) {
			streamEvents.push(...execution.events);
		}
		if (execution.error) {
			await this.emitStreamEvent(
				this.buildAgentStateEvent(
					'waiting_on_user',
					serviceContext.contextType,
					'Plan failed. Review the error details and try again.'
				),
				streamEvents
			);
			return {
				success: false,
				error: execution.error,
				data: {
					status: 'failed',
					plan_id: plan.id,
					summary: execution.summary,
					details: execution.details
				},
				streamEvents,
				toolName: 'agent_create_plan',
				toolCallId: `virtual-${uuidv4()}`
			};
		}
		await this.emitStreamEvent(
			this.buildAgentStateEvent(
				'waiting_on_user',
				serviceContext.contextType,
				'Plan complete. Ready for the next instruction.'
			),
			streamEvents
		);

		return {
			success: true,
			data: {
				status: 'executed',
				plan_id: plan.id,
				summary: execution.summary,
				details: execution.details
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
		await this.emitStreamEvent(
			{
				type: 'plan_ready_for_review',
				plan,
				summary
			},
			streamEvents
		);
		await this.emitStreamEvent(
			this.buildAgentStateEvent(
				'waiting_on_user',
				serviceContext.contextType,
				'Plan drafted. Share feedback or say “run it” to execute.'
			),
			streamEvents
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
		await this.emitStreamEvent(
			{
				type: 'plan_review',
				plan,
				verdict: review.verdict,
				notes: review.notes,
				reviewer: review.reviewer
			},
			streamEvents
		);

		if (review.verdict === 'approved') {
			await this.emitStreamEvent(
				this.buildAgentStateEvent(
					'executing_plan',
					serviceContext.contextType,
					'Reviewer approved the plan. Executing now...'
				),
				streamEvents
			);
			const execution = await this.executePlan(plan, plannerContext, serviceContext);
			if (!this.streamCallback) {
				streamEvents.push(...execution.events);
			}
			if (execution.error) {
				await this.emitStreamEvent(
					this.buildAgentStateEvent(
						'waiting_on_user',
						serviceContext.contextType,
						'Plan failed after review. Review the errors and try again.'
					),
					streamEvents
				);
				return {
					success: false,
					error: execution.error,
					data: {
						status: 'failed',
						plan_id: plan.id,
						summary: execution.summary,
						details: execution.details,
						review
					},
					streamEvents,
					toolName: 'agent_create_plan',
					toolCallId: `virtual-${uuidv4()}`
				};
			}
			await this.emitStreamEvent(
				this.buildAgentStateEvent(
					'waiting_on_user',
					serviceContext.contextType,
					'Plan complete. Ready for the next instruction.'
				),
				streamEvents
			);

			return {
				success: true,
				data: {
					status: 'executed',
					plan_id: plan.id,
					summary: execution.summary,
					details: execution.details,
					review
				},
				streamEvents,
				toolName: 'agent_create_plan',
				toolCallId: `virtual-${uuidv4()}`
			};
		}

		await this.deps.planOrchestrator.persistDraft(plan);
		const summary = this.summarizePlan(plan);
		await this.emitStreamEvent(
			{
				type: 'plan_ready_for_review',
				plan,
				summary,
				recommendations: intent.requestedOutputs
			},
			streamEvents
		);
		await this.emitStreamEvent(
			this.buildAgentStateEvent(
				'waiting_on_user',
				serviceContext.contextType,
				'Reviewer requested changes. Adjust the plan and try again.'
			),
			streamEvents
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
	): Promise<{
		events: StreamEvent[];
		summary: string;
		usage?: { total_tokens: number };
		error?: string;
		details?: Record<string, any>;
	}> {
		const events: StreamEvent[] = [];
		const executorResults: ExecutorResult[] = [];
		const collectedToolResults: ToolExecutionResult[] = [];
		let planUsage: { total_tokens: number } | undefined;

		const streamCallback = this.streamCallback ?? (async () => {});

		try {
			for await (const event of this.deps.planOrchestrator.executePlan(
				plan,
				plannerContext,
				serviceContext,
				streamCallback
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
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			if (!events.some((event) => event.type === 'error')) {
				events.push({ type: 'error', error: errorMessage });
			}
			return {
				events,
				summary: errorMessage,
				usage: planUsage,
				error: errorMessage
			};
		}

		const combinedResults =
			executorResults.length > 0 || collectedToolResults.length > 0
				? [...executorResults, ...collectedToolResults]
				: [];

		if (!this.shouldUsePlanSynthesisLLM()) {
			const details = this.buildPlanExecutionDetails(plan);
			const summary = this.buildPlanExecutionSummary(details);
			return {
				events,
				summary,
				details,
				usage:
					plan.metadata?.totalTokensUsed && plan.metadata.totalTokensUsed > 0
						? { total_tokens: plan.metadata.totalTokensUsed }
						: planUsage
			};
		}

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
				logger.warn('Failed to persist synthesis usage', {
					planId: plan.id,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		return {
			events,
			summary: response.text,
			details: this.buildPlanExecutionDetails(plan),
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

	private normalizeProvidedPlan(value: unknown): ProvidedPlanInput | undefined {
		if (!value || typeof value !== 'object') {
			return undefined;
		}
		const plan = value as Record<string, any>;
		if (!Array.isArray(plan.steps)) {
			return undefined;
		}

		const strategy =
			typeof plan.strategy === 'string' &&
			Object.values(ChatStrategy).includes(plan.strategy as any)
				? (plan.strategy as ChatStrategy)
				: undefined;

		return {
			steps: plan.steps,
			reasoning: typeof plan.reasoning === 'string' ? plan.reasoning : undefined,
			strategy
		};
	}

	private enrichToolCallArguments(
		toolCall: ChatToolCall,
		plannerContext: PlannerContext | undefined,
		serviceContext: ServiceContext
	): ChatToolCall {
		const toolName = toolCall.function?.name;
		const rawArgs = toolCall.function?.arguments;
		if (!toolName) {
			return toolCall;
		}

		const args = this.parseToolCallArguments(rawArgs);
		if (!args) {
			return toolCall;
		}

		if (toolName === 'tool_exec') {
			const op = typeof args.op === 'string' ? args.op.trim() : '';
			const opArgs =
				args.args && typeof args.args === 'object' && !Array.isArray(args.args)
					? (args.args as Record<string, any>)
					: null;
			if (!op || !opArgs) {
				return toolCall;
			}
			const registryEntry = getToolRegistry().ops[op];
			if (!registryEntry || !isOntologyUpdateTool(registryEntry.tool_name)) {
				return toolCall;
			}
			const enrichedOpArgs = enrichOntologyUpdateArgs(registryEntry.tool_name, opArgs, {
				ontologyContext: plannerContext?.ontologyContext ?? serviceContext.ontologyContext,
				locationMetadata: plannerContext?.locationMetadata,
				contextScope: plannerContext?.metadata?.scope ?? serviceContext.contextScope
			});
			if (enrichedOpArgs === opArgs) {
				return toolCall;
			}
			const updatedArgs = { ...args, args: enrichedOpArgs };
			return {
				...toolCall,
				function: {
					...toolCall.function,
					arguments: JSON.stringify(updatedArgs)
				}
			};
		}

		if (!isOntologyUpdateTool(toolName)) {
			return toolCall;
		}

		const enrichedArgs = enrichOntologyUpdateArgs(toolName, args, {
			ontologyContext: plannerContext?.ontologyContext ?? serviceContext.ontologyContext,
			locationMetadata: plannerContext?.locationMetadata,
			contextScope: plannerContext?.metadata?.scope ?? serviceContext.contextScope
		});

		if (enrichedArgs === args) {
			return toolCall;
		}

		return {
			...toolCall,
			function: {
				...toolCall.function,
				arguments: JSON.stringify(enrichedArgs)
			}
		};
	}

	private parseToolCallArguments(rawArgs: unknown): Record<string, any> | null {
		if (!rawArgs) {
			return null;
		}

		if (typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
			return rawArgs as Record<string, any>;
		}

		if (typeof rawArgs !== 'string') {
			return null;
		}

		const trimmed = rawArgs.trim();
		if (!trimmed) {
			return null;
		}

		try {
			const parsed = JSON.parse(trimmed);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				return parsed as Record<string, any>;
			}
			if (typeof parsed === 'string') {
				const inner = parsed.trim();
				if (inner && (inner.startsWith('{') || inner.startsWith('['))) {
					try {
						const reparsed = JSON.parse(inner);
						if (reparsed && typeof reparsed === 'object' && !Array.isArray(reparsed)) {
							return reparsed as Record<string, any>;
						}
					} catch {
						return null;
					}
				}
			}
		} catch {
			return null;
		}

		return null;
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
			entity_type?: 'project' | 'task' | 'plan' | 'goal' | 'document';
			message?: string;
		},
		defaultContext: ChatContextType
	): LastTurnContext {
		const entities: LastTurnContext['entities'] = {};
		const upsertEntity = (slot: 'projects' | 'tasks' | 'plans' | 'goals' | 'documents') => {
			const id = contextShift.entity_id;
			if (!id) return;
			const list = ((entities as any)[slot] ??= []) as Array<{
				id: string;
				name?: string;
				description?: string;
			}>;
			const existing = list.find((item) => item.id === id);
			if (existing) {
				if (!existing.name && contextShift.entity_name) {
					existing.name = contextShift.entity_name;
				}
				return;
			}
			list.push({
				id,
				name: contextShift.entity_name
			});
		};

		switch (contextShift.entity_type) {
			case 'project':
				upsertEntity('projects');
				break;
			case 'task':
				upsertEntity('tasks');
				break;
			case 'plan':
				upsertEntity('plans');
				break;
			case 'goal':
				upsertEntity('goals');
				break;
			case 'document':
				upsertEntity('documents');
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
	private async checkProjectCreationClarification(request: AgentChatRequest): Promise<{
		needsClarification: boolean;
		events: StreamEvent[];
		updatedMetadata?: ClarificationRoundMetadata;
	}> {
		const existingMetadata = request.projectClarificationMetadata;
		const roundNumber = existingMetadata?.roundNumber ?? 0;

		logger.info('Checking project creation clarification', {
			roundNumber,
			messageLength: request.userMessage.length,
			hasExistingMetadata: !!existingMetadata,
			sessionId: request.sessionId
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
				analyzerMetadata,
				request.sessionId
			);

			logger.debug('Project creation analysis result', {
				hasSufficientContext: analysis.hasSufficientContext,
				confidence: analysis.confidence,
				hasQuestions: !!analysis.clarifyingQuestions?.length,
				inferredType: analysis.inferredProjectType,
				sessionId: request.sessionId
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
			logger.error(error as Error, {
				operation: 'project_creation_clarification',
				sessionId: request.sessionId
			});
			void this.deps.errorLogger.logError(error, {
				userId: request.userId,
				operationType: 'project_create_clarification',
				metadata: {
					sessionId: request.sessionId,
					contextType: request.contextType,
					messageLength: request.userMessage.length,
					messagePreview: sanitizeLogText(request.userMessage, 160),
					roundNumber
				}
			});

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

	private async emitStreamEvent(event: StreamEvent, streamEvents: StreamEvent[]): Promise<void> {
		if (this.streamCallback) {
			await this.streamCallback(event);
			return;
		}
		streamEvents.push(event);
	}

	private buildOperationEventFromToolCall(
		toolCall: ChatToolCall,
		status: 'start' | 'success' | 'error',
		result?: ToolExecutionResult
	): StreamEvent | null {
		const toolName = toolCall?.function?.name;
		if (!toolName) return null;

		const args = this.safeParseToolArgs(toolCall?.function?.arguments);
		let action = this.resolveOperationAction(toolName);
		let entityType = this.resolveOperationEntityType(toolName);
		let entityArgs = args;

		if (toolName === 'tool_exec' && args) {
			const op = typeof args.op === 'string' ? args.op.trim() : '';
			const opArgs =
				args.args && typeof args.args === 'object' && !Array.isArray(args.args)
					? (args.args as Record<string, any>)
					: undefined;
			action = this.resolveOperationActionFromOp(op);
			entityType = this.resolveOperationEntityTypeFromOp(op);
			entityArgs = opArgs ?? args;
		}

		if (!action || !entityType) return null;

		const entityName =
			this.resolveOperationName(entityArgs) ??
			this.resolveOperationNameFromResult(result) ??
			this.fallbackEntityLabel(entityType, action);

		if (!entityName) return null;

		const entityId = this.resolveOperationEntityId(entityArgs);

		return {
			type: 'operation',
			operation: {
				action,
				entity_type: entityType,
				entity_name: entityName,
				status,
				...(entityId ? { entity_id: entityId } : {})
			}
		};
	}

	private safeParseToolArgs(rawArgs: string | null | undefined): Record<string, any> | undefined {
		if (!rawArgs || typeof rawArgs !== 'string') return undefined;
		try {
			return JSON.parse(rawArgs) as Record<string, any>;
		} catch {
			return undefined;
		}
	}

	private resolveOperationAction(
		toolName: string
	): 'list' | 'search' | 'read' | 'create' | 'update' | 'delete' | null {
		if (toolName.startsWith('list_')) return 'list';
		if (toolName.startsWith('search_')) return 'search';
		if (toolName.startsWith('get_')) return 'read';
		if (toolName.startsWith('create_')) return 'create';
		if (toolName.startsWith('update_')) return 'update';
		if (toolName.startsWith('delete_')) return 'delete';
		return null;
	}

	private resolveOperationActionFromOp(
		op: string
	): 'list' | 'search' | 'read' | 'create' | 'update' | 'delete' | null {
		if (!op) return null;
		const parts = op.split('.');
		const action = parts[parts.length - 1];
		switch (action) {
			case 'list':
				return 'list';
			case 'search':
				return 'search';
			case 'get':
				return 'read';
			case 'create':
				return 'create';
			case 'update':
				return 'update';
			case 'delete':
				return 'delete';
			case 'move':
			case 'reorganize':
				return 'update';
			default:
				return null;
		}
	}

	private resolveOperationEntityType(
		toolName: string
	):
		| 'document'
		| 'task'
		| 'goal'
		| 'plan'
		| 'project'
		| 'milestone'
		| 'risk'
		| 'requirement'
		| null {
		const match = toolName.match(
			/(?:list|search|get|create|update|delete)_onto_([a-z_]+?)(?:_details)?$/
		);
		const raw = match?.[1];
		if (!raw) {
			if (toolName.startsWith('get_document_')) {
				return 'document';
			}
			return null;
		}

		const map: Record<string, string> = {
			projects: 'project',
			project: 'project',
			tasks: 'task',
			task: 'task',
			goals: 'goal',
			goal: 'goal',
			plans: 'plan',
			plan: 'plan',
			documents: 'document',
			document: 'document',
			milestones: 'milestone',
			milestone: 'milestone',
			risks: 'risk',
			risk: 'risk',
			requirements: 'requirement',
			requirement: 'requirement'
		};

		const resolved = map[raw];
		return resolved
			? (resolved as
					| 'document'
					| 'task'
					| 'goal'
					| 'plan'
					| 'project'
					| 'milestone'
					| 'risk'
					| 'requirement')
			: null;
	}

	private resolveOperationEntityTypeFromOp(
		op: string
	):
		| 'document'
		| 'task'
		| 'goal'
		| 'plan'
		| 'project'
		| 'milestone'
		| 'risk'
		| 'requirement'
		| null {
		if (!op) return null;
		const parts = op.split('.');
		if (parts.length < 2) return null;
		if (parts[0] !== 'onto') return null;
		const entity = parts[1]!;
		const map: Record<string, string> = {
			task: 'task',
			project: 'project',
			document: 'document',
			goal: 'goal',
			plan: 'plan',
			milestone: 'milestone',
			risk: 'risk',
			requirement: 'requirement'
		};
		const resolved = map[entity];
		return resolved
			? (resolved as
					| 'document'
					| 'task'
					| 'goal'
					| 'plan'
					| 'project'
					| 'milestone'
					| 'risk'
					| 'requirement')
			: null;
	}

	private resolveOperationName(args?: Record<string, any>): string | undefined {
		if (!args) return undefined;
		const keys = [
			'title',
			'name',
			'document_title',
			'task_title',
			'goal_name',
			'plan_name',
			'project_name',
			'milestone_title',
			'risk_title',
			'requirement_text'
		];
		for (const key of keys) {
			const value = args[key];
			if (typeof value === 'string' && value.trim().length > 0) {
				return value.trim();
			}
		}
		return undefined;
	}

	private resolveOperationNameFromResult(result?: ToolExecutionResult): string | undefined {
		const data = result?.data as Record<string, any> | null | undefined;
		if (!data || typeof data !== 'object') return undefined;
		const payload =
			data && typeof data.result === 'object' && data.result !== null
				? (data.result as Record<string, any>)
				: data;
		const entity =
			payload.document ??
			payload.task ??
			payload.goal ??
			payload.plan ??
			payload.project ??
			payload.milestone ??
			payload.risk ??
			payload.requirement;
		if (entity && typeof entity === 'object') {
			const title =
				(entity as Record<string, any>).title ?? (entity as Record<string, any>).name;
			if (typeof title === 'string' && title.trim().length > 0) {
				return title.trim();
			}
		}
		return undefined;
	}

	private resolveOperationEntityId(args?: Record<string, any>): string | undefined {
		if (!args) return undefined;
		const keys = [
			'document_id',
			'task_id',
			'goal_id',
			'plan_id',
			'project_id',
			'milestone_id',
			'risk_id',
			'requirement_id',
			'entity_id'
		];
		for (const key of keys) {
			const value = args[key];
			if (typeof value === 'string' && value.trim().length > 0) {
				return value;
			}
		}
		return undefined;
	}

	private fallbackEntityLabel(
		entityType:
			| 'document'
			| 'task'
			| 'goal'
			| 'plan'
			| 'project'
			| 'milestone'
			| 'risk'
			| 'requirement',
		action: 'list' | 'search' | 'read' | 'create' | 'update' | 'delete'
	): string {
		if (action === 'list' || action === 'search') {
			return `${entityType}s`;
		}
		return entityType;
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
			logger.warn('Failed to update planner agent status', {
				plannerAgentId,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	private toStreamUsage(usage?: SynthesisUsage): { total_tokens: number } | undefined {
		if (!usage || typeof usage.totalTokens !== 'number') {
			return undefined;
		}
		return { total_tokens: usage.totalTokens };
	}

	private shouldUsePlanSynthesisLLM(): boolean {
		if (typeof process === 'undefined') {
			return false;
		}
		const flag = String(process.env.AGENTIC_CHAT_ENABLE_PLAN_SYNTHESIS_LLM ?? '').toLowerCase();
		return ['true', '1', 'yes'].includes(flag);
	}

	private buildPlanExecutionDetails(plan: AgentPlan): Record<string, any> {
		const steps = plan.steps.map((step) => ({
			stepNumber: step.stepNumber,
			description: step.description,
			status: step.status,
			executorRequired: step.executorRequired,
			result: this.compactStepResult(step.result)
		}));

		const completedSteps = steps.filter((step) => step.status === 'completed').length;
		const failedSteps = steps.filter((step) => step.status === 'failed').length;

		return {
			plan_id: plan.id,
			status: plan.status,
			strategy: plan.strategy,
			step_count: steps.length,
			completed_steps: completedSteps,
			failed_steps: failedSteps,
			steps
		};
	}

	private buildPlanExecutionSummary(details: Record<string, any>): string {
		const status = details.status ?? 'unknown';
		const stepCount = details.step_count ?? 0;
		const completed = details.completed_steps ?? 0;
		const failed = details.failed_steps ?? 0;
		const lines = [
			`Plan status: ${status}`,
			`Steps: ${completed}/${stepCount} completed${failed ? `, ${failed} failed` : ''}`
		];

		if (Array.isArray(details.steps)) {
			for (const step of details.steps) {
				if (!step) continue;
				const resultSuffix = step.result ? `: ${step.result}` : '';
				lines.push(
					`${step.stepNumber}. ${step.description} (${step.status})${resultSuffix}`
				);
			}
		}

		return lines.join('\n');
	}

	private compactStepResult(result: unknown): string | undefined {
		if (result === null || result === undefined) {
			return undefined;
		}
		if (typeof result === 'string') {
			return this.truncateText(result, 160);
		}
		if (Array.isArray(result)) {
			return `Result items: ${result.length}`;
		}
		if (typeof result === 'object') {
			const record = result as Record<string, any>;
			const candidates = [
				record.summary,
				record.message,
				record.notes,
				record.title,
				record.status,
				record.result,
				record.data?.summary,
				record.data?.message
			];
			const firstString = candidates.find((value) => typeof value === 'string');
			if (typeof firstString === 'string') {
				return this.truncateText(firstString, 160);
			}
		}
		return undefined;
	}

	private truncateText(text: string, maxLength: number): string {
		if (text.length <= maxLength) {
			return text;
		}
		return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
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

	private async safeUpdateTimingMetric(
		timingMetricsId: string | undefined,
		data: Record<string, any>
	): Promise<void> {
		if (!timingMetricsId) {
			return;
		}
		try {
			await this.deps.persistenceService.updateTimingMetric(timingMetricsId, data);
		} catch (error) {
			logger.debug('Failed to update timing metrics', {
				timingMetricsId,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}
}
