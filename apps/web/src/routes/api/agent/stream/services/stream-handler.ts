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

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
		this.sessionManager = createSessionManager(supabase);
		this.messagePersister = createMessagePersister(supabase);
	}

	/**
	 * Create and manage the SSE stream for agent conversation.
	 *
	 * @param params - Stream handler parameters
	 * @returns SSE Response
	 */
	createAgentStream(params: StreamHandlerParams): Response {
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

		const normalizedContextType = normalizeContextType(request.context_type);
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
		let lastTurnContextForPlanner =
			generateLastTurnContext(conversationHistory, normalizedContextType) ??
			request.last_turn_context ??
			undefined;

		// Create SSE stream
		const agentStream = SSEResponse.createChatStream();

		// Send quick usage estimate immediately
		const historyForUsage = [...conversationHistory, { content: request.message }];
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

		return agentStream.response;
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
				entityId: request.entity_id,
				conversationHistory,
				chatSession: session,
				ontologyContext: ontologyContext || undefined,
				lastTurnContext: lastTurnContextForPlanner || undefined,
				projectFocus: resolvedFocus || undefined,
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

		// Build tool result data
		const toolResultData: ToolResultData = {
			tool_call_id: result.tool_call_id ?? result.toolCallId ?? '',
			tool_name: result.tool_name ?? result.toolName,
			result: result.tool_result ?? result.result ?? result.data ?? result,
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
			partial_tokens: state.assistantResponse.length
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
		historyForUsage: Array<{ content: string }>
	): Promise<void> {
		try {
			const compressionService = new ChatCompressionService(this.supabase);
			const usageSnapshot = await compressionService.getContextUsageSnapshot(
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
