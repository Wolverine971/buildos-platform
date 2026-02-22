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
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { sanitizeLogData } from '$lib/utils/logging-helpers';
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

type FastChatSessionServiceOptions = {
	errorLogger?: ErrorLoggerService;
	endpoint?: string;
	httpMethod?: string;
};

const FASTCHAT_TRACE_SUMMARY_MAX_CHARS = 480;

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
	if (!metadata) return undefined;
	const sanitized = sanitizeLogData(metadata);
	if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
		return sanitized as Record<string, unknown>;
	}
	return { value: sanitized };
}

function truncateText(value: string, maxChars: number): string {
	if (value.length <= maxChars) return value;
	return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function deriveToolTraceSummary(metadata: unknown): string | null {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
	const record = metadata as Record<string, unknown>;
	const explicit = record.fastchat_tool_trace_summary;
	if (typeof explicit === 'string' && explicit.trim().length > 0) {
		return truncateText(explicit.trim(), FASTCHAT_TRACE_SUMMARY_MAX_CHARS);
	}

	const traceRaw = record.fastchat_tool_trace_v1;
	if (!Array.isArray(traceRaw) || traceRaw.length === 0) return null;
	const snippets = traceRaw
		.slice(0, 6)
		.map((entry) => {
			if (!entry || typeof entry !== 'object') return null;
			const toolName =
				typeof (entry as Record<string, unknown>).tool_name === 'string'
					? ((entry as Record<string, unknown>).tool_name as string)
					: null;
			const op =
				typeof (entry as Record<string, unknown>).op === 'string'
					? ((entry as Record<string, unknown>).op as string)
					: null;
			const success = (entry as Record<string, unknown>).success === true;
			const label = op ?? toolName ?? 'tool';
			const error =
				typeof (entry as Record<string, unknown>).error === 'string'
					? ((entry as Record<string, unknown>).error as string)
					: null;
			if (success) return `${label}:ok`;
			return `${label}:err${error ? `(${truncateText(error, 96)})` : ''}`;
		})
		.filter((item): item is string => Boolean(item));

	if (snippets.length === 0) return null;
	return truncateText(`Tool trace: ${snippets.join('; ')}`, FASTCHAT_TRACE_SUMMARY_MAX_CHARS);
}

export function createFastChatSessionService(
	supabase: SupabaseClient<Database>,
	options: FastChatSessionServiceOptions = {}
) {
	const errorLogger = options.errorLogger;
	const endpoint = options.endpoint ?? '/api/agent/v2/stream';
	const httpMethod = options.httpMethod ?? 'POST';

	function logFastChatSessionError(params: {
		error: unknown;
		operationType: string;
		userId?: string;
		projectId?: string;
		tableName?: string;
		recordId?: string;
		metadata?: Record<string, unknown>;
	}): void {
		if (!errorLogger) return;
		void errorLogger.logError(params.error, {
			userId: params.userId,
			projectId: params.projectId,
			endpoint,
			httpMethod,
			operationType: params.operationType,
			tableName: params.tableName,
			recordId: params.recordId,
			metadata: sanitizeMetadata(params.metadata)
		});
	}

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
				logFastChatSessionError({
					error,
					operationType: 'fastchat_session_load',
					userId,
					projectId: projectFocus?.projectId ?? undefined,
					tableName: 'chat_sessions',
					recordId: sessionId,
					metadata: {
						sessionId,
						contextType,
						entityId
					}
				});
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
				} as unknown as typeof updates.agent_metadata;
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
					logFastChatSessionError({
						error,
						operationType: 'fastchat_session_update_context',
						userId,
						projectId: projectFocus?.projectId ?? undefined,
						tableName: 'chat_sessions',
						recordId: session.id,
						metadata: {
							sessionId: session.id,
							contextType,
							entityId,
							updates
						}
					});
				} else if (data) {
					session = data;
				}
			}

			return { session, created: false };
		}

		// Canonical brief session key: one active session per (user, daily_brief_id).
		if (contextType === 'daily_brief' && entityId) {
			const { data, error } = await supabase
				.from('chat_sessions')
				.select('*')
				.eq('user_id', userId)
				.eq('context_type', contextType)
				.eq('entity_id', entityId)
				.eq('status', 'active')
				.order('updated_at', { ascending: false })
				.limit(1)
				.maybeSingle();

			if (error) {
				logger.warn('Failed to resolve canonical daily brief session', {
					error,
					userId,
					entityId
				});
				logFastChatSessionError({
					error,
					operationType: 'fastchat_daily_brief_session_lookup',
					userId,
					tableName: 'chat_sessions',
					metadata: {
						contextType,
						entityId
					}
				});
			} else if (data) {
				return { session: data, created: false };
			}
		}

		const insert: ChatSessionInsert = {
			user_id: userId,
			context_type: contextType,
			entity_id: entityId ?? null,
			status: 'active',
			agent_metadata: projectFocus
				? ({ focus: projectFocus } as unknown as ChatSessionInsert['agent_metadata'])
				: undefined
		};

		const { data, error } = await supabase
			.from('chat_sessions')
			.insert(insert)
			.select('*')
			.single();

		if (error || !data) {
			logger.error('Failed to create chat session', { error, userId });
			logFastChatSessionError({
				error: error ?? new Error('No session returned from insert'),
				operationType: 'fastchat_session_create',
				userId,
				projectId: projectFocus?.projectId ?? undefined,
				tableName: 'chat_sessions',
				metadata: {
					contextType,
					entityId,
					hasProjectFocus: Boolean(projectFocus)
				}
			});
			throw new Error(`Failed to create chat session: ${error?.message ?? 'unknown error'}`);
		}

		return { session: data, created: true };
	}

	async function loadRecentMessages(
		sessionId: string,
		limit = 10
	): Promise<FastChatHistoryMessage[]> {
		const { data, error } = await supabase
			.from('chat_messages')
			.select('role, content, metadata, created_at')
			.eq('session_id', sessionId)
			.order('created_at', { ascending: false })
			.limit(limit);

		if (error || !data) {
			logger.warn('Failed to load chat history', { error, sessionId });
			logFastChatSessionError({
				error: error ?? new Error('No chat history rows returned'),
				operationType: 'fastchat_history_load',
				tableName: 'chat_messages',
				recordId: sessionId,
				metadata: {
					sessionId,
					limit
				}
			});
			return [];
		}

		const allowedRoles = new Set(['user', 'assistant', 'system']);

		return data
			.slice()
			.reverse()
			.filter((msg) => allowedRoles.has(msg.role))
			.map((msg) => ({
				role: msg.role as FastChatHistoryMessage['role'],
				content:
					msg.role === 'assistant'
						? (() => {
								const traceSummary = deriveToolTraceSummary(msg.metadata);
								if (!traceSummary) return msg.content;
								return `${msg.content}\n\n${traceSummary}`;
							})()
						: msg.content
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
			logFastChatSessionError({
				error,
				operationType: 'fastchat_message_persist',
				userId,
				tableName: 'chat_messages',
				recordId: sessionId,
				metadata: {
					sessionId,
					role,
					hasMetadata: Boolean(metadata),
					usage: usage ?? null
				}
			});
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
			logFastChatSessionError({
				error,
				operationType: 'fastchat_session_stats_update',
				userId: session.user_id,
				tableName: 'chat_sessions',
				recordId: session.id,
				metadata: {
					sessionId: session.id,
					messageCountDelta,
					totalTokensDelta,
					contextType,
					entityId
				}
			});
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
		if (error) {
			logger.warn('Failed to update voice note group link, falling back to insert', {
				error,
				groupId,
				userId
			});
			logFastChatSessionError({
				error,
				operationType: 'fastchat_voice_note_attach',
				userId,
				tableName: 'voice_note_groups',
				recordId: groupId,
				metadata: {
					sessionId,
					messageId,
					fallback: 'insert'
				}
			});
		}

		const { error: insertError } = await supabase.from('voice_note_groups').insert({
			id: groupId,
			user_id: userId,
			metadata: { source_component: 'agent_chat_v2' },
			...updatePayload
		});

		if (insertError) {
			logger.warn('Failed to attach voice note group', { insertError, groupId, userId });
			logFastChatSessionError({
				error: insertError,
				operationType: 'fastchat_voice_note_attach',
				userId,
				tableName: 'voice_note_groups',
				recordId: groupId,
				metadata: {
					sessionId,
					messageId,
					insertAttempted: true
				}
			});
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
