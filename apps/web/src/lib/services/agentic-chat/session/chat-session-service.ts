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
import { createLogger } from '$lib/utils/logger';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { sanitizeLogData } from '$lib/utils/logging-helpers';

const logger = createLogger('ChatSessionService');

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
	private errorLogger: ErrorLoggerService;

	constructor(private supabase: SupabaseClient<Database>) {
		this.errorLogger = ErrorLoggerService.getInstance(supabase);
	}

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
			logger.error(error as Error, {
				operation: 'fetch_session',
				sessionId
			});
			void this.errorLogger.logError(error, {
				userId,
				operationType: 'chat_session_fetch',
				metadata: { sessionId }
			});
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
			logger.error(error as Error, {
				operation: 'create_session',
				contextType: params.contextType
			});
			void this.errorLogger.logError(error, {
				userId: params.userId,
				operationType: 'chat_session_create',
				metadata: {
					contextType: params.contextType,
					entityId: params.entityId
				}
			});
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
			logger.error(error as Error, {
				operation: 'update_session',
				sessionId
			});
			void this.errorLogger.logError(error, {
				operationType: 'chat_session_update',
				metadata: {
					sessionId,
					updates: sanitizeLogData(updates)
				}
			});
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
			logger.error(error as Error, {
				operation: 'load_messages',
				sessionId
			});
			void this.errorLogger.logError(error, {
				operationType: 'chat_messages_load',
				metadata: { sessionId, limit }
			});
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
				logger.error(error as Error, {
					operation: 'persist_message',
					sessionId: message.session_id,
					role: message.role
				});
				void this.errorLogger.logError(error, {
					userId: (message as any).user_id,
					operationType: 'chat_message_persist',
					tableName: 'chat_messages',
					recordId: message.session_id,
					metadata: {
						sessionId: message.session_id,
						role: message.role,
						messageType: (message as any).message_type ?? null
					}
				});
			}
		} catch (error) {
			// Log but don't throw to avoid breaking the stream
			logger.error(error as Error, {
				operation: 'persist_message_unexpected',
				sessionId: message.session_id,
				role: message.role
			});
			void this.errorLogger.logError(error, {
				userId: (message as any).user_id,
				operationType: 'chat_message_persist',
				tableName: 'chat_messages',
				recordId: message.session_id,
				metadata: {
					sessionId: message.session_id,
					role: message.role,
					messageType: (message as any).message_type ?? null
				}
			});
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
				logger.error(error as Error, {
					operation: 'persist_messages_batch',
					messageCount: messages.length
				});
				void this.errorLogger.logError(error, {
					operationType: 'chat_messages_persist_batch',
					tableName: 'chat_messages',
					metadata: {
						messageCount: messages.length
					}
				});
			}
		} catch (error) {
			logger.error(error as Error, {
				operation: 'persist_messages_batch_unexpected',
				messageCount: messages.length
			});
			void this.errorLogger.logError(error, {
				operationType: 'chat_messages_persist_batch',
				tableName: 'chat_messages',
				metadata: {
					messageCount: messages.length
				}
			});
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
			logger.warn('Session not found, creating new session', { sessionId });
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
			logger.error(error as Error, {
				operation: 'get_active_sessions',
				userId
			});
			void this.errorLogger.logError(error, {
				userId,
				operationType: 'chat_sessions_list',
				metadata: { limit }
			});
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
			logger.error(error as Error, {
				operation: 'get_session_with_messages',
				sessionId
			});
			void this.errorLogger.logError(error, {
				userId,
				operationType: 'chat_session_with_messages',
				metadata: { sessionId }
			});
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
			calendar: 'Calendar Assistant',
			daily_brief: 'Brief Chat',
			general: 'General Assistant',
			project_create: 'New Project Creation',
			project_audit: 'Project Audit',
			project_forecast: 'Project Forecast',
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
		const messageIncrement = metrics.incrementMessages ?? 0;
		const tokenIncrement = metrics.incrementTokens ?? 0;
		const toolIncrement = metrics.incrementToolCalls ?? 0;

		try {
			if (messageIncrement === 0 && tokenIncrement === 0 && toolIncrement === 0) {
				return;
			}

			const { error } = await this.supabase.rpc('increment_chat_session_metrics', {
				p_session_id: sessionId,
				p_message_increment: messageIncrement,
				p_token_increment: tokenIncrement,
				p_tool_increment: toolIncrement
			});

			if (error) {
				logger.error(error as Error, {
					operation: 'increment_metrics',
					sessionId
				});
				void this.errorLogger.logError(error, {
					operationType: 'chat_session_metrics',
					metadata: {
						sessionId,
						messageIncrement,
						tokenIncrement,
						toolIncrement
					}
				});
			}
		} catch (error) {
			logger.error(error as Error, {
				operation: 'increment_metrics_unexpected',
				sessionId
			});
			void this.errorLogger.logError(error, {
				operationType: 'chat_session_metrics',
				metadata: {
					sessionId,
					messageIncrement,
					tokenIncrement,
					toolIncrement
				}
			});
		}
	}
}
