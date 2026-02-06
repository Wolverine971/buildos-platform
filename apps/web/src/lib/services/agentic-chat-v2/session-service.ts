// apps/web/src/lib/services/agentic-chat-v2/session-service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	ChatContextType,
	ChatMessage,
	ChatMessageInsert,
	ChatSession,
	ChatSessionInsert,
	ChatSessionUpdate,
	Database
} from '@buildos/shared-types';
import { createLogger } from '$lib/utils/logger';
import type { FastChatHistoryMessage, FastAgentStreamUsage } from './types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';

const logger = createLogger('FastChatSession');

type ResolveSessionParams = {
	sessionId?: string;
	userId: string;
	contextType: ChatContextType;
	entityId?: string;
	projectFocus?: ProjectFocus | null;
};

type PersistMessageParams = {
	sessionId: string;
	userId: string;
	role: ChatMessageInsert['role'];
	content: string;
	metadata?: ChatMessageInsert['metadata'];
	usage?: FastAgentStreamUsage;
};

type UpdateSessionStatsParams = {
	session: ChatSession;
	messageCountDelta: number;
	totalTokensDelta?: number;
	contextType?: ChatContextType;
	entityId?: string | null;
};

type AttachVoiceNoteParams = {
	groupId: string;
	userId: string;
	sessionId: string;
	messageId: string;
};

export function createFastChatSessionService(supabase: SupabaseClient<Database>) {
	async function resolveSession(params: ResolveSessionParams): Promise<{
		session: ChatSession;
		created: boolean;
	}> {
		const { sessionId, userId, contextType, entityId, projectFocus } = params;
		let session: ChatSession | null = null;

		if (sessionId) {
			const { data, error } = await supabase
				.from('chat_sessions')
				.select('*')
				.eq('id', sessionId)
				.eq('user_id', userId)
				.maybeSingle();

			if (error) {
				logger.warn('Failed to load chat session', { error, sessionId, userId });
			} else if (data) {
				session = data;
			}
		}

		if (session) {
			const updates: ChatSessionUpdate = {};
			if (contextType && session.context_type !== contextType) {
				updates.context_type = contextType;
			}
			if (entityId !== undefined && session.entity_id !== entityId) {
				updates.entity_id = entityId ?? null;
			}
			if (projectFocus) {
				const currentMeta = (session.agent_metadata ?? {}) as Record<string, unknown>;
				updates.agent_metadata = {
					...currentMeta,
					focus: projectFocus
				} as typeof updates.agent_metadata;
			}

			if (Object.keys(updates).length > 0) {
				const { data, error } = await supabase
					.from('chat_sessions')
					.update({ ...updates, updated_at: new Date().toISOString() })
					.eq('id', session.id)
					.select('*')
					.maybeSingle();

				if (error) {
					logger.warn('Failed to update chat session context', { error, sessionId });
				} else if (data) {
					session = data;
				}
			}

			return { session, created: false };
		}

		const insert: ChatSessionInsert = {
			user_id: userId,
			context_type: contextType,
			entity_id: entityId ?? null,
			status: 'active',
			agent_metadata: projectFocus
				? ({ focus: projectFocus } as ChatSessionInsert['agent_metadata'])
				: undefined
		};

		const { data, error } = await supabase
			.from('chat_sessions')
			.insert(insert)
			.select('*')
			.single();

		if (error || !data) {
			logger.error('Failed to create chat session', { error, userId });
			throw new Error('Failed to create chat session');
		}

		return { session: data, created: true };
	}

	async function loadRecentMessages(
		sessionId: string,
		limit = 10
	): Promise<FastChatHistoryMessage[]> {
		const { data, error } = await supabase
			.from('chat_messages')
			.select('role, content, created_at')
			.eq('session_id', sessionId)
			.order('created_at', { ascending: false })
			.limit(limit);

		if (error || !data) {
			logger.warn('Failed to load chat history', { error, sessionId });
			return [];
		}

		const allowedRoles = new Set(['user', 'assistant', 'system']);

		return data
			.slice()
			.reverse()
			.filter((msg) => allowedRoles.has(msg.role))
			.map((msg) => ({
				role: msg.role as FastChatHistoryMessage['role'],
				content: msg.content
			}));
	}

	async function persistMessage(params: PersistMessageParams): Promise<ChatMessage | null> {
		const { sessionId, userId, role, content, metadata, usage } = params;
		const insert: ChatMessageInsert = {
			session_id: sessionId,
			user_id: userId,
			role,
			content,
			metadata: metadata ?? null,
			prompt_tokens: usage?.prompt_tokens ?? null,
			completion_tokens: usage?.completion_tokens ?? null,
			total_tokens: usage?.total_tokens ?? null
		};

		const { data, error } = await supabase
			.from('chat_messages')
			.insert(insert)
			.select('*')
			.single();

		if (error) {
			logger.warn('Failed to persist chat message', { error, sessionId, role });
			return null;
		}

		return data;
	}

	async function updateSessionStats(params: UpdateSessionStatsParams): Promise<ChatSession> {
		const { session, messageCountDelta, totalTokensDelta, contextType, entityId } = params;
		const now = new Date().toISOString();
		const updates: ChatSessionUpdate = {
			updated_at: now,
			last_message_at: now,
			message_count: (session.message_count ?? 0) + messageCountDelta
		};

		if (typeof totalTokensDelta === 'number') {
			updates.total_tokens_used = (session.total_tokens_used ?? 0) + totalTokensDelta;
		}

		if (contextType && session.context_type !== contextType) {
			updates.context_type = contextType;
		}
		if (entityId !== undefined && session.entity_id !== entityId) {
			updates.entity_id = entityId ?? null;
		}

		const { data, error } = await supabase
			.from('chat_sessions')
			.update(updates)
			.eq('id', session.id)
			.select('*')
			.maybeSingle();

		if (error) {
			logger.warn('Failed to update session stats', { error, sessionId: session.id });
			return session;
		}

		return data ?? session;
	}

	async function attachVoiceNoteGroup(params: AttachVoiceNoteParams): Promise<void> {
		const { groupId, userId, sessionId, messageId } = params;
		if (!groupId) return;

		const updatePayload = {
			linked_entity_type: 'chat_message',
			linked_entity_id: messageId,
			chat_session_id: sessionId,
			status: 'attached'
		};

		const { data, error } = await supabase
			.from('voice_note_groups')
			.update(updatePayload)
			.eq('id', groupId)
			.eq('user_id', userId)
			.select('id');

		if (!error && data && data.length > 0) return;

		const { error: insertError } = await supabase.from('voice_note_groups').insert({
			id: groupId,
			user_id: userId,
			metadata: { source_component: 'agent_chat_v2' },
			...updatePayload
		});

		if (insertError) {
			logger.warn('Failed to attach voice note group', { insertError, groupId, userId });
		}
	}

	return {
		resolveSession,
		loadRecentMessages,
		persistMessage,
		updateSessionStats,
		attachVoiceNoteGroup
	};
}
