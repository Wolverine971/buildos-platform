// apps/web/src/routes/api/agent/stream/services/session-manager.ts
/**
 * Session Manager Service for /api/agent/stream endpoint.
 *
 * Handles chat session lifecycle management for both POST and GET handlers.
 * Extracts session CRUD operations from the main endpoint file.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Database,
	ChatSession,
	ChatSessionInsert,
	ChatMessage,
	ChatContextType
} from '@buildos/shared-types';
import { ApiResponse } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';
import type { AgentSessionMetadata, SessionResolutionResult, StreamRequest } from '../types';
import { RECENT_MESSAGE_LIMIT, DEFAULT_SESSION_TITLE, MAX_SESSIONS_LIST } from '../constants';
import { normalizeProjectFocus, projectFocusEquals } from '../utils';

const logger = createLogger('SessionManager');

// ============================================
// SESSION MANAGER CLASS
// ============================================

/**
 * Manages chat session lifecycle for the agent stream endpoint.
 * Shared between POST and GET handlers.
 */
export class SessionManager {
	constructor(private supabase: SupabaseClient<Database>) {}

	// ============================================
	// POST HANDLER OPERATIONS
	// ============================================

	/**
	 * Resolve session for POST handler.
	 * Either fetches existing session or creates a new one.
	 *
	 * @param request - The parsed stream request
	 * @param userId - The authenticated user ID
	 * @returns SessionResolutionResult with session, metadata, and history
	 */
	async resolveSession(
		request: StreamRequest,
		userId: string
	): Promise<SessionResolutionResult | { success: false; response: Response }> {
		const { session_id, context_type, entity_id, history: providedHistory = [] } = request;

		let session: ChatSession | null = null;
		let conversationHistory: ChatMessage[] = [];
		let isNewSession = false;

		if (session_id) {
			// Fetch existing session
			session = await this.fetchChatSession(session_id, userId);

			if (!session) {
				return {
					success: false,
					response: ApiResponse.notFound('Session')
				};
			}

			// Load history if not provided
			if (providedHistory.length === 0) {
				conversationHistory = await this.loadRecentMessages(session_id);
			} else {
				conversationHistory = providedHistory;
			}
		} else {
			// Create new session
			session = await this.createChatSession({
				userId,
				contextType: context_type,
				entityId: entity_id
			});
			isNewSession = true;
		}

		if (!session) {
			return {
				success: false,
				response: ApiResponse.internalError(
					new Error('Failed to resolve chat session'),
					'Failed to resolve chat session'
				)
			};
		}

		// Extract existing metadata
		const existingMetadata = (session.agent_metadata as AgentSessionMetadata) ?? {};
		const metadata: AgentSessionMetadata = { ...existingMetadata };

		return {
			success: true,
			session,
			metadata,
			conversationHistory,
			isNewSession
		};
	}

	/**
	 * Resolve and update project focus.
	 * Handles focus comparison and metadata updates.
	 *
	 * @param request - The parsed stream request
	 * @param session - The resolved chat session
	 * @param metadata - The session metadata to update
	 * @returns Updated metadata and resolved focus
	 */
	async resolveProjectFocus(
		request: StreamRequest,
		session: ChatSession,
		metadata: AgentSessionMetadata
	): Promise<{
		resolvedFocus: StreamRequest['project_focus'];
		metadata: AgentSessionMetadata;
		focusChanged: boolean;
	}> {
		// Check if focus was explicitly provided in request
		const focusProvided = request.project_focus !== undefined;

		const storedFocus = normalizeProjectFocus(metadata.focus);
		const incomingFocus = focusProvided
			? normalizeProjectFocus(request.project_focus ?? null)
			: undefined;

		let resolvedFocus = storedFocus;
		let focusChanged = false;

		if (focusProvided) {
			metadata.focus = incomingFocus ?? null;

			if (!projectFocusEquals(storedFocus, incomingFocus)) {
				focusChanged = true;

				// Persist focus change immediately (not deferred)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const { error: metadataError } = await (this.supabase as any)
					.from('chat_sessions')
					.update({ agent_metadata: metadata })
					.eq('id', session.id);

				if (metadataError) {
					logger.error('Failed to persist focus metadata', {
						error: metadataError,
						sessionId: session.id
					});
				} else {
					// Update session object to reflect change
					(session as any).agent_metadata = metadata;
				}
			}

			resolvedFocus = incomingFocus ?? null;
		}

		return { resolvedFocus, metadata, focusChanged };
	}

	/**
	 * Update session metadata.
	 * Used for deferred metadata persistence at stream end.
	 *
	 * @param sessionId - The session ID
	 * @param metadata - The metadata to persist
	 */
	async updateSessionMetadata(sessionId: string, metadata: AgentSessionMetadata): Promise<void> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const { error } = await (this.supabase as any)
			.from('chat_sessions')
			.update({ agent_metadata: metadata })
			.eq('id', sessionId);

		if (error) {
			logger.warn('Failed to persist session metadata', {
				error,
				sessionId,
				hasOntologyCache: !!metadata.ontologyCache,
				hasClarification: !!metadata.projectClarification
			});
		} else {
			logger.debug('Session metadata persisted', {
				sessionId,
				hasOntologyCache: !!metadata.ontologyCache,
				clarificationRound: metadata.projectClarification?.roundNumber
			});
		}
	}

	/**
	 * Update session context after a context shift.
	 *
	 * @param sessionId - The session ID
	 * @param newContextType - The new context type
	 * @param entityId - The new entity ID
	 */
	async updateSessionContext(
		sessionId: string,
		newContextType: ChatContextType,
		entityId?: string
	): Promise<void> {
		const { error } = await this.supabase
			.from('chat_sessions')
			.update({
				context_type: newContextType,
				entity_id: entityId,
				updated_at: new Date().toISOString()
			})
			.eq('id', sessionId);

		if (error) {
			logger.error('Failed to update chat session context', {
				error,
				sessionId
			});
		} else {
			logger.info('Chat session context updated', {
				sessionId,
				newContext: newContextType,
				entityId
			});
		}
	}

	// ============================================
	// GET HANDLER OPERATIONS
	// ============================================

	/**
	 * Get a single session with its messages.
	 * Used by GET handler when session_id is provided.
	 *
	 * @param sessionId - The session ID to fetch
	 * @param userId - The authenticated user ID
	 * @returns API response with session and messages
	 */
	async getSessionWithMessages(sessionId: string, userId: string): Promise<Response> {
		const { data: chatSession, error: sessionError } = await this.supabase
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
	}

	/**
	 * List user's active sessions.
	 * Used by GET handler when no session_id is provided.
	 *
	 * @param userId - The authenticated user ID
	 * @returns API response with list of sessions
	 */
	async listUserSessions(userId: string): Promise<Response> {
		const { data: sessions, error: sessionsError } = await this.supabase
			.from('chat_sessions')
			.select('*')
			.eq('user_id', userId)
			.eq('status', 'active')
			.order('updated_at', { ascending: false })
			.limit(MAX_SESSIONS_LIST);

		if (sessionsError) {
			logger.error('Failed to get sessions', { error: sessionsError, userId });
			return ApiResponse.internalError(sessionsError, 'Failed to get agent sessions');
		}

		return ApiResponse.success({ sessions });
	}

	// ============================================
	// INTERNAL HELPERS
	// ============================================

	/**
	 * Fetch a chat session by ID.
	 *
	 * @param sessionId - The session ID
	 * @param userId - The user ID (for ownership check)
	 * @returns ChatSession or null if not found
	 */
	private async fetchChatSession(sessionId: string, userId: string): Promise<ChatSession | null> {
		const { data, error } = await this.supabase
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

	/**
	 * Create a new chat session.
	 *
	 * @param params - Session creation parameters
	 * @returns The created ChatSession
	 */
	private async createChatSession(params: {
		userId: string;
		contextType: ChatContextType;
		entityId?: string;
	}): Promise<ChatSession> {
		const sessionData: ChatSessionInsert = {
			user_id: params.userId,
			context_type: params.contextType,
			entity_id: params.entityId,
			status: 'active',
			message_count: 0,
			total_tokens_used: 0,
			tool_call_count: 0,
			title: DEFAULT_SESSION_TITLE
		};

		const { data, error } = await this.supabase
			.from('chat_sessions')
			.insert(sessionData)
			.select()
			.single();

		if (error || !data) {
			throw error ?? new Error('Failed to create agent chat session');
		}

		return data;
	}

	/**
	 * Load recent messages for a session.
	 *
	 * @param sessionId - The session ID
	 * @param limit - Maximum messages to load
	 * @returns Array of ChatMessage
	 */
	private async loadRecentMessages(
		sessionId: string,
		limit: number = RECENT_MESSAGE_LIMIT
	): Promise<ChatMessage[]> {
		const { data, error } = await this.supabase
			.from('chat_messages')
			.select('*')
			.eq('session_id', sessionId)
			.order('created_at', { ascending: false })
			.limit(limit);

		if (error) {
			logger.error('Failed to load chat history', { sessionId, error });
			return [];
		}

		// Reverse to get chronological order
		return (data ?? []).reverse();
	}
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create a SessionManager instance.
 *
 * @param supabase - Supabase client
 * @returns SessionManager instance
 */
export function createSessionManager(supabase: SupabaseClient<Database>): SessionManager {
	return new SessionManager(supabase);
}
