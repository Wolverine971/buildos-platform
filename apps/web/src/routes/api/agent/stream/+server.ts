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
 * REFACTORED: This file is now a thin orchestrator that delegates to services.
 * See the /services and /utils directories for implementation details.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import type { EnhancedAgentStreamRequest } from '$lib/types/agent-chat-enhancement';
import { createLogger } from '$lib/utils/logger';
import { SSEResponse } from '$lib/utils/sse-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { sanitizeLogData } from '$lib/utils/logging-helpers';

// Local imports
import type { StreamRequest, AuthResult } from './types';
import { ERROR_MESSAGES, ERROR_CODES } from './constants';
import { normalizeContextType, rateLimiter } from './utils';
import {
	createSessionManager,
	createOntologyCacheService,
	createMessagePersister,
	createStreamHandler
} from './services';

// ============================================
// LOGGING
// ============================================

const logger = createLogger('API:AgentStream');

// ============================================
// AUTHENTICATION HELPER
// ============================================

/**
 * Authenticate the request and resolve actor ID.
 *
 * @param safeGetSession - Session getter from locals
 * @param supabase - Supabase client
 * @returns AuthResult with userId and actorId, or error response
 */
async function authenticateRequest(
	safeGetSession: () => Promise<{ user: { id: string } | null }>,
	supabase: any,
	options?: {
		errorLogger?: ErrorLoggerService;
		httpMethod?: string;
		endpoint?: string;
	}
): Promise<AuthResult> {
	const { user } = await safeGetSession();

	if (!user?.id) {
		return {
			success: false,
			response: ApiResponse.unauthorized()
		};
	}

	const userId = user.id;

	const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
		p_user_id: userId
	});

	if (actorError || !actorId) {
		logger.error('Failed to resolve actor for user', { error: actorError, userId });
		if (options?.errorLogger) {
			await options.errorLogger.logError(actorError ?? 'Actor resolution failed', {
				userId,
				endpoint: options.endpoint,
				httpMethod: options.httpMethod,
				operationType: 'actor_resolution',
				metadata: {
					actorError: sanitizeLogData(actorError),
					actorIdMissing: !actorId
				}
			});
		}
		return {
			success: false,
			response: ApiResponse.error(
				ERROR_MESSAGES.ACTOR_RESOLUTION_FAILED,
				500,
				ERROR_CODES.ACTOR_RESOLUTION_FAILED
			)
		};
	}

	return {
		success: true,
		userId,
		actorId
	};
}

/**
 * Parse and validate the request body.
 *
 * @param request - The incoming request
 * @returns Parsed StreamRequest or error response
 */
async function parseRequest(
	request: Request,
	errorLogger?: ErrorLoggerService,
	userId?: string
): Promise<{ success: true; data: StreamRequest } | { success: false; response: Response }> {
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
			projectFocus,
			stream_run_id
		} = body;

		if (!message?.trim()) {
			return {
				success: false,
				response: ApiResponse.badRequest(ERROR_MESSAGES.MESSAGE_REQUIRED)
			};
		}

		const normalizedContextType = normalizeContextType(context_type);

		const streamRequest: StreamRequest = {
			message,
			session_id,
			context_type: normalizedContextType,
			entity_id,
			history: Array.isArray(conversationHistory) ? conversationHistory : [],
			ontology_entity_type: ontologyEntityType,
			last_turn_context: providedLastTurnContext,
			stream_run_id
		};

		if (projectFocus !== undefined) {
			streamRequest.project_focus = projectFocus;
		}

		return {
			success: true,
			data: streamRequest
		};
	} catch (err) {
		logger.error('Failed to parse request body', { error: err });
		if (errorLogger) {
			await errorLogger.logError(err, {
				userId,
				endpoint: '/api/agent/stream',
				httpMethod: 'POST',
				operationType: 'agent_stream_parse',
				metadata: {
					parseError: sanitizeLogData(err)
				}
			});
		}
		return {
			success: false,
			response: ApiResponse.badRequest('Invalid request body')
		};
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
	const errorLogger = ErrorLoggerService.getInstance(supabase);

	// 1. Authenticate
	const authResult = await authenticateRequest(safeGetSession, supabase, {
		errorLogger,
		httpMethod: 'POST',
		endpoint: '/api/agent/stream'
	});
	if (!authResult.success) {
		return authResult.response;
	}
	const { userId, actorId } = authResult;

	// 2. Check rate limit
	const rateLimitResult = rateLimiter.checkLimit(userId);
	if (!rateLimitResult.allowed && rateLimitResult.response) {
		return rateLimitResult.response;
	}

	// 3. Parse and validate request
	const parseResult = await parseRequest(request, errorLogger, userId);
	if (!parseResult.success) {
		return parseResult.response;
	}
	const streamRequest = parseResult.data;

	// Create stream early so the UI can show server-side activity immediately.
	const agentStream = SSEResponse.createChatStream();
	void agentStream
		.sendMessage({
			type: 'agent_state',
			state: 'thinking',
			contextType: streamRequest.context_type,
			details: 'BuildOS is processing your request...'
		})
		.catch((error) => {
			logger.warn('Failed to emit initial agent state', { error });
		});

	void (async () => {
		try {
			// 4. Create services
			const sessionManager = createSessionManager(supabase);
			const ontologyCacheService = createOntologyCacheService(supabase, actorId);
			const messagePersister = createMessagePersister(supabase);
			const streamHandler = createStreamHandler(supabase);

			// 5. Resolve session
			const sessionResult = await sessionManager.resolveSession(streamRequest, userId);
			if (!sessionResult.success) {
				await agentStream.sendMessage({
					type: 'error',
					error: 'Session not found.'
				});
				await agentStream.sendMessage({
					type: 'done',
					usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
					finished_reason: 'error'
				});
				await agentStream.close();
				return;
			}
			const { session, metadata, conversationHistory } = sessionResult;

			// 6. Resolve project focus
			const focusResult = await sessionManager.resolveProjectFocus(
				streamRequest,
				session,
				metadata
			);

			// 7. Load ontology context with caching
			let ontologyContext = null;
			try {
				const ontologyResult = await ontologyCacheService.loadWithSessionCache(
					streamRequest,
					focusResult.metadata
				);

				ontologyContext = ontologyResult.context;

				// Update metadata with cache if changed
				if (ontologyResult.cacheUpdated && ontologyResult.cacheMetadata) {
					focusResult.metadata.ontologyCache = ontologyResult.cacheMetadata;
				}

				logger.debug('Ontology context loaded', {
					hasOntology: !!ontologyContext,
					type: ontologyContext?.type,
					entityCount: ontologyContext?.metadata?.entity_count
				});
			} catch (ontologyError) {
				if (
					ontologyError instanceof Error &&
					ontologyError.message.includes('access denied')
				) {
					await errorLogger.logError(
						ontologyError,
						{
							userId,
							projectId: streamRequest.entity_id,
							endpoint: '/api/agent/stream',
							httpMethod: 'POST',
							operationType: 'ontology_access_denied',
							metadata: {
								contextType: streamRequest.context_type,
								sessionId: session.id,
								streamRunId: streamRequest.stream_run_id ?? null
							}
						},
						'warning'
					);
					await agentStream.sendMessage({
						type: 'error',
						error: ERROR_MESSAGES.CONTEXT_ACCESS_DENIED
					});
					await agentStream.sendMessage({
						type: 'done',
						usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
						finished_reason: 'error'
					});
					await agentStream.close();
					return;
				}

				logger.error('Failed to load ontology context', {
					error: ontologyError,
					contextType: streamRequest.context_type,
					entityId: streamRequest.entity_id
				});
				await errorLogger.logError(ontologyError, {
					userId,
					projectId: streamRequest.entity_id,
					endpoint: '/api/agent/stream',
					httpMethod: 'POST',
					operationType: 'ontology_load',
					metadata: {
						contextType: streamRequest.context_type,
						sessionId: session.id,
						streamRunId: streamRequest.stream_run_id ?? null
					}
				});
				await agentStream.sendMessage({
					type: 'error',
					error: ERROR_MESSAGES.ONTOLOGY_LOAD_FAILED
				});
				await agentStream.sendMessage({
					type: 'done',
					usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
					finished_reason: 'error'
				});
				await agentStream.close();
				return;
			}

			// 8. Persist user message (only after ontology access is validated)
			await messagePersister.persistUserMessage({
				sessionId: session.id,
				userId,
				content: streamRequest.message
			});

			// 9. Start stream orchestration on the already-open SSE stream
			streamHandler.startAgentStream(
				{
					supabase,
					fetch,
					request: streamRequest,
					requestAbortSignal: request.signal,
					session,
					ontologyContext,
					metadata: focusResult.metadata,
					conversationHistory,
					userId,
					actorId,
					httpReferer: request.headers.get('referer') ?? undefined
				},
				agentStream
			);
		} catch (err) {
			logger.error('Agent API error', { error: err });
			await errorLogger.logError(err, {
				userId,
				endpoint: '/api/agent/stream',
				httpMethod: 'POST',
				operationType: 'agent_stream_preflight',
				metadata: {
					sessionId: streamRequest.session_id,
					contextType: streamRequest.context_type,
					streamRunId: streamRequest.stream_run_id ?? null
				}
			});
			await agentStream.sendMessage({
				type: 'error',
				error: ERROR_MESSAGES.STREAM_ERROR
			});
			await agentStream.sendMessage({
				type: 'done',
				usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
				finished_reason: 'error'
			});
			await agentStream.close();
		}
	})();

	return agentStream.response;
};

// ============================================
// GET HANDLER
// ============================================

/**
 * GET /api/agent/stream
 * Get agent chat sessions
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const errorLogger = ErrorLoggerService.getInstance(supabase);

	// 1. Authenticate
	const authResult = await authenticateRequest(safeGetSession, supabase, {
		errorLogger,
		httpMethod: 'GET',
		endpoint: '/api/agent/stream'
	});
	if (!authResult.success) {
		return authResult.response;
	}
	const { userId } = authResult;

	// 2. Create session manager
	const sessionManager = createSessionManager(supabase);

	// 3. Parse query params
	const sessionId = url.searchParams.get('session_id');

	// 4. Return appropriate response
	if (sessionId) {
		// Return single session with messages
		return sessionManager.getSessionWithMessages(sessionId, userId);
	} else {
		// Return list of active sessions
		return sessionManager.listUserSessions(userId);
	}
};
