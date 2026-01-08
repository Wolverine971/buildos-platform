// apps/web/src/routes/api/agent/stream/services/stream-handler.ts
/**
 * Stream Handler Service for /api/agent/stream endpoint.
 *
 * Manages SSE stream lifecycle with metadata consolidation semantics.
 *
 * CRITICAL STREAM GUARANTEES (from original implementation):
 * 1. `done` event is ALWAYS sent (on success AND error)
 * 2. `error` event ALWAYS precedes `done` (if error occurs)
 * 3. Metadata is persisted in a SINGLE write in the finally block
 * 4. Stream is ALWAYS closed in finally block
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Database,
	ChatSession,
	ChatContextType,
	ChatMessage,
	ChatToolCall,
	ProjectFocus,
	AgentSSEMessage
} from '@buildos/shared-types';
import type { OntologyContext, LastTurnContext } from '$lib/types/agent-chat-enhancement';
import type {
	StreamEvent,
	ProjectClarificationMetadata
} from '$lib/services/agentic-chat/shared/types';
import { SSEResponse } from '$lib/utils/sse-response';
import { createAgentChatOrchestrator } from '$lib/services/agentic-chat';
import { ChatCompressionService } from '$lib/services/chat-compression-service';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createLogger } from '$lib/utils/logger';
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
 * - metadata single-write in finally block
 * - stream always closed
 */
export class StreamHandler {
	private supabase: SupabaseClient<Database>;
	private sessionManager: ReturnType<typeof createSessionManager>;
	private messagePersister: ReturnType<typeof createMessagePersister>;
	private errorLogger: ErrorLoggerService;

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
		this.sessionManager = createSessionManager(supabase);
		this.messagePersister = createMessagePersister(supabase);
		this.errorLogger = ErrorLoggerService.getInstance(supabase);
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
			supabase,
			fetch: fetchFn,
			request,
			requestAbortSignal,
			session,
			ontologyContext,
			metadata,
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
		const state: StreamState = {
			assistantResponse: '',
			toolCalls: [],
			toolResults: [],
			totalTokens: 0,
			completionSent: false,
			contextShiftOccurred: false,
			effectiveContextType: normalizedContextType,
			pendingMetadataUpdates: {},
			hasPendingMetadataUpdate: false
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
		void agentStream.sendMessage({
			type: 'context_usage',
			usage: quickUsageSnapshot
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

		// If no lastTurnContext provided and history exists but no tool results found,
		// load them asynchronously from the database
		if (!lastTurnContextForPlanner && request.history && request.history.length > 0) {
			const toolResultsFromHistory = this.extractToolResultsFromHistory(conversationHistory);
			if (toolResultsFromHistory.length === 0) {
				const loadedToolResults = await this.safeLoadRecentToolResults(session.id);
				if (loadedToolResults.length > 0) {
					const generatedContext = generateLastTurnContext(
						conversationHistory,
						normalizedContextType,
						{ toolResults: loadedToolResults }
					);
					if (generatedContext) {
						lastTurnContextForPlanner = generatedContext;
					}
				}
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
					linkedEntities: sessionMetadata.linkedEntitiesCache
				},
				projectClarificationMetadata,
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
				abortSignal
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
	}): (event: StreamEvent | AgentSSEMessage | null | undefined) => Promise<void> {
		const {
			agentStream,
			state,
			sessionMetadata,
			session,
			normalizedContextType,
			userId,
			abortSignal
		} = params;

		return async (event: StreamEvent | AgentSSEMessage | null | undefined) => {
			if (!event) return;
			if (abortSignal?.aborted) return;

			// Track text content
			if ((event as StreamEvent).type === 'text' && (event as any).content) {
				state.assistantResponse += (event as any).content;
			}

			// Track tool calls
			if ((event as StreamEvent).type === 'tool_call' && (event as any).toolCall) {
				state.toolCalls.push((event as any).toolCall);
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
					userId
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
			if (sseMessage) {
				await agentStream.sendMessage(sseMessage);
			}
		};
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
		userId: string
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
