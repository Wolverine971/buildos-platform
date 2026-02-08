// apps/web/src/routes/api/agent/stream/services/stream-handler.ts
/**
 * Stream Handler Service for /api/agent/stream endpoint.
 *
 * Manages SSE stream lifecycle with metadata consolidation semantics.
 *
 * CRITICAL STREAM GUARANTEES (from original implementation):
 * 1. `done` event is ALWAYS sent (on success AND error)
 * 2. `error` event ALWAYS precedes `done` (if error occurs)
 * 3. Stream-managed metadata is persisted in a SINGLE write in the finally block
 *    (agent state reconciliation may issue a follow-up update after the stream closes)
 * 4. Stream is ALWAYS closed in finally block
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Database,
	ChatSession,
	ChatContextType,
	ChatMessage,
	ProjectFocus,
	AgentSSEMessage
} from '@buildos/shared-types';
import type {
	OntologyContext,
	LastTurnContext,
	AgentState
} from '$lib/types/agent-chat-enhancement';
import type {
	StreamEvent,
	ProjectClarificationMetadata
} from '$lib/services/agentic-chat/shared/types';
import { SSEResponse } from '$lib/utils/sse-response';
import { createAgentChatOrchestrator } from '$lib/services/agentic-chat';
import { ChatCompressionService } from '$lib/services/chat-compression-service';
import {
	AgentStateReconciliationService,
	type AgentStateMessageSnapshot,
	type AgentStateToolSummary
} from '$lib/services/agentic-chat/state/agent-state-reconciliation-service';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createLogger } from '$lib/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { getDocTree } from '$lib/services/ontology/doc-structure.service';
import type {
	AgentSessionMetadata,
	StreamRequest,
	StreamState,
	ToolResultData,
	ContextShiftData
} from '../types';
import { CONTEXT_USAGE_TOKEN_BUDGET } from '../constants';
import {
	normalizeContextType,
	buildQuickUsageSnapshot,
	buildContextShiftLastTurnContext,
	generateLastTurnContext,
	mapPlannerEventToSSE
} from '../utils';
import { createSessionManager } from './session-manager';
import { createMessagePersister } from './message-persister';
import { buildDocStructureCacheKey } from '$lib/services/agentic-chat/context-prewarm';

const logger = createLogger('StreamHandler');

// ============================================
// STREAM HANDLER TYPES
// ============================================

export interface StreamHandlerParams {
	supabase: SupabaseClient<Database>;
	fetch: typeof globalThis.fetch;
	request: StreamRequest;
	requestAbortSignal?: AbortSignal;
	session: ChatSession;
	ontologyContext: OntologyContext | null;
	metadata: AgentSessionMetadata;
	pendingMetadataUpdates?: Partial<AgentSessionMetadata>;
	conversationHistory: ChatMessage[];
	userId: string;
	actorId: string;
	httpReferer?: string;
}

// ============================================
// STREAM HANDLER CLASS
// ============================================

/**
 * Handles SSE stream lifecycle with metadata consolidation.
 *
 * IMPORTANT: This class preserves the critical stream semantics:
 * - done event always sent
 * - error event precedes done
 * - stream metadata single-write in finally block (agent state reconciliation may follow)
 * - stream always closed
 */
export class StreamHandler {
	private supabase: SupabaseClient<Database>;
	private sessionManager: ReturnType<typeof createSessionManager>;
	private messagePersister: ReturnType<typeof createMessagePersister>;
	private errorLogger: ErrorLoggerService;
	private agentStateReconciler: AgentStateReconciliationService;
	private pendingSseFlush?: () => Promise<void>;

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
		this.sessionManager = createSessionManager(supabase);
		this.messagePersister = createMessagePersister(supabase);
		this.errorLogger = ErrorLoggerService.getInstance(supabase);
		this.agentStateReconciler = new AgentStateReconciliationService(supabase, this.errorLogger);
	}

	/**
	 * Create and manage the SSE stream for agent conversation.
	 *
	 * @param params - Stream handler parameters
	 * @returns SSE Response
	 */
	createAgentStream(params: StreamHandlerParams): Response {
		const agentStream = SSEResponse.createChatStream();
		this.startAgentStream(params, agentStream);
		return agentStream.response;
	}

	/**
	 * Start orchestration on a provided SSE stream.
	 * Used to open the stream early before preflight work completes.
	 */
	startAgentStream(
		params: StreamHandlerParams,
		agentStream: ReturnType<typeof SSEResponse.createChatStream>
	): void {
		const {
			supabase: _supabase,
			fetch: fetchFn,
			request,
			requestAbortSignal,
			session,
			ontologyContext,
			metadata,
			pendingMetadataUpdates,
			conversationHistory,
			userId,
			actorId,
			httpReferer
		} = params;

		const normalizedContextType = normalizeContextType(
			session.context_type &&
				request.context_type !== session.context_type &&
				session.entity_id
				? (session.context_type as ChatContextType)
				: request.context_type
		);
		const resolvedEntityId = request.entity_id ?? session.entity_id ?? undefined;
		const resolvedFocus = metadata.focus ?? request.project_focus ?? null;

		// Initialize stream state
		const pendingMetadata = pendingMetadataUpdates ?? {};
		const state: StreamState = {
			assistantResponse: '',
			toolCalls: [],
			toolResults: [],
			totalTokens: 0,
			completionSent: false,
			contextShiftOccurred: false,
			effectiveContextType: normalizedContextType,
			pendingMetadataUpdates: { ...pendingMetadata },
			hasPendingMetadataUpdate: Object.keys(pendingMetadata).length > 0
		};

		// Merge session metadata with any pending updates
		const sessionMetadata: AgentSessionMetadata = { ...metadata };

		// Generate initial last turn context
		const toolResultsFromHistory = this.extractToolResultsFromHistory(conversationHistory);
		// Note: toolResultsForContext is computed synchronously here using history extraction.
		// If history is provided but no tool results found, we'll load them async in runOrchestration.
		const toolResultsForContext = toolResultsFromHistory;

		let lastTurnContextForPlanner =
			request.last_turn_context ??
			generateLastTurnContext(conversationHistory, normalizedContextType, {
				toolResults: toolResultsForContext
			}) ??
			undefined;

		// Send quick usage estimate immediately
		const historyForUsage = [
			...conversationHistory,
			{ content: request.message, created_at: new Date().toISOString() }
		];
		const quickUsageSnapshot = buildQuickUsageSnapshot(
			historyForUsage,
			CONTEXT_USAGE_TOKEN_BUDGET
		);
		void agentStream
			.sendMessage({
				type: 'context_usage',
				usage: quickUsageSnapshot
			})
			.catch((error) => {
				logger.warn('Failed to emit initial context usage snapshot', { error });
			});

		// Fetch richer usage stats in background
		this.sendEnhancedUsageSnapshot(agentStream, session.id, historyForUsage);

		// Start async orchestration
		this.runOrchestration({
			agentStream,
			state,
			sessionMetadata,
			session,
			request,
			ontologyContext,
			conversationHistory,
			resolvedEntityId: resolvedEntityId ?? undefined,
			lastTurnContextForPlanner,
			resolvedFocus,
			normalizedContextType,
			userId,
			actorId,
			fetchFn,
			requestAbortSignal,
			httpReferer
		}).catch((uncaughtError) => {
			// Safety net for errors in error handling or finally block
			logger.error('Uncaught error in agent stream', { error: uncaughtError });
			try {
				agentStream.close();
			} catch {
				// Ignore - stream may already be closed
			}
		});
	}

	/**
	 * Run the main orchestration loop.
	 * This is the async IIFE from the original implementation.
	 */
	private async runOrchestration(params: {
		agentStream: ReturnType<typeof SSEResponse.createChatStream>;
		state: StreamState;
		sessionMetadata: AgentSessionMetadata;
		session: ChatSession;
		request: StreamRequest;
		requestAbortSignal?: AbortSignal;
		ontologyContext: OntologyContext | null;
		conversationHistory: ChatMessage[];
		resolvedEntityId?: string;
		lastTurnContextForPlanner: LastTurnContext | undefined;
		resolvedFocus: ProjectFocus | null;
		normalizedContextType: ChatContextType;
		userId: string;
		actorId: string;
		fetchFn: typeof globalThis.fetch;
		httpReferer?: string;
	}): Promise<void> {
		const {
			agentStream,
			state,
			sessionMetadata,
			session,
			request,
			requestAbortSignal,
			ontologyContext,
			conversationHistory,
			resolvedEntityId,
			resolvedFocus,
			normalizedContextType,
			userId,
			actorId,
			fetchFn,
			httpReferer
		} = params;

		let { lastTurnContextForPlanner } = params;
		const userMessageTimestamp = new Date().toISOString();
		const abortSignal = requestAbortSignal;
		const streamRunId = request.stream_run_id;
		const timingStartMs = Date.now();
		const timingMetricsId = uuidv4();
		const timingInsertPromise = this.createTimingMetricRecord({
			id: timingMetricsId,
			userId,
			sessionId: session.id,
			contextType: normalizedContextType,
			messageLength: request.message.length,
			messageReceivedAt: userMessageTimestamp,
			streamRunId
		});

		// If no lastTurnContext provided and history exists but no tool results found,
		// skip DB hydration to keep TTFR low (tool results can be fetched later if needed).
		if (!lastTurnContextForPlanner && request.history && request.history.length > 0) {
			const toolResultsFromHistory = this.extractToolResultsFromHistory(conversationHistory);
			if (toolResultsFromHistory.length === 0) {
				logger.debug('Skipping tool result hydration to keep TTFR low', {
					sessionId: session.id
				});
			}
		}

		try {
			// Send focus active event if applicable
			if (resolvedFocus) {
				await agentStream.sendMessage({
					type: 'focus_active',
					focus: resolvedFocus
				});
			}

			// Create orchestrator
			const orchestrator = createAgentChatOrchestrator(this.supabase, {
				fetchFn,
				httpReferer,
				appName: 'BuildOS Agentic Chat'
			});

			// Extract project clarification metadata for project_create context
			const projectClarificationMetadata =
				normalizedContextType === 'project_create'
					? sessionMetadata.projectClarification
					: undefined;

			// Build orchestrator request
			const orchestratorRequest = {
				userId,
				sessionId: session.id,
				userMessage: request.message,
				contextType: normalizedContextType,
				entityId: resolvedEntityId ?? request.entity_id,
				conversationHistory,
				chatSession: session,
				ontologyContext: ontologyContext || undefined,
				lastTurnContext: lastTurnContextForPlanner || undefined,
				projectFocus: resolvedFocus || undefined,
				contextCache: {
					location: sessionMetadata.locationContextCache,
					linkedEntities: sessionMetadata.linkedEntitiesCache,
					docStructure: sessionMetadata.docStructureCache
				},
				projectClarificationMetadata,
				timingMetricsId,
				abortSignal
			};

			// Create event handler
			const sendEvent = this.createEventHandler({
				agentStream,
				state,
				sessionMetadata,
				session,
				normalizedContextType,
				userId,
				abortSignal,
				timing: {
					metricsId: timingMetricsId,
					insertPromise: timingInsertPromise,
					startMs: timingStartMs,
					firstEventRecorded: false,
					firstResponseRecorded: false
				}
			});

			// Run orchestration
			for await (const _ of orchestrator.streamConversation(orchestratorRequest, sendEvent)) {
				// Events are handled via the callback
				if (abortSignal?.aborted) {
					break;
				}
			}

			if (abortSignal?.aborted) {
				await this.persistInterruptedState({
					state,
					session,
					userId,
					streamRunId
				});
				return;
			}

			// Persist assistant response and tool results
			if (state.assistantResponse.trim() || state.toolCalls.length > 0) {
				const assistantMessageTimestamp = new Date().toISOString();

				await this.messagePersister.persistAssistantMessage({
					sessionId: session.id,
					userId,
					content: state.assistantResponse,
					toolCalls: state.toolCalls.length > 0 ? state.toolCalls : undefined,
					timestamp: assistantMessageTimestamp
				});

				// Persist tool results
				if (state.toolCalls.length > 0 && state.toolResults.length > 0) {
					await this.messagePersister.persistToolResults({
						sessionId: session.id,
						userId,
						toolCalls: state.toolCalls,
						toolResults: state.toolResults
					});
				}

				await this.refreshDocStructureCacheIfNeeded({
					toolResults: state.toolResults,
					state,
					sessionMetadata,
					fallbackProjectId: resolvedFocus?.projectId ?? resolvedEntityId ?? null
				});

				// Generate and send refreshed last turn context
				// Build partial message objects and cast to satisfy ChatMessage[]
				const userMsg = {
					session_id: session.id,
					user_id: userId,
					role: 'user' as const,
					content: request.message,
					created_at: userMessageTimestamp
				};
				const assistantMsg = {
					session_id: session.id,
					user_id: userId,
					role: 'assistant' as const,
					content: state.assistantResponse || '',
					created_at: assistantMessageTimestamp,
					tool_calls: state.toolCalls.length > 0 ? state.toolCalls : undefined
				};
				const historyAfterTurn = [
					...conversationHistory,
					userMsg as unknown as ChatMessage,
					assistantMsg as unknown as ChatMessage
				];

				const refreshedContext = generateLastTurnContext(
					historyAfterTurn,
					state.effectiveContextType,
					{ toolResults: state.toolResults }
				);

				if (refreshedContext) {
					await agentStream.sendMessage({
						type: 'last_turn_context',
						context: refreshedContext
					});
				}
			}

			// Send done event if not already sent
			if (!state.completionSent && !abortSignal?.aborted) {
				await agentStream.sendMessage({
					type: 'done',
					usage: {
						prompt_tokens: 0,
						completion_tokens: 0,
						total_tokens: state.totalTokens
					},
					finished_reason: 'stop'
				} as AgentSSEMessage);
			}

			this.queueAgentStateReconciliation({
				session,
				sessionMetadata,
				state,
				requestMessage: request.message,
				conversationHistory,
				contextType: state.effectiveContextType,
				userId,
				httpReferer
			});
		} catch (streamError) {
			if (abortSignal?.aborted) {
				await this.persistInterruptedState({
					state,
					session,
					userId,
					streamRunId
				});
				return;
			}

			logger.error('Agent streaming error', {
				error: streamError,
				sessionId: session.id,
				userId,
				contextType: state.effectiveContextType,
				entityId: request.entity_id,
				hasOntology: !!ontologyContext,
				messageLength: request.message.length
			});
			await this.errorLogger.logError(streamError, {
				userId,
				projectId: resolvedFocus?.projectId ?? resolvedEntityId,
				endpoint: '/api/agent/stream',
				httpMethod: 'POST',
				operationType: 'agent_stream',
				metadata: {
					sessionId: session.id,
					contextType: state.effectiveContextType,
					entityId: request.entity_id,
					hasOntology: !!ontologyContext,
					messageLength: request.message.length,
					streamRunId
				}
			});

			// CRITICAL: Send error event, then done event
			await agentStream.sendMessage({
				type: 'error',
				error:
					streamError instanceof Error
						? streamError.message
						: 'Failed to generate response'
			});

			// Ensure done is sent even when errors occur
			if (!state.completionSent && !abortSignal?.aborted) {
				state.completionSent = true;
				await agentStream.sendMessage({
					type: 'done',
					usage: {
						prompt_tokens: 0,
						completion_tokens: 0,
						total_tokens: state.totalTokens
					},
					finished_reason: 'error'
				} as AgentSSEMessage);
			}
		} finally {
			if (abortSignal?.aborted) {
				await agentStream.close();
				return;
			}
			if (this.pendingSseFlush) {
				try {
					await this.pendingSseFlush();
				} catch (flushError) {
					logger.warn('Failed to flush pending SSE messages', { error: flushError });
				} finally {
					this.pendingSseFlush = undefined;
				}
			}
			// CRITICAL: Consolidate metadata persistence - single DB write
			const shouldPersistMetadata =
				state.hasPendingMetadataUpdate ||
				sessionMetadata.ontologyCache ||
				Object.keys(state.pendingMetadataUpdates).length > 0;

			if (shouldPersistMetadata) {
				try {
					const finalMetadata = {
						...sessionMetadata,
						...state.pendingMetadataUpdates
					};

					await this.sessionManager.updateSessionMetadata(session.id, finalMetadata);
				} catch (persistError) {
					logger.error('Exception persisting session metadata', {
						error: persistError,
						sessionId: session.id
					});
				}
			}

			// CRITICAL: Always close stream
			await agentStream.close();
		}
	}

	/**
	 * Create the event handler callback for the orchestrator.
	 */
	private createEventHandler(params: {
		agentStream: ReturnType<typeof SSEResponse.createChatStream>;
		state: StreamState;
		sessionMetadata: AgentSessionMetadata;
		session: ChatSession;
		normalizedContextType: ChatContextType;
		userId: string;
		abortSignal?: AbortSignal;
		timing?: {
			metricsId?: string;
			insertPromise?: Promise<boolean>;
			startMs: number;
			firstEventRecorded: boolean;
			firstResponseRecorded: boolean;
		};
	}): (event: StreamEvent | AgentSSEMessage | null | undefined) => Promise<void> {
		const {
			agentStream,
			state,
			sessionMetadata,
			session,
			normalizedContextType,
			userId,
			abortSignal,
			timing
		} = params;

		const pendingMessages: AgentSSEMessage[] = [];
		let flushTimer: ReturnType<typeof setTimeout> | null = null;
		let isFlushing = false;

		const flushPending = async () => {
			if (isFlushing) return;
			if (flushTimer) {
				clearTimeout(flushTimer);
				flushTimer = null;
			}
			if (pendingMessages.length === 0) return;
			isFlushing = true;
			const batch = pendingMessages.splice(0, pendingMessages.length);
			try {
				for (const message of batch) {
					await agentStream.sendMessage(message);
				}
			} finally {
				isFlushing = false;
			}
		};

		const scheduleFlush = () => {
			if (flushTimer) return;
			flushTimer = setTimeout(() => {
				void flushPending();
			}, 16);
		};

		this.pendingSseFlush = flushPending;

		return async (event: StreamEvent | AgentSSEMessage | null | undefined) => {
			if (!event) return;
			if (abortSignal?.aborted) return;

			// Track timing for first event/response
			if (timing?.metricsId) {
				const now = Date.now();
				if (!timing.firstEventRecorded) {
					timing.firstEventRecorded = true;
					const update = () =>
						this.updateTimingMetric(timing.metricsId as string, {
							first_event_at: new Date(now).toISOString(),
							time_to_first_event_ms: Math.max(0, Math.round(now - timing.startMs))
						});
					if (timing.insertPromise) {
						void timing.insertPromise.then((inserted) => {
							if (inserted) {
								void update();
							}
						});
					} else {
						void update();
					}
				}
				if (
					!timing.firstResponseRecorded &&
					(event as StreamEvent).type === 'text' &&
					typeof (event as any).content === 'string' &&
					(event as any).content.trim().length > 0
				) {
					timing.firstResponseRecorded = true;
					const update = () =>
						this.updateTimingMetric(timing.metricsId as string, {
							first_response_at: new Date(now).toISOString(),
							time_to_first_response_ms: Math.max(0, Math.round(now - timing.startMs))
						});
					if (timing.insertPromise) {
						void timing.insertPromise.then((inserted) => {
							if (inserted) {
								void update();
							}
						});
					} else {
						void update();
					}
				}
			}

			// Track text content
			if ((event as StreamEvent).type === 'text' && (event as any).content) {
				state.assistantResponse += (event as any).content;
			}

			// Track tool calls
			if ((event as StreamEvent).type === 'tool_call' && (event as any).toolCall) {
				const toolCall = (event as any).toolCall;
				state.toolCalls.push(toolCall);
				this.applyExpectationFromToolCall(sessionMetadata, session.id, toolCall, state);
			}

			// Handle clarifying questions
			if ((event as StreamEvent).type === 'clarifying_questions') {
				await this.handleClarifyingQuestions(
					event as any,
					state,
					sessionMetadata,
					normalizedContextType,
					session.id
				);
			}

			// Track tool results and handle context shifts
			if ((event as StreamEvent).type === 'tool_result' && (event as any).result) {
				await this.handleToolResult(
					event as any,
					agentStream,
					state,
					session,
					normalizedContextType,
					userId,
					sessionMetadata
				);
			}

			// Track done event
			if ((event as StreamEvent).type === 'done') {
				state.completionSent = true;
				if ((event as any).usage?.total_tokens) {
					state.totalTokens += (event as any).usage.total_tokens;
				}
			}

			// Map and send to client
			const sseMessage = mapPlannerEventToSSE(event);
			if (!sseMessage) return;

			if (sseMessage.type === 'error' || sseMessage.type === 'done') {
				await flushPending();
				await agentStream.sendMessage(sseMessage);
				return;
			}

			pendingMessages.push(sseMessage);
			if (pendingMessages.length >= 24) {
				await flushPending();
				return;
			}
			scheduleFlush();
		};
	}

	private async createTimingMetricRecord(params: {
		id: string;
		userId: string;
		sessionId: string;
		contextType: ChatContextType;
		messageLength: number;
		messageReceivedAt: string;
		streamRunId?: number;
	}): Promise<boolean> {
		try {
			const metadata =
				typeof params.streamRunId === 'number' ? { stream_run_id: params.streamRunId } : {};
			const { error } = await this.supabase.from('timing_metrics').insert({
				id: params.id,
				user_id: params.userId,
				session_id: params.sessionId,
				context_type: params.contextType,
				message_length: params.messageLength,
				message_received_at: params.messageReceivedAt,
				metadata
			});

			if (error) {
				throw error;
			}

			return true;
		} catch (error) {
			logger.warn('Failed to create timing metrics record', {
				error: error instanceof Error ? error.message : String(error),
				sessionId: params.sessionId
			});
			return false;
		}
	}

	private async updateTimingMetric(id: string, data: Record<string, any>): Promise<void> {
		try {
			const { error } = await this.supabase
				.from('timing_metrics')
				.update({ ...data, updated_at: new Date().toISOString() })
				.eq('id', id);

			if (error) {
				throw error;
			}
		} catch (error) {
			logger.warn('Failed to update timing metrics record', {
				error: error instanceof Error ? error.message : String(error),
				timingMetricsId: id
			});
		}
	}

	/**
	 * Handle clarifying questions event.
	 */
	private async handleClarifyingQuestions(
		event: { questions?: string[]; metadata?: ProjectClarificationMetadata },
		state: StreamState,
		sessionMetadata: AgentSessionMetadata,
		contextType: ChatContextType,
		sessionId: string
	): Promise<void> {
		const questions = event.questions ?? [];
		logger.info('Clarifying questions asked', {
			questionCount: questions.length,
			contextType
		});

		// Update metadata for project_create context
		if (contextType === 'project_create') {
			if (event.metadata) {
				sessionMetadata.projectClarification = event.metadata;
				state.hasPendingMetadataUpdate = true;
				logger.debug('Clarification metadata updated from event', {
					roundNumber: event.metadata.roundNumber,
					sessionId
				});
				return;
			}

			const currentMeta = sessionMetadata.projectClarification ?? {
				roundNumber: 0,
				accumulatedContext: '',
				previousQuestions: [],
				previousResponses: []
			};

			sessionMetadata.projectClarification = {
				roundNumber: currentMeta.roundNumber + 1,
				accumulatedContext: currentMeta.accumulatedContext,
				previousQuestions: [...currentMeta.previousQuestions, ...questions],
				previousResponses: currentMeta.previousResponses
			};

			state.hasPendingMetadataUpdate = true;
			logger.debug('Clarification metadata updated in memory', {
				roundNumber: sessionMetadata.projectClarification.roundNumber,
				sessionId
			});
		}
	}

	/**
	 * Handle tool result event, including context shifts.
	 */
	private async handleToolResult(
		event: { result: any },
		agentStream: ReturnType<typeof SSEResponse.createChatStream>,
		state: StreamState,
		session: ChatSession,
		normalizedContextType: ChatContextType,
		userId: string,
		sessionMetadata: AgentSessionMetadata
	): Promise<void> {
		const result = event.result;

		// Extract success/error info from result
		const success =
			result.success ?? (result.error === undefined && result.error_message === undefined);
		const errorMessage = result.error ?? result.error_message ?? null;
		const errorCode = result.error_code ?? (success === false ? 'TOOL_EXECUTION_ERROR' : null);

		// Build tool result data with error tracking
		const toolResultData: ToolResultData = {
			tool_call_id: result.tool_call_id ?? result.toolCallId ?? '',
			tool_name: result.tool_name ?? result.toolName,
			result: result.tool_result ?? result.result ?? result.data ?? result,
			success,
			error: errorMessage,
			error_code: errorCode,
			entities_accessed: result.entities_accessed ?? result.entitiesAccessed
		};

		state.toolResults.push(toolResultData);
		this.applyAgentStateFromToolResult(sessionMetadata, session.id, toolResultData, state);

		// Check for context shift
		const contextShift: ContextShiftData | undefined =
			result?.context_shift ?? result?.data?.context_shift ?? result?.result?.context_shift;

		if (contextShift) {
			await this.handleContextShift(
				contextShift,
				agentStream,
				state,
				session,
				normalizedContextType,
				userId
			);
		}
	}

	private applyAgentStateFromToolResult(
		sessionMetadata: AgentSessionMetadata,
		sessionId: string,
		result: ToolResultData,
		state: StreamState
	): void {
		const agentState = this.ensureAgentState(sessionMetadata, sessionId);
		const payload = result.result as Record<string, any> | null | undefined;

		const extractedEntities = this.extractEntitiesFromPayload(payload);
		if (extractedEntities.length > 0) {
			const entityKey = (entry: { id: string; kind: string }) => `${entry.kind}:${entry.id}`;
			const existing = new Map(
				agentState.current_understanding.entities.map((e) => [entityKey(e), e])
			);
			for (const entity of extractedEntities) {
				existing.set(entityKey(entity), entity);
			}
			agentState.current_understanding.entities = Array.from(existing.values());
		}

		const extractedDependencies = this.extractDependenciesFromPayload(payload);
		if (extractedDependencies.length > 0) {
			const depKey = (entry: { from: string; to: string; rel?: string }) =>
				`${entry.from}:${entry.to}:${entry.rel ?? ''}`;
			const existing = new Map(
				agentState.current_understanding.dependencies.map((d) => [depKey(d), d])
			);
			for (const dep of extractedDependencies) {
				existing.set(depKey(dep), dep);
			}
			agentState.current_understanding.dependencies = Array.from(existing.values());
		}

		const expectationUpdate = this.verifyExpectations(agentState, payload);
		if (expectationUpdate) {
			if (expectationUpdate.assumptions?.length) {
				agentState.assumptions = [
					...agentState.assumptions,
					...expectationUpdate.assumptions
				];
			}
			if (expectationUpdate.expectations?.length) {
				agentState.expectations = expectationUpdate.expectations;
			}
		}

		sessionMetadata.agent_state = agentState;
		state.pendingMetadataUpdates.agent_state = agentState;
		state.hasPendingMetadataUpdate = true;
	}

	private extractProjectIdFromToolResult(result: ToolResultData): string | null {
		const payload = result.result as Record<string, any> | null | undefined;
		if (!payload || typeof payload !== 'object') return null;

		const candidates = [
			payload.project_id,
			payload.projectId,
			payload.project?.id,
			payload.document?.project_id,
			payload.document?.projectId,
			payload.updatedDocument?.project_id,
			payload.updatedDocument?.projectId,
			payload.goal?.project_id,
			payload.goal?.projectId,
			payload.plan?.project_id,
			payload.plan?.projectId,
			payload.task?.project_id,
			payload.task?.projectId,
			payload.milestone?.project_id,
			payload.milestone?.projectId
		];

		for (const candidate of candidates) {
			if (typeof candidate === 'string' && candidate.length > 0) {
				return candidate;
			}
		}

		return null;
	}

	private async refreshDocStructureCacheIfNeeded(params: {
		toolResults: ToolResultData[];
		state: StreamState;
		sessionMetadata: AgentSessionMetadata;
		fallbackProjectId?: string | null;
	}): Promise<void> {
		const { toolResults, state, sessionMetadata, fallbackProjectId } = params;
		if (!toolResults || toolResults.length === 0) return;

		const mutatingTools = new Set([
			'create_onto_document',
			'move_document_in_tree',
			'update_onto_document',
			'delete_onto_document',
			'create_task_document'
		]);

		const relevantResults = toolResults.filter(
			(result) =>
				result.success !== false &&
				typeof result.tool_name === 'string' &&
				mutatingTools.has(result.tool_name)
		);

		if (relevantResults.length === 0) return;

		let projectId: string | null = null;
		for (const result of relevantResults) {
			projectId = this.extractProjectIdFromToolResult(result) ?? projectId;
			if (projectId) break;
		}

		if (!projectId && fallbackProjectId) {
			projectId = fallbackProjectId;
		}

		if (!projectId) return;

		try {
			const tree = await getDocTree(this.supabase, projectId, {
				includeDocuments: false,
				includeContent: false
			});

			const cache = {
				cacheKey: buildDocStructureCacheKey(projectId),
				loadedAt: Date.now(),
				projectId,
				structure: tree.structure,
				documents: {},
				unlinked: []
			};

			sessionMetadata.docStructureCache = cache;
			state.pendingMetadataUpdates.docStructureCache = cache;
			state.hasPendingMetadataUpdate = true;
		} catch (error) {
			logger.warn('Failed to refresh doc_structure cache after tool execution', {
				error,
				projectId
			});
		}
	}

	private ensureAgentState(sessionMetadata: AgentSessionMetadata, sessionId: string): AgentState {
		const existing = sessionMetadata.agent_state;
		if (existing && typeof existing === 'object') {
			return {
				sessionId: existing.sessionId ?? sessionId,
				current_understanding: existing.current_understanding ?? {
					entities: [],
					dependencies: []
				},
				assumptions: Array.isArray(existing.assumptions) ? existing.assumptions : [],
				expectations: Array.isArray(existing.expectations) ? existing.expectations : [],
				tentative_hypotheses: Array.isArray(existing.tentative_hypotheses)
					? existing.tentative_hypotheses
					: [],
				items: Array.isArray(existing.items) ? existing.items : [],
				lastSummarizedAt: existing.lastSummarizedAt
			};
		}

		const fresh: AgentState = {
			sessionId,
			current_understanding: { entities: [], dependencies: [] },
			assumptions: [],
			expectations: [],
			tentative_hypotheses: [],
			items: []
		};
		sessionMetadata.agent_state = fresh;
		return fresh;
	}

	private applyExpectationFromToolCall(
		sessionMetadata: AgentSessionMetadata,
		sessionId: string,
		toolCall: { id?: string; function?: { name?: string; arguments?: string | null } },
		state: StreamState
	): void {
		const toolName = toolCall?.function?.name;
		if (!toolName) return;

		const action = this.resolveOperationAction(toolName);
		if (!action || !['create', 'update', 'delete'].includes(action)) return;

		const entityType = this.resolveOperationEntityType(toolName);
		if (!entityType) return;

		const args = this.safeParseToolArgs(toolCall?.function?.arguments);
		const expectationId = toolCall.id ? `exp:${toolCall.id}` : `exp:${uuidv4()}`;
		const expectedIds = this.resolveExpectedIds(args);
		const expectedOutcome = this.buildExpectedOutcome(action, entityType, args);

		const agentState = this.ensureAgentState(sessionMetadata, sessionId);
		if (agentState.expectations.some((e) => e.id === expectationId)) return;

		agentState.expectations = [
			...agentState.expectations,
			{
				id: expectationId,
				action,
				expected_outcome: expectedOutcome,
				expected_ids: expectedIds.length > 0 ? expectedIds : undefined,
				expected_type: entityType,
				expected_count: action === 'create' ? 1 : undefined,
				status: 'pending'
			}
		];

		sessionMetadata.agent_state = agentState;
		state.pendingMetadataUpdates.agent_state = agentState;
		state.hasPendingMetadataUpdate = true;
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

	private resolveExpectedIds(args?: Record<string, any>): string[] {
		if (!args) return [];
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
		const ids: string[] = [];
		for (const key of keys) {
			const value = args[key];
			if (typeof value === 'string' && value.trim().length > 0) {
				ids.push(value);
			}
		}
		return ids;
	}

	private buildExpectedOutcome(
		action: 'create' | 'update' | 'delete',
		entityType:
			| 'document'
			| 'task'
			| 'goal'
			| 'plan'
			| 'project'
			| 'milestone'
			| 'risk'
			| 'requirement',
		args?: Record<string, any>
	): string {
		const name =
			(args?.title as string | undefined) ??
			(args?.name as string | undefined) ??
			(args?.document_title as string | undefined) ??
			(args?.task_title as string | undefined) ??
			(args?.goal_name as string | undefined) ??
			(args?.plan_name as string | undefined);
		if (name && name.trim().length > 0) {
			return `${action} ${entityType}: ${name.trim()}`;
		}
		return `${action} ${entityType}`;
	}

	private extractEntitiesFromPayload(
		payload: Record<string, any> | null | undefined
	): Array<{ id: string; kind: string; name?: string }> {
		if (!payload || typeof payload !== 'object') return [];

		const mapping: Record<string, string> = {
			document: 'document',
			documents: 'document',
			task: 'task',
			tasks: 'task',
			goal: 'goal',
			goals: 'goal',
			plan: 'plan',
			plans: 'plan',
			project: 'project',
			projects: 'project',
			milestone: 'milestone',
			milestones: 'milestone',
			risk: 'risk',
			risks: 'risk',
			requirement: 'requirement',
			requirements: 'requirement'
		};

		const extracted: Array<{ id: string; kind: string; name?: string }> = [];

		for (const [key, kind] of Object.entries(mapping)) {
			const value = (payload as Record<string, any>)[key];
			if (!value) continue;
			if (Array.isArray(value)) {
				for (const entry of value) {
					const record = entry as Record<string, any>;
					if (record?.id) {
						extracted.push({
							id: record.id,
							kind,
							name: record.title ?? record.name
						});
					}
				}
			} else if (typeof value === 'object' && (value as Record<string, any>).id) {
				const record = value as Record<string, any>;
				extracted.push({
					id: record.id,
					kind,
					name: record.title ?? record.name
				});
			}
		}

		return extracted;
	}

	private extractDependenciesFromPayload(
		payload: Record<string, any> | null | undefined
	): Array<{ from: string; to: string; rel?: string }> {
		if (!payload || typeof payload !== 'object') return [];

		const relationships =
			payload.relationships ??
			payload.edges ??
			payload.graph?.edges ??
			payload.graph_snapshot?.edges;
		if (!Array.isArray(relationships)) return [];

		const deps: Array<{ from: string; to: string; rel?: string }> = [];
		for (const rel of relationships) {
			if (!rel || typeof rel !== 'object') continue;
			const record = rel as Record<string, any>;
			const from = record.src_id ?? record.source_id ?? record.from_id ?? record.from;
			const to = record.dst_id ?? record.target_id ?? record.to_id ?? record.to;
			if (!from || !to) continue;
			deps.push({
				from: String(from),
				to: String(to),
				rel: record.rel ?? record.relation ?? record.type
			});
		}
		return deps;
	}

	private verifyExpectations(
		agentState: AgentState,
		payload: Record<string, any> | null | undefined
	): {
		expectations?: AgentState['expectations'];
		assumptions?: AgentState['assumptions'];
	} | null {
		if (
			!payload ||
			!Array.isArray(agentState.expectations) ||
			agentState.expectations.length === 0
		) {
			return null;
		}

		const summary = this.summarizeToolResult(payload);
		let updated = false;
		const newAssumptions: AgentState['assumptions'] = [];

		const expectations = agentState.expectations.map((expectation) => {
			if (expectation.status && expectation.status !== 'pending') {
				return expectation;
			}

			const hasStructuredMatch =
				(Array.isArray(expectation.expected_ids) && expectation.expected_ids.length > 0) ||
				typeof expectation.expected_type === 'string' ||
				typeof expectation.expected_count === 'number';

			if (!hasStructuredMatch) {
				return expectation;
			}

			if (summary.ids.length === 0 && summary.types.length === 0) {
				return expectation;
			}

			const matched = this.doesOutcomeMatch(expectation, summary);
			updated = true;

			if (matched) {
				return {
					...expectation,
					status: 'confirmed',
					last_checked_at: new Date().toISOString()
				};
			}

			newAssumptions.push({
				id: uuidv4(),
				hypothesis: `Expected "${expectation.expected_outcome}" but got "${summary.brief}"`,
				confidence: 0.7,
				evidence: summary.ids.slice(0, 6)
			});

			return {
				...expectation,
				status: 'failed',
				last_checked_at: new Date().toISOString()
			};
		});

		if (!updated) return null;

		return {
			expectations,
			assumptions: newAssumptions.length > 0 ? newAssumptions : undefined
		};
	}

	private summarizeToolResult(payload: Record<string, any>): {
		ids: string[];
		types: string[];
		counts: Record<string, number>;
		brief: string;
	} {
		const entities = this.extractEntitiesFromPayload(payload);
		const ids = entities.map((e) => e.id);
		const types = entities.map((e) => e.kind);
		const counts: Record<string, number> = {};
		for (const entry of entities) {
			counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
		}
		const brief =
			entities.length > 0
				? `${entities.length} entity update${entities.length === 1 ? '' : 's'}`
				: 'tool result';
		return { ids, types, counts, brief };
	}

	private doesOutcomeMatch(
		expectation: AgentState['expectations'][number],
		summary: { ids: string[]; types: string[]; counts: Record<string, number> }
	): boolean {
		if (Array.isArray(expectation.expected_ids) && expectation.expected_ids.length > 0) {
			const allIdsPresent = expectation.expected_ids.every((id) => summary.ids.includes(id));
			if (!allIdsPresent) return false;
		}
		if (typeof expectation.expected_type === 'string') {
			if (!summary.types.includes(expectation.expected_type)) return false;
		}
		if (typeof expectation.expected_count === 'number') {
			const count =
				typeof expectation.expected_type === 'string'
					? (summary.counts[expectation.expected_type] ?? 0)
					: summary.ids.length;
			if (count !== expectation.expected_count) return false;
		}
		return true;
	}

	private queueAgentStateReconciliation(params: {
		session: ChatSession;
		sessionMetadata: AgentSessionMetadata;
		state: StreamState;
		requestMessage: string;
		conversationHistory: ChatMessage[];
		contextType: ChatContextType;
		userId: string;
		httpReferer?: string;
	}): void {
		const {
			session,
			sessionMetadata,
			state,
			requestMessage,
			conversationHistory,
			contextType,
			userId,
			httpReferer
		} = params;

		if (!state.assistantResponse.trim() && state.toolResults.length === 0) {
			return;
		}

		const agentState = this.ensureAgentState(sessionMetadata, session.id);
		const messages = this.buildReconciliationMessages(
			conversationHistory,
			requestMessage,
			state.assistantResponse
		);
		const toolSummaries = this.buildToolResultSummaries(state.toolResults);

		void this.agentStateReconciler
			.reconcile({
				sessionId: session.id,
				userId,
				contextType,
				messages,
				toolResults: toolSummaries,
				agentState,
				httpReferer
			})
			.then((updated) => {
				if (!updated) return;
				sessionMetadata.agent_state = updated;
				state.pendingMetadataUpdates.agent_state = updated;
				state.hasPendingMetadataUpdate = true;
				return this.sessionManager.updateSessionAgentState(session.id, updated);
			})
			.catch((error) => {
				logger.warn('Agent state reconciliation failed', {
					error,
					sessionId: session.id
				});
			});
	}

	private buildReconciliationMessages(
		conversationHistory: ChatMessage[],
		userMessage: string,
		assistantResponse: string
	): AgentStateMessageSnapshot[] {
		const maxMessages = 12;
		const maxChars = 1600;
		const messages: AgentStateMessageSnapshot[] = [];

		for (const message of conversationHistory) {
			if (!message?.content || typeof message.content !== 'string') continue;
			messages.push({
				role: (message.role ?? 'user') as AgentStateMessageSnapshot['role'],
				content: this.truncateText(message.content, maxChars),
				createdAt: message.created_at ?? undefined
			});
		}

		if (userMessage && typeof userMessage === 'string') {
			messages.push({
				role: 'user',
				content: this.truncateText(userMessage, maxChars),
				createdAt: new Date().toISOString()
			});
		}

		if (assistantResponse && typeof assistantResponse === 'string') {
			messages.push({
				role: 'assistant',
				content: this.truncateText(assistantResponse, maxChars),
				createdAt: new Date().toISOString()
			});
		}

		return messages.slice(-maxMessages);
	}

	private buildToolResultSummaries(toolResults: ToolResultData[]): AgentStateToolSummary[] {
		return toolResults.map((result) => {
			const payload = result.result as Record<string, any> | null | undefined;
			const extractedEntities = this.extractEntitiesFromPayload(payload);
			const summary =
				payload && typeof payload === 'object' ? this.summarizeToolResult(payload) : null;
			return {
				tool_name: result.tool_name,
				success: result.success,
				error: result.error,
				entities_accessed: Array.isArray(result.entities_accessed)
					? result.entities_accessed.slice(0, 6)
					: undefined,
				entity_updates:
					extractedEntities.length > 0 ? extractedEntities.slice(0, 6) : undefined,
				entity_counts: summary?.counts,
				summary: summary?.brief
			};
		});
	}

	private truncateText(value: string, maxChars: number): string {
		if (value.length <= maxChars) return value;
		return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
	}

	/**
	 * Handle a context shift from a tool result.
	 */
	private async handleContextShift(
		contextShift: ContextShiftData,
		agentStream: ReturnType<typeof SSEResponse.createChatStream>,
		state: StreamState,
		session: ChatSession,
		defaultContextType: ChatContextType,
		userId: string
	): Promise<void> {
		logger.info('Context shift detected', { contextShift });

		const normalizedShiftContext = normalizeContextType(
			(contextShift.new_context as ChatContextType) ?? state.effectiveContextType
		);

		state.effectiveContextType = normalizedShiftContext;
		state.contextShiftOccurred = true;

		const shiftMessage =
			contextShift.message ??
			`✓ Context switched to ${contextShift.entity_name || normalizedShiftContext}.`;

		// Send context shift event
		await agentStream.sendMessage({
			type: 'context_shift',
			context_shift: {
				new_context: normalizedShiftContext,
				entity_id: contextShift.entity_id,
				entity_name: contextShift.entity_name,
				entity_type: contextShift.entity_type,
				message: shiftMessage
			}
		} as AgentSSEMessage);

		// Build and send last turn context
		const shiftTurnContext = buildContextShiftLastTurnContext(
			{
				...contextShift,
				new_context: normalizedShiftContext,
				message: shiftMessage
			},
			normalizedShiftContext
		);

		await agentStream.sendMessage({
			type: 'last_turn_context',
			context: shiftTurnContext
		});

		// Update session context in database
		await this.sessionManager.updateSessionContext(
			session.id,
			normalizedShiftContext,
			contextShift.entity_id
		);

		// Persist context shift message
		await this.messagePersister.persistContextShiftMessage({
			sessionId: session.id,
			userId,
			newContextType: normalizedShiftContext,
			entityId: contextShift.entity_id,
			entityName: contextShift.entity_name
		});
	}

	private async persistInterruptedState(params: {
		state: StreamState;
		session: ChatSession;
		userId: string;
		streamRunId?: number;
	}): Promise<void> {
		const { state, session, userId, streamRunId } = params;

		const baseMetadata = {
			interrupted: true,
			interrupted_reason: 'user_cancelled',
			stream_run_id: streamRunId ?? null,
			partial_tokens: Math.ceil(state.assistantResponse.length / 4)
		};

		if (state.assistantResponse.trim()) {
			await this.messagePersister.persistAssistantMessage({
				sessionId: session.id,
				userId,
				content: state.assistantResponse,
				messageType: 'assistant_interrupted',
				metadata: baseMetadata
			});
		}

		if (state.toolResults.length > 0) {
			await this.messagePersister.persistToolResults({
				sessionId: session.id,
				userId,
				toolCalls: state.toolCalls,
				toolResults: state.toolResults,
				messageType: 'tool_partial',
				metadata: { ...baseMetadata, partial: true }
			});
		}
	}

	/**
	 * Send enhanced usage snapshot in background.
	 */
	private async sendEnhancedUsageSnapshot(
		agentStream: ReturnType<typeof SSEResponse.createChatStream>,
		sessionId: string,
		historyForUsage: Array<{ content: string; created_at?: string | null }>
	): Promise<void> {
		try {
			const compressionService = new ChatCompressionService(this.supabase);
			const usageSnapshot = await compressionService.getUsageSnapshotWithCompressionBaseline(
				sessionId,
				historyForUsage,
				CONTEXT_USAGE_TOKEN_BUDGET
			);

			await agentStream.sendMessage({
				type: 'context_usage',
				usage: usageSnapshot
			});
		} catch (usageError) {
			logger.warn('Failed to send context usage snapshot', {
				error: usageError,
				sessionId
			});
		}
	}

	/**
	 * Safely load recent tool results to rebuild last-turn context when client history omits them.
	 */
	private async safeLoadRecentToolResults(sessionId: string): Promise<ToolResultData[]> {
		try {
			const rawResults = await this.sessionManager.loadRecentToolResults(sessionId, 20);
			return rawResults.map((result) => {
				const entities = this.extractEntitiesFromResult(result.result);
				// Include error info from persisted message if available
				const msg = result as any;
				return {
					tool_call_id: result.tool_call_id ?? '',
					tool_name: result.tool_name ?? undefined,
					result: result.result,
					success: msg.error_message ? false : true,
					error: msg.error_message ?? undefined,
					error_code: msg.error_code ?? undefined,
					entities_accessed: entities.length > 0 ? entities : undefined
				};
			});
		} catch (error) {
			logger.warn('Failed to load tool results for last turn context', {
				sessionId,
				error
			});
			return [];
		}
	}

	/**
	 * Lightweight entity extractor for persisted tool results.
	 */
	private extractEntitiesFromResult(result: any): string[] {
		const entities = new Set<string>();

		const findIds = (obj: any, depth = 0): void => {
			if (depth > 10 || obj == null) return;

			if (Array.isArray(obj)) {
				obj.forEach((item) => findIds(item, depth + 1));
				return;
			}

			if (typeof obj === 'object') {
				if (typeof obj.id === 'string') {
					entities.add(obj.id);
				}

				for (const [key, value] of Object.entries(obj)) {
					if (typeof value === 'string' && (key.endsWith('_id') || key.endsWith('Id'))) {
						entities.add(value);
					}
				}

				if (Array.isArray((obj as any)._entities_accessed)) {
					for (const id of (obj as any)._entities_accessed) {
						if (typeof id === 'string') {
							entities.add(id);
						}
					}
				}

				for (const value of Object.values(obj)) {
					if (value && typeof value === 'object') {
						findIds(value, depth + 1);
					}
				}
			}
		};

		findIds(result);
		return Array.from(entities);
	}

	/**
	 * Extract tool result payloads from conversation history (when tool role messages are present).
	 */
	private extractToolResultsFromHistory(history: ChatMessage[]): ToolResultData[] {
		const results: ToolResultData[] = [];

		for (const message of history) {
			if (message.role !== 'tool') continue;

			let parsedResult: unknown = (message as any).tool_result ?? null;
			if (!parsedResult && message.content) {
				try {
					parsedResult = JSON.parse(message.content);
				} catch {
					parsedResult = message.content;
				}
			}

			const entities = this.extractEntitiesFromResult(parsedResult);
			// Include error info from persisted message
			const msg = message as any;
			results.push({
				tool_call_id: msg.tool_call_id ?? '',
				tool_name: msg.tool_name ?? undefined,
				result: parsedResult,
				success: msg.error_message ? false : true,
				error: msg.error_message ?? undefined,
				error_code: msg.error_code ?? undefined,
				entities_accessed: entities.length > 0 ? entities : undefined
			});
		}

		return results;
	}
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create a StreamHandler instance.
 *
 * @param supabase - Supabase client
 * @returns StreamHandler instance
 */
export function createStreamHandler(supabase: SupabaseClient<Database>): StreamHandler {
	return new StreamHandler(supabase);
}
