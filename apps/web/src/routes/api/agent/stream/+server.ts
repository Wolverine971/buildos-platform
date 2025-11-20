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
	ChatMessageInsert,
	Database,
	AgentSSEMessage,
	ChatRole,
	ProjectFocus,
	ContextUsageSnapshot
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
import { createLogger } from '$lib/utils/logger';
import { ChatCompressionService } from '$lib/services/chat-compression-service';

// ============================================
// LOGGING
// ============================================

const logger = createLogger('API:AgentStream');

// ============================================
// RATE LIMITING
// ============================================

const RATE_LIMIT = {
	MAX_REQUESTS_PER_MINUTE: 20, // Lower for agent system (more expensive)
	MAX_TOKENS_PER_MINUTE: 30000
};

const RECENT_MESSAGE_LIMIT = 50;
const CONTEXT_USAGE_TOKEN_BUDGET = 2500; // Roughly matches planner conversation budget

// Track user request rates
const rateLimiter = new Map<
	string,
	{
		requests: number;
		tokens: number;
		resetAt: number;
	}
>();

type OntologyCache = {
	context: OntologyContext;
	loadedAt: number; // timestamp
	cacheKey: string; // projectId-focusType-entityId or contextType
};

type AgentSessionMetadata = {
	focus?: ProjectFocus | null;
	ontologyCache?: OntologyCache;
	[key: string]: any;
};

function normalizeProjectFocus(focus?: ProjectFocus | null): ProjectFocus | null {
	if (!focus) return null;
	if (!focus.projectId) return null;
	return {
		focusType: focus.focusType ?? 'project-wide',
		focusEntityId: focus.focusEntityId ?? null,
		focusEntityName: focus.focusEntityName ?? null,
		projectId: focus.projectId,
		projectName: focus.projectName ?? 'Project'
	};
}

/**
 * Generate cache key for ontology context
 */
function generateOntologyCacheKey(
	projectFocus: ProjectFocus | null,
	contextType: ChatContextType,
	entityId?: string
): string {
	if (projectFocus?.projectId) {
		const parts = [projectFocus.projectId, projectFocus.focusType];
		if (projectFocus.focusEntityId) {
			parts.push(projectFocus.focusEntityId);
		}
		return parts.join(':');
	}
	return entityId ? `${contextType}:${entityId}` : contextType;
}

// ============================================
// TYPES
// ============================================

// Use EnhancedAgentStreamRequest from agent-chat-enhancement types
// which properly extends ChatStreamRequest with additional fields

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Normalizes context type to ensure consistency
 * Maps legacy 'general' to 'global'
 */
function normalizeContextType(contextType?: ChatContextType | string): ChatContextType {
	// Default to 'global' if not provided
	if (!contextType) {
		return 'global';
	}

	// Map 'general' to 'global' for backwards compatibility
	if (contextType === 'general') {
		return 'global';
	}

	// Validate it's a valid ChatContextType
	const validTypes: ChatContextType[] = [
		'global',
		'project',
		'task',
		'calendar',
		'project_create',
		'project_audit',
		'project_forecast',
		'task_update',
		'daily_brief_update'
	];

	if (validTypes.includes(contextType as ChatContextType)) {
		return contextType as ChatContextType;
	}

	logger.warn(`Invalid context type '${contextType}', defaulting to 'global'`, { contextType });
	return 'global';
}

/**
 * Lightweight usage snapshot calculation that does not hit the database.
 * Used to avoid blocking the stream if compression metadata lookups stall.
 */
function buildQuickUsageSnapshot(
	messages: { content: string }[],
	tokenBudget: number
): ContextUsageSnapshot {
	const estimatedTokens = messages.reduce(
		(sum, msg) => sum + Math.ceil((msg?.content ?? '').length / 4),
		0
	);
	const usagePercent = Math.min(Math.round((estimatedTokens / tokenBudget) * 100), 999);
	const tokensRemaining = Math.max(tokenBudget - estimatedTokens, 0);
	const status: ContextUsageSnapshot['status'] =
		estimatedTokens > tokenBudget ? 'over_budget' : usagePercent >= 85 ? 'near_limit' : 'ok';

	return {
		estimatedTokens,
		tokenBudget,
		usagePercent,
		tokensRemaining,
		status,
		lastCompressedAt: null,
		lastCompression: null
	};
}

async function fetchChatSession(
	supabase: SupabaseClient<Database>,
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
		logger.error(error as Error, { operation: 'load_chat_session', sessionId });
		throw error;
	}

	return data ?? null;
}

async function createChatSession(
	supabase: SupabaseClient<Database>,
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
	supabase: SupabaseClient<Database>,
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
		logger.error('Failed to load chat history', { sessionId, error });
		return [];
	}

	return (data ?? []).reverse();
}

async function persistChatMessage(
	supabase: SupabaseClient<Database>,
	message: ChatMessageInsert
): Promise<void> {
	const { error } = await supabase.from('chat_messages').insert(message);
	if (error) {
		logger.error('Failed to save chat message', {
			error,
			sessionId: message.session_id,
			role: message.role,
			hasToolCalls: !!message.tool_calls
		});
	}
}

/**
 * Load ontology context based on context type and optional entity type
 */
async function loadOntologyContext(
	supabase: SupabaseClient<Database>,
	contextType: ChatContextType,
	entityId?: string,
	ontologyEntityType?: 'task' | 'plan' | 'goal' | 'document' | 'output'
): Promise<OntologyContext | null> {
	logger.debug('Loading ontology context', {
		contextType,
		entityId,
		ontologyEntityType
	});

	const loader = new OntologyContextLoader(supabase);

	try {
		// If entity type is specified, load element context
		if (ontologyEntityType && entityId) {
			logger.debug('Loading element-level ontology context');
			return await loader.loadElementContext(ontologyEntityType, entityId);
		}

		// If project context, load project-level ontology
		if ((contextType === 'project' || contextType === 'project_audit') && entityId) {
			logger.debug('Loading project-level ontology context');
			return await loader.loadProjectContext(entityId);
		}

		// Otherwise, load global context
		if (contextType === 'global') {
			logger.debug('Loading global ontology context');
			return await loader.loadGlobalContext();
		}

		// No ontology context applicable
		logger.debug('No ontology context applicable for context type', { contextType });
		return null;
	} catch (error) {
		logger.error('Failed to load ontology context', { error, contextType, entityId });
		return null; // Don't fail the request, just proceed without ontology
	}
}

/**
 * Generate last turn context from recent messages
 * Provides conversation continuity between turns
 *
 * SIMPLIFIED: Uses pre-extracted entities from ToolExecutionService
 * instead of redundant recursive payload parsing.
 */
function generateLastTurnContext(
	recentMessages: ChatMessage[],
	contextType: ChatContextType,
	options: { toolResults?: any[] } = {}
): LastTurnContext | null {
	if (!recentMessages || recentMessages.length < 2) {
		return null;
	}

	const lastAssistantMsg = recentMessages.filter((m) => m.role === 'assistant').pop();
	const lastUserMsg = recentMessages.filter((m) => m.role === 'user').pop();

	if (!lastAssistantMsg || !lastUserMsg) {
		return null;
	}

	logger.debug('Generating last turn context', {
		lastUserContent: lastUserMsg.content.substring(0, 50),
		lastAssistantContent: lastAssistantMsg.content.substring(0, 50)
	});

	// Extract tool names from last assistant message
	const toolsUsed: string[] = [];
	if (lastAssistantMsg.tool_calls) {
		try {
			const toolCalls = Array.isArray(lastAssistantMsg.tool_calls)
				? lastAssistantMsg.tool_calls
				: JSON.parse(lastAssistantMsg.tool_calls as any);

			toolCalls.forEach((tc: any) => {
				const toolName = tc.function?.name || tc.name;
				if (toolName) toolsUsed.push(toolName);
			});
		} catch (e) {
			logger.warn('Failed to extract tool calls', { error: e });
		}
	}

	// Use pre-extracted entities from ToolExecutionService
	// This service already extracts entities during tool execution
	const entities: LastTurnContext['entities'] = {};
	const toolResults = options.toolResults ?? [];

	for (const result of toolResults) {
		if (!result) continue;

		// ToolExecutionService already extracted these entities
		const accessed = result.entities_accessed ?? result.entitiesAccessed;
		if (Array.isArray(accessed)) {
			accessed.forEach((entityId: string) => {
				assignEntityByPrefix(entities, entityId);
			});
		}
	}

	// Generate summary
	const summary = lastUserMsg.content.substring(0, 60).trim() + '...';

	return {
		summary,
		entities,
		context_type: contextType,
		data_accessed: toolsUsed,
		strategy_used: undefined,
		timestamp: lastAssistantMsg.created_at || new Date().toISOString()
	};
}

function buildContextShiftLastTurnContext(
	contextShift: {
		new_context: ChatContextType | string;
		entity_id?: string;
		entity_name?: string;
		entity_type?: 'project' | 'task' | 'plan' | 'goal' | 'document' | 'output';
		message?: string;
	},
	defaultContextType: ChatContextType
): LastTurnContext {
	const normalized = normalizeContextType(
		(contextShift.new_context ?? defaultContextType) as ChatContextType
	);

	const summary =
		contextShift.message ??
		`Context shifted to ${contextShift.entity_name ?? contextShift.entity_type ?? normalized}.`;

	const entities: LastTurnContext['entities'] = {};
	switch (contextShift.entity_type) {
		case 'project':
			if (contextShift.entity_id) entities.project_id = contextShift.entity_id;
			break;
		case 'task':
			if (contextShift.entity_id) entities.task_ids = [contextShift.entity_id];
			break;
		case 'plan':
			if (contextShift.entity_id) entities.plan_id = contextShift.entity_id;
			break;
		case 'goal':
			if (contextShift.entity_id) entities.goal_ids = [contextShift.entity_id];
			break;
		case 'document':
			if (contextShift.entity_id) entities.document_id = contextShift.entity_id;
			break;
		case 'output':
			if (contextShift.entity_id) entities.output_id = contextShift.entity_id;
			break;
		default:
			break;
	}

	return {
		summary,
		entities,
		context_type: normalized,
		data_accessed: ['context_shift'],
		strategy_used: undefined,
		timestamp: new Date().toISOString()
	};
}

/**
 * Simplified helper: Assign entity by ID prefix
 * Replaces 6 complex helper functions with one simple function
 */
function assignEntityByPrefix(entities: LastTurnContext['entities'], entityId: string): void {
	if (!entityId) return;

	// Assign to correct slot based on ID prefix
	if (entityId.startsWith('proj_')) {
		entities.project_id = entityId;
	} else if (entityId.startsWith('task_')) {
		entities.task_ids = entities.task_ids || [];
		if (!entities.task_ids.includes(entityId)) {
			entities.task_ids.push(entityId);
		}
	} else if (entityId.startsWith('plan_')) {
		entities.plan_id = entityId;
	} else if (entityId.startsWith('goal_')) {
		entities.goal_ids = entities.goal_ids || [];
		if (!entities.goal_ids.includes(entityId)) {
			entities.goal_ids.push(entityId);
		}
	} else if (entityId.startsWith('doc_')) {
		entities.document_id = entityId;
	} else if (entityId.startsWith('out_')) {
		entities.output_id = entityId;
	}
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
		const body = (await request.json()) as EnhancedAgentStreamRequest;
		const {
			message,
			session_id,
			context_type = 'global',
			entity_id,
			conversation_history: conversationHistory = [],
			ontologyEntityType,
			lastTurnContext: providedLastTurnContext,
			projectFocus
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

		const focusProvided = Object.prototype.hasOwnProperty.call(body, 'projectFocus');
		const existingMetadataRaw = ((chatSession.agent_metadata as AgentSessionMetadata) ??
			{}) as AgentSessionMetadata;
		const sessionMetadata: AgentSessionMetadata = { ...existingMetadataRaw };
		const storedFocus = normalizeProjectFocus(existingMetadataRaw.focus);
		const incomingFocus = focusProvided
			? normalizeProjectFocus(projectFocus ?? null)
			: undefined;
		let resolvedProjectFocus: ProjectFocus | null = storedFocus;

		if (focusProvided) {
			sessionMetadata.focus = incomingFocus ?? null;
			const storedSerialized = JSON.stringify(storedFocus ?? null);
			const incomingSerialized = JSON.stringify(incomingFocus ?? null);
			if (storedSerialized !== incomingSerialized) {
				const { error: metadataError } = await supabase
					.from('chat_sessions')
					.update({
						agent_metadata: sessionMetadata
					})
					.eq('id', chatSession.id);

				if (metadataError) {
					logger.error('Failed to persist focus metadata', {
						error: metadataError,
						sessionId: chatSession.id
					});
				} else {
					chatSession.agent_metadata = sessionMetadata as any;
				}
			}

			resolvedProjectFocus = incomingFocus ?? null;
		} else {
			resolvedProjectFocus = storedFocus;
		}

		// Save user message to chat_messages
		const userMessageTimestamp = new Date().toISOString();
		const userMessageData: ChatMessageInsert = {
			session_id: chatSession.id,
			user_id: userId,
			role: 'user',
			content: message,
			created_at: userMessageTimestamp
		};
		await persistChatMessage(supabase, userMessageData);

		// === ONTOLOGY INTEGRATION ===

		const ontologyLoader = new OntologyContextLoader(supabase);

		// Validate ontologyEntityType if provided
		const validOntologyTypes = ['task', 'plan', 'goal', 'document', 'output'] as const;
		let validatedOntologyEntityType: (typeof validOntologyTypes)[number] | undefined;

		if (ontologyEntityType) {
			if (validOntologyTypes.includes(ontologyEntityType as any)) {
				validatedOntologyEntityType = ontologyEntityType;
			} else {
				logger.warn('Invalid ontologyEntityType provided', {
					provided: ontologyEntityType,
					validTypes: validOntologyTypes
				});
			}
		}

		// === ONTOLOGY CACHING ===
		const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
		const cacheKey = generateOntologyCacheKey(
			resolvedProjectFocus,
			normalizedContextType,
			entity_id
		);
		const cached = sessionMetadata.ontologyCache;
		const cacheAge = cached ? Date.now() - cached.loadedAt : Infinity;
		const isCacheValid = cached && cached.cacheKey === cacheKey && cacheAge < CACHE_TTL_MS;

		let ontologyContext: OntologyContext | null = null;

		if (isCacheValid) {
			// Use cached ontology context
			ontologyContext = cached.context;
			logger.debug('Using cached ontology context', {
				cacheKey,
				cacheAgeMs: cacheAge,
				cacheAgeSec: Math.round(cacheAge / 1000)
			});
		} else {
			// Load fresh ontology context
			if (resolvedProjectFocus?.projectId && normalizedContextType === 'project') {
				try {
					if (
						resolvedProjectFocus.focusType !== 'project-wide' &&
						resolvedProjectFocus.focusEntityId
					) {
						ontologyContext = await ontologyLoader.loadCombinedProjectElementContext(
							resolvedProjectFocus.projectId,
							resolvedProjectFocus.focusType,
							resolvedProjectFocus.focusEntityId
						);
					} else {
						ontologyContext = await ontologyLoader.loadProjectContext(
							resolvedProjectFocus.projectId
						);
					}
				} catch (focusLoadError) {
					logger.error('Failed to load focus-aware context', {
						error: focusLoadError,
						projectFocus: resolvedProjectFocus
					});
				}
			} else {
				ontologyContext =
					normalizedContextType === 'project_create'
						? null
						: await loadOntologyContext(
								supabase,
								normalizedContextType,
								entity_id,
								validatedOntologyEntityType
							);
			}

			// Update cache if we loaded context
			if (ontologyContext) {
				sessionMetadata.ontologyCache = {
					context: ontologyContext,
					loadedAt: Date.now(),
					cacheKey
				};

				// Persist cache to session (fire-and-forget to not block stream)
				supabase
					.from('chat_sessions')
					.update({
						agent_metadata: sessionMetadata
					})
					.eq('id', chatSession.id)
					.then(({ error }) => {
						if (error) {
							logger.warn('Failed to persist ontology cache', {
								error,
								sessionId: chatSession.id
							});
						} else {
							logger.debug('Ontology cache persisted', {
								cacheKey,
								sessionId: chatSession.id
							});
						}
					});
			}
		}

		logger.debug('Ontology context loaded', {
			hasOntology: !!ontologyContext,
			type: ontologyContext?.type,
			entityCount: ontologyContext?.metadata?.entity_count
		});

		// Generate last turn context if not provided
		const resolvedHistory =
			storedConversationHistory.length > 0 ? storedConversationHistory : providedHistory;

		let lastTurnContextForPlanner =
			generateLastTurnContext(resolvedHistory, normalizedContextType) ?? undefined;
		if (!lastTurnContextForPlanner && providedLastTurnContext) {
			lastTurnContextForPlanner = providedLastTurnContext;
		}

		logger.debug('Resolved last turn context', {
			hasContext: !!lastTurnContextForPlanner,
			summary: lastTurnContextForPlanner?.summary,
			entitiesCount: Object.keys(lastTurnContextForPlanner?.entities || {}).length
		});

		const historyToUse = resolvedHistory;
		let effectiveContextType = normalizedContextType;

		const agentStream = SSEResponse.createChatStream();
		const compressionService = new ChatCompressionService(supabase);
		const historyForUsage = [...historyToUse, { content: message }];

		// Send a fast estimate immediately without blocking the stream
		const quickUsageSnapshot = buildQuickUsageSnapshot(
			historyForUsage,
			CONTEXT_USAGE_TOKEN_BUDGET
		);
		void agentStream.sendMessage({
			type: 'context_usage',
			usage: quickUsageSnapshot
		});

		// Fetch richer usage stats in the background without blocking the main flow
		void (async () => {
			try {
				const usageSnapshot = await compressionService.getContextUsageSnapshot(
					chatSession.id,
					historyForUsage,
					CONTEXT_USAGE_TOKEN_BUDGET
				);

				void agentStream.sendMessage({
					type: 'context_usage',
					usage: usageSnapshot
				});
			} catch (usageError) {
				logger.warn('Failed to send context usage snapshot', {
					error: usageError,
					sessionId: chatSession.id
				});
			}
		})();

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
					logger.info('Context shift detected', { contextShift });
					const normalizedShiftContext = normalizeContextType(
						(contextShift.new_context as ChatContextType) ?? effectiveContextType
					);
					effectiveContextType = normalizedShiftContext;
					const shiftMessage =
						contextShift.message ??
						`✓ Context switched to ${contextShift.entity_name || normalizedShiftContext}.`;

					await agentStream.sendMessage({
						type: 'context_shift',
						context_shift: {
							new_context: normalizedShiftContext,
							entity_id: contextShift.entity_id,
							entity_name: contextShift.entity_name,
							entity_type: contextShift.entity_type,
							message: shiftMessage
						}
					});

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
					lastTurnContextForPlanner = shiftTurnContext;

					const { error: updateError } = await supabase
						.from('chat_sessions')
						.update({
							context_type: normalizedShiftContext,
							entity_id: contextShift.entity_id,
							updated_at: new Date().toISOString()
						})
						.eq('id', chatSession.id);

					if (updateError) {
						logger.error('Failed to update chat session context', {
							error: updateError,
							sessionId: chatSession.id
						});
					} else {
						logger.info('Chat session context updated', {
							sessionId: chatSession.id,
							newContext: normalizedShiftContext,
							entityId: contextShift.entity_id
						});
					}

					const contextShiftMessage: ChatMessageInsert = {
						session_id: chatSession.id,
						user_id: userId,
						role: 'system',
						content: `Context shifted to ${normalizedShiftContext} for "${contextShift.entity_name}" (ID: ${contextShift.entity_id})`,
						created_at: new Date().toISOString()
					};
					await persistChatMessage(supabase, contextShiftMessage);
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
				if (resolvedProjectFocus) {
					await agentStream.sendMessage({
						type: 'focus_active',
						focus: resolvedProjectFocus
					});
				}

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
					lastTurnContext: lastTurnContextForPlanner || undefined,
					projectFocus: resolvedProjectFocus || undefined
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
					const assistantMessageTimestamp = new Date().toISOString();
					const assistantMessageData: ChatMessageInsert = {
						session_id: chatSession.id,
						user_id: userId,
						role: 'assistant',
						content: assistantResponse || '', // Can be empty if only tool calls
						tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
						created_at: assistantMessageTimestamp
					};

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

							const toolResultMessage: ChatMessageInsert = {
								session_id: chatSession.id,
								user_id: userId,
								role: 'tool',
								content: JSON.stringify(normalizedResult),
								tool_call_id: toolCall.id,
								created_at: new Date().toISOString()
							};

							await persistChatMessage(supabase, toolResultMessage);
						} else {
							logger.warn('No result found for tool call', {
								toolCallId: toolCall.id,
								toolName: toolCall.function?.name
							});
						}
					}

					const historyAfterTurn: ChatMessage[] = [
						...historyToUse,
						{
							session_id: chatSession.id,
							user_id: userId,
							role: 'user',
							content: message,
							created_at: userMessageTimestamp
						} as ChatMessage,
						{
							session_id: chatSession.id,
							user_id: userId,
							role: 'assistant',
							content: assistantResponse || '',
							created_at: assistantMessageTimestamp,
							tool_calls: toolCalls.length > 0 ? toolCalls : undefined
						} as ChatMessage
					];

					const refreshedLastTurnContext =
						generateLastTurnContext(historyAfterTurn, effectiveContextType, {
							toolResults
						}) ?? undefined;

					if (refreshedLastTurnContext) {
						await agentStream.sendMessage({
							type: 'last_turn_context',
							context: refreshedLastTurnContext
						});
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
				logger.error('Agent streaming error', {
					error: streamError,
					sessionId: chatSession.id,
					userId,
					contextType: effectiveContextType,
					entityId: entity_id,
					hasOntology: !!ontologyContext,
					messageLength: message.length
				});

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
			logger.error('Uncaught error in agent stream', { error: uncaughtError });
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
		logger.error('Agent API error', { error: err });
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
			logger.error('Failed to get sessions', { error: sessionsError, userId });
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
		case 'agent_state':
			return {
				type: 'agent_state',
				state: (event as any).state,
				contextType: normalizeContextType((event as any).contextType),
				details: (event as any).details
			};
		case 'clarifying_questions':
			return {
				type: 'clarifying_questions',
				questions: (event as any).questions ?? []
			};
		case 'plan_created':
			return { type: 'plan_created', plan: (event as any).plan };
		case 'plan_ready_for_review':
			return {
				type: 'plan_ready_for_review',
				plan: (event as any).plan,
				summary: (event as any).summary,
				recommendations: (event as any).recommendations
			};
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
		case 'plan_review':
			return {
				type: 'plan_review',
				plan: (event as any).plan,
				verdict: (event as any).verdict,
				notes: (event as any).notes,
				reviewer: (event as any).reviewer
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
		case 'focus_active':
			return { type: 'focus_active', focus: (event as any).focus };
		case 'focus_changed':
			return { type: 'focus_changed', focus: (event as any).focus };
		case 'context_usage':
			return { type: 'context_usage', usage: (event as any).usage };
		case 'done':
			return { type: 'done', usage: (event as any).usage };
		case 'error':
			return { type: 'error', error: (event as any).error ?? 'Unknown error' };
		default:
			return null;
	}
}
