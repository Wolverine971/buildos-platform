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

import type { RequestHandler } from './$types';
import { SSEResponse } from '$lib/utils/sse-response';
import { ApiResponse } from '$lib/utils/api-response';
import type {
	ChatStreamRequest,
	ChatSession,
	ChatSessionInsert,
	ChatContextType,
	ChatMessage,
	Database,
	AgentSSEMessage
} from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OntologyContextLoader } from '$lib/services/ontology-context-loader';
import type {
	LastTurnContext,
	OntologyContext,
	EnhancedAgentStreamRequest
} from '$lib/types/agent-chat-enhancement';
import { createAgentChatOrchestrator } from '$lib/services/agentic-chat';
import type { StreamEvent } from '$lib/services/agentic-chat/shared/types';

type SupabaseClientWithDb = SupabaseClient<Database>;

// ============================================
// RATE LIMITING
// ============================================

const RATE_LIMIT = {
	MAX_REQUESTS_PER_MINUTE: 20, // Lower for agent system (more expensive)
	MAX_TOKENS_PER_MINUTE: 30000
};

const RECENT_MESSAGE_LIMIT = 50;

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

interface ChatMessageInsertPayload {
	session_id: string;
	user_id: string;
	role: ChatMessage['role'];
	content: string;
	tool_calls?: any;
	tool_call_id?: string;
	tool_name?: string;
	tool_result?: any;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function normalizeContextType(contextType?: ChatContextType | string): ChatContextType {
	const normalized = (contextType ?? 'global') as ChatContextType;
	return normalized === 'general' ? 'global' : normalized;
}

async function fetchChatSession(
	supabase: SupabaseClientWithDb,
	sessionId: string,
	userId: string
): Promise<ChatSession | null> {
	const { data, error } = await supabase
		.from('chat_sessions')
		.select('*')
		.eq('id', sessionId)
		.eq('user_id', userId)
		.single();

	if (error) {
		if (error.code === 'PGRST116') {
			return null;
		}
		console.error('[API] Failed to load chat session:', error);
		throw error;
	}

	return data ?? null;
}

async function createChatSession(
	supabase: SupabaseClientWithDb,
	params: { userId: string; contextType: ChatContextType; entityId?: string }
): Promise<ChatSession> {
	const sessionData: ChatSessionInsert = {
		user_id: params.userId,
		context_type: params.contextType,
		entity_id: params.entityId,
		status: 'active',
		message_count: 0,
		total_tokens_used: 0,
		tool_call_count: 0,
		title: 'Agent Session'
	};

	const { data, error } = await supabase
		.from('chat_sessions')
		.insert(sessionData)
		.select()
		.single();

	if (error || !data) {
		throw error ?? new Error('Failed to create agent chat session');
	}

	return data;
}

async function loadRecentMessages(
	supabase: SupabaseClientWithDb,
	sessionId: string,
	limit: number = RECENT_MESSAGE_LIMIT
): Promise<ChatMessage[]> {
	const { data, error } = await supabase
		.from('chat_messages')
		.select('*')
		.eq('session_id', sessionId)
		.order('created_at', { ascending: false })
		.limit(limit);

	if (error) {
		console.error('[API] Failed to load chat history:', error);
		return [];
	}

	return (data ?? []).reverse();
}

async function persistChatMessage(
	supabase: SupabaseClientWithDb,
	message: ChatMessageInsertPayload
): Promise<void> {
	const { error } = await supabase.from('chat_messages').insert(message);
	if (error) {
		console.error('[API] Failed to save chat message:', error);
	}
}

/**
 * Load ontology context based on context type and optional entity type
 */
async function loadOntologyContext(
	supabase: SupabaseClientWithDb,
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
		if ((contextType === 'project' || contextType === 'project_audit') && entityId) {
			console.log('[API] Loading project-level ontology context');
			return await loader.loadProjectContext(entityId);
		}

		// Otherwise, load global context
		if (contextType === 'global') {
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

		const normalizedContextType = normalizeContextType(context_type);

		if (!message?.trim()) {
			return ApiResponse.badRequest('Message is required');
		}

		// const supabaseClient = supabase as SupabaseClientWithDb;

		// Get or create session + conversation history
		let chatSession: ChatSession | null = null;
		let storedConversationHistory: ChatMessage[] = [];
		const providedHistory = Array.isArray(conversationHistory) ? conversationHistory : [];

		if (session_id) {
			chatSession = await fetchChatSession(supabase, session_id, userId);

			if (!chatSession) {
				return ApiResponse.notFound('Session');
			}

			if (providedHistory.length === 0) {
				storedConversationHistory = await loadRecentMessages(
					supabase,
					session_id,
					RECENT_MESSAGE_LIMIT
				);
			}
		} else {
			chatSession = await createChatSession(supabase, {
				userId,
				contextType: normalizedContextType,
				entityId: entity_id
			});
		}

		if (!chatSession) {
			return ApiResponse.internalError(
				new Error('Failed to resolve chat session'),
				'Failed to resolve chat session'
			);
		}

		// Save user message to chat_messages
		await persistChatMessage(supabase, {
			session_id: chatSession.id,
			user_id: userId,
			role: 'user',
			content: message
		});

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
		const resolvedHistory =
			storedConversationHistory.length > 0 ? storedConversationHistory : providedHistory;

		if (!lastTurnContext && resolvedHistory.length > 0) {
			lastTurnContext =
				generateLastTurnContext(resolvedHistory, normalizedContextType) ?? undefined;
			console.log('[API] Generated last turn context:', {
				hasContext: !!lastTurnContext,
				summary: lastTurnContext?.summary,
				entitiesCount: Object.keys(lastTurnContext?.entities || {}).length
			});
		}
		const historyToUse = resolvedHistory;

		const agentStream = SSEResponse.createChatStream();

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

				const contextShift =
					result?.context_shift ??
					result?.data?.context_shift ??
					result?.result?.context_shift;

				if (contextShift) {
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

					await persistChatMessage(supabase, {
						session_id: chatSession.id,
						user_id: userId,
						role: 'system',
						content: `Context shifted to ${contextShift.new_context} for "${contextShift.entity_name}" (ID: ${contextShift.entity_id})`
					});
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

				// Save assistant response to database (with tool calls if any)
				// Important: Save even if no text content, as long as there are tool calls
				if (assistantResponse.trim() || toolCalls.length > 0) {
					const assistantMessageData: ChatMessageInsertPayload = {
						session_id: chatSession.id,
						user_id: userId,
						role: 'assistant',
						content: assistantResponse || '' // Can be empty if only tool calls
					};

					// Include tool calls if any (OpenAI format)
					if (toolCalls.length > 0) {
						assistantMessageData.tool_calls = toolCalls;
					}

					await persistChatMessage(supabase, assistantMessageData);

					// Save tool result messages (one per tool call)
					// These are separate messages with role='tool' linked to their tool_call_id
					for (const toolCall of toolCalls) {
						// Match result by tool_call_id instead of array index for safety
						const result = toolResults.find(
							(r) => r.tool_call_id === toolCall.id || r.toolCallId === toolCall.id
						);

						if (result) {
							const normalizedResult =
								result.tool_result ?? result.result ?? result.data ?? result;

							await persistChatMessage(supabase, {
								session_id: chatSession.id,
								user_id: userId,
								role: 'tool',
								content: JSON.stringify(normalizedResult),
								tool_call_id: toolCall.id,
								tool_name: toolCall.function?.name || 'unknown',
								tool_result: normalizedResult
							});
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
	// const supabaseClient = supabase as SupabaseClientWithDb;

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
				result: (event as any).result ?? (event as any).tool_result
			};
		case 'template_creation_request':
			return {
				type: 'template_creation_request',
				request: (event as any).request
			};
		case 'template_creation_status':
			return {
				type: 'template_creation_status',
				request_id: (event as any).request_id,
				status: (event as any).status,
				message: (event as any).message
			};
		case 'template_created':
			return {
				type: 'template_created',
				request_id: (event as any).request_id,
				template: (event as any).template
			};
		case 'template_creation_failed':
			return {
				type: 'template_creation_failed',
				request_id: (event as any).request_id,
				error: (event as any).error,
				actionable: (event as any).actionable
			};
		case 'done':
			return { type: 'done', usage: (event as any).usage };
		case 'error':
			return { type: 'error', error: (event as any).error ?? 'Unknown error' };
		default:
			return null;
	}
}
