// apps/web/src/lib/services/agentic-chat/session/chat-session-service.ts
/**
 * Chat Session Service
 *
 * Handles all chat session management operations including:
 * - Session creation and retrieval
 * - Message persistence and loading
 * - Context management
 *
 * This service implements proper separation of concerns by extracting
 * session management logic from API endpoints.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Database,
	ChatSession,
	ChatSessionInsert,
	ChatSessionUpdate,
	ChatMessage,
	ChatMessageInsert,
	ChatContextType
} from '@buildos/shared-types';

export interface SessionParams {
	userId: string;
	contextType: ChatContextType;
	entityId?: string;
}

export interface SessionUpdateParams {
	contextType?: ChatContextType;
	entityId?: string;
	status?: 'active' | 'archived' | 'compressed';
}

/**
 * Service for managing chat sessions and messages
 */
export class ChatSessionService {
	constructor(private supabase: SupabaseClient<Database>) {}

	/**
	 * Fetch an existing chat session
	 */
	async fetchSession(sessionId: string, userId: string): Promise<ChatSession | null> {
		try {
			const { data, error } = await this.supabase
				.from('chat_sessions')
				.select('*')
				.eq('id', sessionId)
				.eq('user_id', userId)
				.single();

			if (error) {
				if (error.code === 'PGRST116') {
					// Not found - expected case
					return null;
				}
				throw new Error(`Failed to fetch session: ${error.message}`);
			}

			return data;
		} catch (error) {
			console.error('[ChatSessionService] Failed to fetch session:', error);
			throw error;
		}
	}

	/**
	 * Create a new chat session
	 */
	async createSession(params: SessionParams): Promise<ChatSession> {
		try {
			const sessionData: ChatSessionInsert = {
				user_id: params.userId,
				context_type: params.contextType,
				entity_id: params.entityId,
				status: 'active',
				message_count: 0,
				total_tokens_used: 0,
				tool_call_count: 0,
				title: this.generateSessionTitle(params.contextType)
			};

			const { data, error } = await this.supabase
				.from('chat_sessions')
				.insert(sessionData)
				.select()
				.single();

			if (error || !data) {
				throw new Error(
					`Failed to create session: ${error?.message || 'No data returned'}`
				);
			}

			return data;
		} catch (error) {
			console.error('[ChatSessionService] Failed to create session:', error);
			throw error;
		}
	}

	/**
	 * Update an existing session
	 */
	async updateSession(sessionId: string, updates: SessionUpdateParams): Promise<void> {
		try {
			const updateData: ChatSessionUpdate = {
				...updates,
				updated_at: new Date().toISOString()
			};

			const { error } = await this.supabase
				.from('chat_sessions')
				.update(updateData)
				.eq('id', sessionId);

			if (error) {
				throw new Error(`Failed to update session: ${error.message}`);
			}
		} catch (error) {
			console.error('[ChatSessionService] Failed to update session:', error);
			throw error;
		}
	}

	/**
	 * Load recent messages for a session
	 */
	async loadRecentMessages(sessionId: string, limit: number = 50): Promise<ChatMessage[]> {
		try {
			const { data, error } = await this.supabase
				.from('chat_messages')
				.select('*')
				.eq('session_id', sessionId)
				.order('created_at', { ascending: false })
				.limit(limit);

			if (error) {
				throw new Error(`Failed to load messages: ${error.message}`);
			}

			// Return in chronological order
			return (data ?? []).reverse();
		} catch (error) {
			console.error('[ChatSessionService] Failed to load messages:', error);
			// Return empty array rather than throwing to prevent stream interruption
			return [];
		}
	}

	/**
	 * Persist a chat message
	 */
	async persistMessage(message: ChatMessageInsert): Promise<void> {
		try {
			const { error } = await this.supabase.from('chat_messages').insert(message);

			if (error) {
				// Log but don't throw to avoid breaking the stream
				console.error('[ChatSessionService] Failed to persist message:', error, message);
			}
		} catch (error) {
			// Log but don't throw to avoid breaking the stream
			console.error('[ChatSessionService] Unexpected error persisting message:', error);
		}
	}

	/**
	 * Persist multiple messages in a batch
	 */
	async persistMessages(messages: ChatMessageInsert[]): Promise<void> {
		if (messages.length === 0) return;

		try {
			const { error } = await this.supabase.from('chat_messages').insert(messages);

			if (error) {
				console.error(
					'[ChatSessionService] Failed to persist messages batch:',
					error,
					`Count: ${messages.length}`
				);
			}
		} catch (error) {
			console.error(
				'[ChatSessionService] Unexpected error persisting messages batch:',
				error
			);
		}
	}

	/**
	 * Get or create a session
	 */
	async getOrCreateSession(
		sessionId: string | undefined,
		params: SessionParams
	): Promise<ChatSession> {
		if (sessionId) {
			const existing = await this.fetchSession(sessionId, params.userId);
			if (existing) {
				return existing;
			}
			// Session ID provided but not found - create new one
			console.warn(
				`[ChatSessionService] Session ${sessionId} not found, creating new session`
			);
		}

		return this.createSession(params);
	}

	/**
	 * Get active sessions for a user
	 */
	async getActiveSessions(userId: string, limit: number = 10): Promise<ChatSession[]> {
		try {
			const { data, error } = await this.supabase
				.from('chat_sessions')
				.select('*')
				.eq('user_id', userId)
				.eq('status', 'active')
				.order('updated_at', { ascending: false })
				.limit(limit);

			if (error) {
				throw new Error(`Failed to get active sessions: ${error.message}`);
			}

			return data ?? [];
		} catch (error) {
			console.error('[ChatSessionService] Failed to get active sessions:', error);
			throw error;
		}
	}

	/**
	 * Get session with messages
	 */
	async getSessionWithMessages(
		sessionId: string,
		userId: string
	): Promise<{ session: ChatSession; messages: ChatMessage[] } | null> {
		try {
			const { data, error } = await this.supabase
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

			if (error || !data) {
				if (error?.code === 'PGRST116') {
					return null;
				}
				throw new Error(
					`Failed to get session with messages: ${error?.message || 'No data'}`
				);
			}

			return {
				session: data,
				messages: (data as any).messages ?? []
			};
		} catch (error) {
			console.error('[ChatSessionService] Failed to get session with messages:', error);
			throw error;
		}
	}

	/**
	 * Generate a session title based on context type
	 */
	private generateSessionTitle(contextType: ChatContextType): string {
		const titles: Record<ChatContextType, string> = {
			global: 'Agent Session',
			project: 'Project Assistant',
			task: 'Task Assistant',
			calendar: 'Calendar Assistant',
			general: 'General Assistant',
			project_create: 'New Project Creation',
			project_audit: 'Project Audit',
			project_forecast: 'Project Forecast',
			task_update: 'Task Update',
			daily_brief_update: 'Daily Brief Settings',
			brain_dump: 'Brain Dump Assistant',
			ontology: 'Ontology Assistant'
		};

		return titles[contextType] ?? 'Agent Session';
	}

	/**
	 * Update session metrics
	 */
	async updateSessionMetrics(
		sessionId: string,
		metrics: {
			incrementMessages?: number;
			incrementTokens?: number;
			incrementToolCalls?: number;
		}
	): Promise<void> {
		try {
			// First get current values
			const { data: current, error: fetchError } = await this.supabase
				.from('chat_sessions')
				.select('message_count, total_tokens_used, tool_call_count')
				.eq('id', sessionId)
				.single();

			if (fetchError) {
				console.error('[ChatSessionService] Failed to fetch current metrics:', fetchError);
				return;
			}

			// Calculate new values
			const updateData: ChatSessionUpdate = {
				message_count: (current.message_count ?? 0) + (metrics.incrementMessages ?? 0),
				total_tokens_used:
					(current.total_tokens_used ?? 0) + (metrics.incrementTokens ?? 0),
				tool_call_count: (current.tool_call_count ?? 0) + (metrics.incrementToolCalls ?? 0),
				updated_at: new Date().toISOString()
			};

			const { error: updateError } = await this.supabase
				.from('chat_sessions')
				.update(updateData)
				.eq('id', sessionId);

			if (updateError) {
				console.error('[ChatSessionService] Failed to update metrics:', updateError);
			}
		} catch (error) {
			console.error('[ChatSessionService] Unexpected error updating metrics:', error);
		}
	}
}
