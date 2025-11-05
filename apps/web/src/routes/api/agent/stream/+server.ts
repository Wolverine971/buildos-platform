// apps/web/src/routes/api/agent/stream/+server.ts
/**
 * Multi-Agent System Streaming API Endpoint
 *
 * This endpoint provides Server-Sent Events (SSE) streaming for the multi-agent system
 * with planner-executor coordination, database persistence, and tool execution.
 *
 * Architecture:
 * - Planner Agent (deepseek-chat, read-write) orchestrates complex queries
 * - Executor Agents (deepseek-coder, read-only) perform specific tasks
 * - Full database persistence for agents, plans, sessions, messages, executions
 *
 * Phase: Phase 3 - API Integration
 */

import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { AgentPlannerService } from '$lib/services/agent-planner-service';
import { AgentExecutorService } from '$lib/services/agent-executor-service';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { ChatCompressionService } from '$lib/services/chat-compression-service';
import { SSEResponse } from '$lib/utils/sse-response';
import { ApiResponse } from '$lib/utils/api-response';
import type {
	ChatStreamRequest,
	ChatSession,
	ChatSessionInsert,
	ChatContextType,
	ChatMessage
} from '@buildos/shared-types';
import { OntologyContextLoader } from '$lib/services/ontology-context-loader';
import type {
	LastTurnContext,
	OntologyContext,
	EnhancedAgentStreamRequest
} from '$lib/types/agent-chat-enhancement';
import { createAgentChatOrchestrator } from '$lib/services/agentic-chat';
import type { StreamEvent } from '$lib/services/agentic-chat/shared/types';

// ============================================
// RATE LIMITING
// ============================================

const RATE_LIMIT = {
	MAX_REQUESTS_PER_MINUTE: 20, // Lower for agent system (more expensive)
	MAX_TOKENS_PER_MINUTE: 30000
};

// Track user request rates
const rateLimiter = new Map<
	string,
	{
		requests: number;
		tokens: number;
		resetAt: number;
	}
>();

// ============================================
// TYPES
// ============================================

interface AgentStreamRequest extends ChatStreamRequest {
	// Inherits: message, session_id, context_type, entity_id
	conversationHistory?: ChatMessage[]; // Previous messages for context (properly typed)
}

interface AgentSSEMessage {
	type:
		| 'session'
		| 'ontology_loaded'
		| 'last_turn_context'
		| 'strategy_selected'
		| 'clarifying_questions'
		| 'analysis'
		| 'plan_created'
		| 'step_start'
		| 'step_complete'
		| 'executor_spawned'
		| 'executor_result'
		| 'text'
		| 'tool_call'
		| 'tool_result'
		| 'context_shift'
		| 'done'
		| 'error';
	[key: string]: any;
	context_shift?: {
		new_context: ChatContextType;
		entity_id: string;
		entity_name: string;
		entity_type: 'project' | 'task' | 'plan' | 'goal';
		message: string;
	};
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Load ontology context based on context type and optional entity type
 */
async function loadOntologyContext(
	supabase: any,
	contextType: ChatContextType,
	entityId?: string,
	ontologyEntityType?: 'task' | 'plan' | 'goal' | 'document' | 'output'
): Promise<OntologyContext | null> {
	console.log('[API] Loading ontology context', {
		contextType,
		entityId,
		ontologyEntityType
	});

	const loader = new OntologyContextLoader(supabase);

	try {
		// If entity type is specified, load element context
		if (ontologyEntityType && entityId) {
			console.log('[API] Loading element-level ontology context');
			return await loader.loadElementContext(ontologyEntityType, entityId);
		}

		// If project context, load project-level ontology
		if (
			(contextType === 'project' ||
				contextType === 'project_update' ||
				contextType === 'project_audit') &&
			entityId
		) {
			console.log('[API] Loading project-level ontology context');
			return await loader.loadProjectContext(entityId);
		}

		// Otherwise, load global context
		if (contextType === 'global' || contextType === 'general') {
			console.log('[API] Loading global ontology context');
			return await loader.loadGlobalContext();
		}

		// No ontology context applicable
		console.log('[API] No ontology context applicable for context type:', contextType);
		return null;
	} catch (error) {
		console.error('[API] Failed to load ontology context:', error);
		return null; // Don't fail the request, just proceed without ontology
	}
}

/**
 * Generate last turn context from recent messages
 * Provides conversation continuity between turns
 */
function generateLastTurnContext(
	recentMessages: ChatMessage[],
	contextType: ChatContextType
): LastTurnContext | null {
	if (!recentMessages || recentMessages.length < 2) {
		// Need at least user + assistant message pair
		return null;
	}

	// Get the last assistant message (most recent response)
	const lastAssistantMsg = recentMessages.filter((m) => m.role === 'assistant').pop();

	// Get the last user message
	const lastUserMsg = recentMessages.filter((m) => m.role === 'user').pop();

	if (!lastAssistantMsg || !lastUserMsg) {
		return null;
	}

	console.log('[API] Generating last turn context from messages', {
		lastUserContent: lastUserMsg.content.substring(0, 50),
		lastAssistantContent: lastAssistantMsg.content.substring(0, 50)
	});

	// Extract entity IDs from tool calls
	const entities: LastTurnContext['entities'] = {};
	const toolsUsed: string[] = [];

	// Check if last assistant message had tool calls
	if (lastAssistantMsg.tool_calls) {
		try {
			const toolCalls = Array.isArray(lastAssistantMsg.tool_calls)
				? lastAssistantMsg.tool_calls
				: JSON.parse(lastAssistantMsg.tool_calls as any);

			toolCalls.forEach((tc: any) => {
				const toolName = tc.function?.name || tc.name;
				if (toolName) {
					toolsUsed.push(toolName);

					// Extract entity IDs from tool arguments
					const argsStr = tc.function?.arguments || tc.arguments;
					if (argsStr) {
						try {
							const args =
								typeof argsStr === 'string' ? JSON.parse(argsStr) : argsStr;

							if (args.project_id) entities.project_id = args.project_id;
							if (args.task_id) {
								entities.task_ids = entities.task_ids || [];
								entities.task_ids.push(args.task_id);
							}
							if (args.goal_id) {
								entities.goal_ids = entities.goal_ids || [];
								entities.goal_ids.push(args.goal_id);
							}
							if (args.plan_id) entities.plan_id = args.plan_id;
							if (args.document_id) entities.document_id = args.document_id;
							if (args.output_id) entities.output_id = args.output_id;
						} catch (e) {
							console.warn('[API] Failed to parse tool arguments:', e);
						}
					}
				}
			});
		} catch (e) {
			console.warn('[API] Failed to extract tool calls:', e);
		}
	}

	// Generate a brief summary (10-20 words) of the interaction
	const userMessagePreview = lastUserMsg.content.substring(0, 100).trim();
	const summary = `${userMessagePreview.substring(0, 60)}...`;

	return {
		summary,
		entities,
		context_type: contextType,
		data_accessed: toolsUsed,
		strategy_used: undefined, // Will be filled by planner if available
		timestamp: lastAssistantMsg.created_at || new Date().toISOString()
	};
}

// ============================================
// POST HANDLER
// ============================================

/**
 * POST /api/agent/stream
 * Stream a multi-agent system response with planner-executor coordination
 */
export const POST: RequestHandler = async ({
	request,
	fetch,
	locals: { supabase, safeGetSession }
}) => {
	// Check authentication
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const userId = user.id;

	// Check rate limiting
	const now = Date.now();
	let userRateLimit = rateLimiter.get(userId);

	if (userRateLimit) {
		if (userRateLimit.resetAt > now) {
			if (userRateLimit.requests >= RATE_LIMIT.MAX_REQUESTS_PER_MINUTE) {
				return ApiResponse.error(
					'Too many requests. Agent system is more resource-intensive. Please wait before sending another message.',
					429,
					'RATE_LIMITED'
				);
			}
			if (userRateLimit.tokens >= RATE_LIMIT.MAX_TOKENS_PER_MINUTE) {
				return ApiResponse.error(
					'Token limit reached. Please wait a moment before continuing.',
					429,
					'RATE_LIMITED'
				);
			}
			userRateLimit.requests++;
		} else {
			// Reset rate limit window
			userRateLimit = {
				requests: 1,
				tokens: 0,
				resetAt: now + 60000 // 1 minute
			};
			rateLimiter.set(userId, userRateLimit);
		}
	} else {
		// Initialize rate limit window
		userRateLimit = {
			requests: 1,
			tokens: 0,
			resetAt: now + 60000
		};
		rateLimiter.set(userId, userRateLimit);
	}

	try {
		const body = (await request.json()) as AgentStreamRequest;
		const {
			message,
			session_id,
			context_type = 'global',
			entity_id,
			conversationHistory = []
		} = body;

		const rawContextType = context_type as ChatContextType;
		const normalizedContextType = (
			rawContextType === 'general' ? 'global' : rawContextType
		) as ChatContextType;

		if (!message?.trim()) {
			return ApiResponse.badRequest('Message is required');
		}

		// Get or create session
		let chatSession: ChatSession;
		let loadedConversationHistory: ChatMessage[] = [];

		if (session_id) {
			// Get existing session
			const { data: existingSession } = await supabase
				.from('chat_sessions')
				.select('*')
				.eq('id', session_id)
				.eq('user_id', userId)
				.single();

			if (!existingSession) {
				return ApiResponse.notFound('Session');
			}

			chatSession = existingSession;

			// Load conversation history from database for existing session
			const { data: messages, error: messagesError } = await supabase
				.from('chat_messages')
				.select('*')
				.eq('session_id', session_id)
				.order('created_at', { ascending: false })
				.limit(50); // Limit to recent 50 messages to prevent memory bloat

			if (!messagesError && messages) {
				// Reverse to get chronological order (oldest first)
				loadedConversationHistory = messages.reverse();
			}
		} else {
			// Create new agent chat session
			const sessionData: ChatSessionInsert = {
				user_id: userId,
				context_type: normalizedContextType,
				entity_id,
				status: 'active',
				message_count: 0,
				total_tokens_used: 0,
				tool_call_count: 0,
				title: 'Agent Session'
			};

			const { data: newSession, error: sessionError } = await supabase
				.from('chat_sessions')
				.insert(sessionData)
				.select()
				.single();

			if (sessionError) {
				console.error('Failed to create session:', sessionError);
				return ApiResponse.internalError(sessionError, 'Failed to create chat session');
			}

			chatSession = newSession;
		}

		// Save user message to chat_messages
		const { error: userMessageError } = await supabase.from('chat_messages').insert({
			session_id: chatSession.id,
			user_id: userId,
			role: 'user',
			content: message
		});

		if (userMessageError) {
			console.error('Failed to save user message:', userMessageError);
			// Don't fail the request, just log
		}

		// === ONTOLOGY INTEGRATION ===

		// Parse enhanced request fields
		const enhancedBody = body as EnhancedAgentStreamRequest;
		const ontologyEntityType = enhancedBody.ontologyEntityType;
		let lastTurnContext = enhancedBody.lastTurnContext ?? undefined;

		// Load ontology context if applicable
		// Skip for project_create as it uses template overview instead
		const ontologyContext =
			normalizedContextType === 'project_create'
				? null
				: await loadOntologyContext(
						supabase,
						normalizedContextType,
						entity_id,
						ontologyEntityType
					);

		console.log('[API] Ontology context loaded:', {
			hasOntology: !!ontologyContext,
			type: ontologyContext?.type,
			entityCount: ontologyContext?.metadata?.entity_count
		});

		// Generate last turn context if not provided
		if (!lastTurnContext && loadedConversationHistory.length > 0) {
			lastTurnContext =
				generateLastTurnContext(loadedConversationHistory, normalizedContextType) ??
				undefined;
			console.log('[API] Generated last turn context:', {
				hasContext: !!lastTurnContext,
				summary: lastTurnContext?.summary,
				entitiesCount: Object.keys(lastTurnContext?.entities || {}).length
			});
		}

		const historyToUse =
			loadedConversationHistory.length > 0 ? loadedConversationHistory : conversationHistory;

		const agentStream = SSEResponse.createChatStream();

		const useNewArchitecture = env.ENABLE_NEW_AGENTIC_CHAT === 'true';

		let totalTokens = 0;
		let assistantResponse = '';
		const toolCalls: any[] = [];
		const toolResults: any[] = [];
		let completionSent = false;

		const sendEvent = async (event: StreamEvent | AgentSSEMessage | null | undefined) => {
			if (!event) return;

			if ((event as StreamEvent).type === 'text' && (event as any).content) {
				assistantResponse += (event as any).content;
			}

			if ((event as StreamEvent).type === 'tool_call' && (event as any).toolCall) {
				toolCalls.push((event as any).toolCall);
			}

			if ((event as StreamEvent).type === 'tool_result' && (event as any).result) {
				const result = (event as any).result;
				toolResults.push(result);

				if (result?.context_shift) {
					const contextShift = result.context_shift;
					console.log('[API] Context shift detected:', contextShift);

					await agentStream.sendMessage({
						type: 'context_shift',
						context_shift: {
							new_context: contextShift.new_context,
							entity_id: contextShift.entity_id,
							entity_name: contextShift.entity_name,
							entity_type: contextShift.entity_type,
							message: `✓ Project created successfully. I'm now helping you manage "${contextShift.entity_name}". What would you like to add?`
						}
					});

					const { error: updateError } = await supabase
						.from('chat_sessions')
						.update({
							context_type: contextShift.new_context,
							entity_id: contextShift.entity_id,
							updated_at: new Date().toISOString()
						})
						.eq('id', chatSession.id);

					if (updateError) {
						console.error('[API] Failed to update chat session context:', updateError);
					} else {
						console.log('[API] Chat session context updated:', {
							session_id: chatSession.id,
							new_context: contextShift.new_context,
							entity_id: contextShift.entity_id
						});
					}

					const { error: sysMessageError } = await supabase.from('chat_messages').insert({
						session_id: chatSession.id,
						user_id: userId,
						role: 'system',
						content: `Context shifted to ${contextShift.new_context} for "${contextShift.entity_name}" (ID: ${contextShift.entity_id})`
					});

					if (sysMessageError) {
						console.error('[API] Failed to insert system message:', sysMessageError);
					}
				}
			}

			if ((event as StreamEvent).type === 'done') {
				completionSent = true;
				if ((event as any).usage?.total_tokens) {
					totalTokens += (event as any).usage.total_tokens;
				}
			}

			const message = mapPlannerEventToSSE(event);
			if (message) {
				await agentStream.sendMessage(message);
			}
		};

		(async () => {
			try {
				if (useNewArchitecture) {
					const orchestrator = createAgentChatOrchestrator(supabase, {
						fetchFn: fetch,
						httpReferer: request.headers.get('referer') ?? undefined,
						appName: 'BuildOS Agentic Chat'
					});

					const orchestratorRequest = {
						userId,
						sessionId: chatSession.id,
						userMessage: message,
						contextType: normalizedContextType,
						entityId: entity_id,
						conversationHistory: historyToUse,
						chatSession,
						ontologyContext: ontologyContext || undefined,
						lastTurnContext: lastTurnContext || undefined
					};

					for await (const _ of orchestrator.streamConversation(
						orchestratorRequest,
						sendEvent
					)) {
						// Events are handled via the provided callback
					}
				} else {
					const smartLLM = new SmartLLMService({ supabase });
					const executorService = new AgentExecutorService(supabase, smartLLM, fetch);
					const compressionService = new ChatCompressionService(supabase);
					const plannerService = new AgentPlannerService(
						supabase,
						executorService,
						smartLLM,
						compressionService,
						fetch
					);

					await sendEvent({
						type: 'session',
						session: chatSession
					} as StreamEvent);

					if (ontologyContext) {
						await sendEvent({
							type: 'ontology_loaded',
							summary: `Loaded ${ontologyContext.type} ontology context with ${
								Object.keys(ontologyContext.metadata?.entity_count || {}).length
							} entity types`
						} as StreamEvent);
					}

					if (lastTurnContext) {
						await sendEvent({
							type: 'last_turn_context',
							context: lastTurnContext
						} as StreamEvent);
					}

					for await (const event of plannerService.processUserMessage({
						sessionId: chatSession.id,
						userId,
						message,
						contextType: normalizedContextType,
						entityId: entity_id,
						conversationHistory: historyToUse,
						ontologyContext: ontologyContext || undefined,
						lastTurnContext: lastTurnContext || undefined
					})) {
						await sendEvent(event);
					}
				}

				// Save assistant response to database (with tool calls if any)
				// Important: Save even if no text content, as long as there are tool calls
				if (assistantResponse.trim() || toolCalls.length > 0) {
					const assistantMessageData: any = {
						session_id: chatSession.id,
						user_id: userId,
						role: 'assistant',
						content: assistantResponse || '' // Can be empty if only tool calls
					};

					// Include tool calls if any (OpenAI format)
					if (toolCalls.length > 0) {
						assistantMessageData.tool_calls = toolCalls;
					}

					const { error: assistantError } = await supabase
						.from('chat_messages')
						.insert(assistantMessageData);

					if (assistantError) {
						console.error('Failed to save assistant message:', assistantError);
					}

					// Save tool result messages (one per tool call)
					// These are separate messages with role='tool' linked to their tool_call_id
					for (const toolCall of toolCalls) {
						// Match result by tool_call_id instead of array index for safety
						const result = toolResults.find(
							(r) => r.tool_call_id === toolCall.id || r.toolCallId === toolCall.id
						);

						if (result) {
							const normalizedResult = result.tool_result ?? result.result ?? result;

							const { error: toolError } = await supabase
								.from('chat_messages')
								.insert({
									session_id: chatSession.id,
									user_id: userId,
									role: 'tool',
									content: JSON.stringify(normalizedResult),
									tool_call_id: toolCall.id,
									tool_name: toolCall.function?.name || 'unknown',
									tool_result: normalizedResult
								});

							if (toolError) {
								console.error('Failed to save tool result message:', toolError);
							}
						} else {
							console.warn(
								`No result found for tool call ${toolCall.id} (${toolCall.function?.name})`
							);
						}
					}
				}

				// Update rate limiter with token usage
				const currentRate = rateLimiter.get(userId);
				if (currentRate) {
					currentRate.tokens = Math.min(
						currentRate.tokens + totalTokens,
						RATE_LIMIT.MAX_TOKENS_PER_MINUTE
					);
				}

				// Send completion message
				if (!completionSent) {
					await agentStream.sendMessage({
						type: 'done',
						usage: {
							prompt_tokens: 0,
							completion_tokens: 0,
							total_tokens: totalTokens
						},
						finished_reason: 'stop'
					});
				}
			} catch (streamError) {
				console.error('Agent streaming error:', streamError);

				await agentStream.sendMessage({
					type: 'error',
					error:
						streamError instanceof Error
							? streamError.message
							: 'Failed to generate response'
				});
			} finally {
				await agentStream.close();
			}
		})().catch((uncaughtError) => {
			// Safety net for errors in error handling or finally block
			console.error('Uncaught error in agent stream:', uncaughtError);
			// Attempt to close stream if possible
			try {
				agentStream.close();
			} catch {
				// Ignore - stream may already be closed
			}
		});

		// Return SSE response
		return agentStream.response;
	} catch (err) {
		console.error('Agent API error:', err);
		return ApiResponse.internalError(err, 'Internal server error');
	}
};

// ============================================
// GET HANDLER
// ============================================

/**
 * GET /api/agent/stream
 * Get agent chat sessions
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	// Check authentication
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const userId = user.id;
	const sessionId = url.searchParams.get('session_id');

	if (!sessionId) {
		// Get user's active agent sessions
		const { data: sessions, error: sessionsError } = await supabase
			.from('chat_sessions')
			.select('*')
			.eq('user_id', userId)
			.eq('status', 'active')
			.order('updated_at', { ascending: false })
			.limit(10);

		if (sessionsError) {
			console.error('Failed to get sessions:', sessionsError);
			return ApiResponse.internalError(sessionsError, 'Failed to get agent sessions');
		}

		return ApiResponse.success({ sessions });
	}

	// Get specific session with messages
	const { data: chatSession, error: sessionError } = await supabase
		.from('chat_sessions')
		.select(
			`
      *,
      messages:chat_messages(*)
    `
		)
		.eq('id', sessionId)
		.eq('user_id', userId)
		.single();

	if (sessionError || !chatSession) {
		return ApiResponse.notFound('Session');
	}

	return ApiResponse.success({ session: chatSession });
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Map planner event types to SSE message format
 */
function mapPlannerEventToSSE(
	event: StreamEvent | AgentSSEMessage | null | undefined
): AgentSSEMessage | null {
	if (!event) {
		return null;
	}

	switch (event.type) {
		case 'session':
			return { type: 'session', session: (event as any).session };
		case 'ontology_loaded':
			return { type: 'ontology_loaded', summary: (event as any).summary };
		case 'last_turn_context':
			return { type: 'last_turn_context', context: (event as any).context };
		case 'strategy_selected':
			return {
				type: 'strategy_selected',
				strategy: (event as any).strategy,
				confidence: (event as any).confidence ?? 0
			};
		case 'clarifying_questions':
			return {
				type: 'clarifying_questions',
				questions: (event as any).questions ?? []
			};
		case 'analysis':
			return { type: 'analysis', analysis: (event as any).analysis };
		case 'plan_created':
			return { type: 'plan_created', plan: (event as any).plan };
		case 'step_start':
			return { type: 'step_start', step: (event as any).step };
		case 'step_complete':
			return { type: 'step_complete', step: (event as any).step };
		case 'executor_spawned':
			return {
				type: 'executor_spawned',
				executorId: (event as any).executorId,
				task: (event as any).task
			};
		case 'executor_result':
			return {
				type: 'executor_result',
				executorId: (event as any).executorId,
				result: (event as any).result
			};
		case 'text':
			return { type: 'text', content: (event as any).content };
		case 'tool_call':
			return {
				type: 'tool_call',
				tool_call: (event as any).toolCall ?? (event as any).tool_call
			};
		case 'tool_result':
			return {
				type: 'tool_result',
				tool_result: (event as any).result ?? (event as any).tool_result
			};
		case 'done':
			return { type: 'done', plan: (event as any).plan, usage: (event as any).usage };
		case 'error':
			return { type: 'error', error: (event as any).error ?? 'Unknown error' };
		default:
			return null;
	}
}
