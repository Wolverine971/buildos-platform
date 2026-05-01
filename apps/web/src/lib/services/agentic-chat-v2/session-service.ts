// apps/web/src/lib/services/agentic-chat-v2/session-service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	ChatContextType,
	ChatMessage,
	ChatMessageInsert,
	ChatSession,
	ChatSessionInsert,
	ChatSessionUpdate,
	Database,
	Json
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
	idempotencyKey?: string;
};

type UpdateSessionContextParams = {
	session: ChatSession;
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

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
	if (!metadata) return undefined;
	const sanitized = sanitizeLogData(metadata);
	if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
		return sanitized as Record<string, unknown>;
	}
	return { value: sanitized };
}

type RecentChatMessageRow = Pick<
	ChatMessage,
	'id' | 'role' | 'content' | 'metadata' | 'created_at'
>;

export type InterruptedToolExecutionSummaryRow = {
	message_id: string | null;
	tool_name: string;
	gateway_op: string | null;
	sequence_index: number | null;
	success: boolean;
	error_message: string | null;
	arguments: Json;
	result: Json | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isInterruptedAssistantMessage(message: RecentChatMessageRow): boolean {
	if (message.role !== 'assistant' || !isRecord(message.metadata)) return false;
	const metadata = message.metadata;
	return (
		metadata.interrupted === true ||
		metadata.finished_reason === 'cancelled' ||
		typeof metadata.interrupted_reason === 'string'
	);
}

function previewText(value: unknown, maxLength: number): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function stringifyPreview(value: unknown, maxLength: number): string | null {
	const text = typeof value === 'string' ? value : JSON.stringify(value);
	return previewText(text, maxLength);
}

function summarizeStructuredData(value: unknown): string | null {
	if (!Array.isArray(value) || value.length === 0) return null;
	const summaries = value.slice(0, 6).map((item) => {
		if (!isRecord(item)) return null;
		const type = Array.isArray(item.type)
			? item.type.join('/')
			: typeof item.type === 'string'
				? item.type
				: undefined;
		const name = typeof item.name === 'string' ? item.name : undefined;
		const startDate = typeof item.startDate === 'string' ? item.startDate : undefined;
		const status = typeof item.eventStatus === 'string' ? item.eventStatus : undefined;
		const offers = Array.isArray(item.offers) ? item.offers : item.offers ? [item.offers] : [];
		const availability = offers
			.map((offer) =>
				isRecord(offer) && typeof offer.availability === 'string'
					? offer.availability
					: null
			)
			.find(Boolean);
		const parts = [type, name, startDate, status, availability].filter(Boolean);
		return parts.length > 0 ? parts.join(' | ') : null;
	});
	const compact = summaries.filter((item): item is string => Boolean(item));
	return compact.length > 0 ? compact.join('; ') : null;
}

function summarizeWebVisitResult(result: Record<string, unknown>): string {
	const title = previewText(result.title, 160);
	const finalUrl = previewText(result.final_url ?? result.url, 220);
	const statusCode = typeof result.status_code === 'number' ? result.status_code : undefined;
	const structured = summarizeStructuredData(result.structured_data);
	const content = previewText(result.content, 900) ?? previewText(result.excerpt, 500);
	const parts = [
		title ? `title="${title}"` : null,
		finalUrl ? `url=${finalUrl}` : null,
		statusCode ? `status=${statusCode}` : null,
		structured ? `structured_data=${structured}` : null,
		content ? `content="${content}"` : null
	].filter(Boolean);
	return parts.join('; ');
}

function summarizeWebSearchResult(result: Record<string, unknown>): string {
	const query = previewText(result.query, 180);
	const results = Array.isArray(result.results) ? result.results : [];
	const resultTitles = results
		.slice(0, 5)
		.map((entry) =>
			isRecord(entry)
				? previewText(entry.title ?? entry.url ?? entry.content, 180)
				: previewText(entry, 180)
		)
		.filter((entry): entry is string => Boolean(entry));
	const parts = [query ? `query="${query}"` : null];
	if (resultTitles.length > 0) {
		parts.push(`results=${resultTitles.join(' | ')}`);
	}
	return parts.filter(Boolean).join('; ');
}

function summarizeInterruptedToolResult(row: InterruptedToolExecutionSummaryRow): string | null {
	if (!row.success || !row.result) return null;
	const op = row.gateway_op ?? row.tool_name;
	if (isRecord(row.result)) {
		if (row.tool_name === 'web_visit' || op === 'util.web.visit') {
			return summarizeWebVisitResult(row.result);
		}
		if (row.tool_name === 'web_search' || op === 'util.web.search') {
			return summarizeWebSearchResult(row.result);
		}
		const message = previewText(row.result.message, 280);
		if (message) return message;
	}
	return stringifyPreview(row.result, 700);
}

export function buildInterruptedToolHistorySummary(
	executions: InterruptedToolExecutionSummaryRow[]
): string | null {
	if (!Array.isArray(executions) || executions.length === 0) return null;
	const sorted = executions
		.slice()
		.sort((a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0));
	const completed = sorted
		.map((row) => {
			const summary = summarizeInterruptedToolResult(row);
			if (!summary) return null;
			const op = row.gateway_op ?? row.tool_name;
			return `- ${op}: ${summary}`;
		})
		.filter((line): line is string => Boolean(line))
		.slice(0, 6);
	const failures = sorted
		.filter((row) => !row.success && row.error_message)
		.map((row) => {
			const op = row.gateway_op ?? row.tool_name;
			const error = previewText(row.error_message, 140);
			return error ? `${op}: ${error}` : null;
		})
		.filter((line): line is string => Boolean(line))
		.slice(0, 4);

	if (completed.length === 0 && failures.length === 0) return null;

	const lines = ['Previous interrupted assistant turn tool results:'];
	if (completed.length > 0) {
		lines.push(...completed);
	}
	if (failures.length > 0) {
		lines.push(`Interrupted or failed calls: ${failures.join('; ')}`);
	}
	return previewText(lines.join('\n'), 3000);
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
			.select('id, role, content, metadata, created_at')
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
		const orderedMessages = data
			.slice()
			.reverse()
			.filter((msg): msg is RecentChatMessageRow => allowedRoles.has(msg.role));
		const interruptedMessageIds = orderedMessages
			.filter(isInterruptedAssistantMessage)
			.map((msg) => msg.id)
			.filter((id): id is string => Boolean(id));
		const executionsByMessageId = new Map<string, InterruptedToolExecutionSummaryRow[]>();

		if (interruptedMessageIds.length > 0) {
			const { data: executionRows, error: executionError } = await supabase
				.from('chat_tool_executions')
				.select(
					'message_id, tool_name, gateway_op, sequence_index, success, error_message, arguments, result'
				)
				.in('message_id', interruptedMessageIds)
				.order('sequence_index', { ascending: true });

			if (executionError) {
				logger.warn('Failed to load interrupted chat tool history', {
					error: executionError,
					sessionId
				});
				logFastChatSessionError({
					error: executionError,
					operationType: 'fastchat_interrupted_tool_history_load',
					tableName: 'chat_tool_executions',
					recordId: sessionId,
					metadata: {
						sessionId,
						messageIds: interruptedMessageIds,
						limit
					}
				});
			} else {
				for (const row of executionRows ?? []) {
					if (!row.message_id) continue;
					const existing = executionsByMessageId.get(row.message_id) ?? [];
					existing.push(row as InterruptedToolExecutionSummaryRow);
					executionsByMessageId.set(row.message_id, existing);
				}
			}
		}

		return orderedMessages.flatMap((msg) => {
			const historyMessages: FastChatHistoryMessage[] = [
				{
					role: msg.role as FastChatHistoryMessage['role'],
					content: msg.content
				}
			];
			if (isInterruptedAssistantMessage(msg)) {
				const summary = buildInterruptedToolHistorySummary(
					executionsByMessageId.get(msg.id) ?? []
				);
				if (summary) {
					historyMessages.push({
						role: 'system',
						content: summary
					});
				}
			}
			return historyMessages;
		});
	}

	async function persistMessage(params: PersistMessageParams): Promise<ChatMessage | null> {
		const { sessionId, userId, role, content, metadata, usage, idempotencyKey } = params;
		const metadataRecord =
			metadata && typeof metadata === 'object' && !Array.isArray(metadata)
				? ({ ...(metadata as Record<string, Json | undefined>) } as Record<
						string,
						Json | undefined
					>)
				: {};
		if (idempotencyKey) {
			metadataRecord.idempotency_key = idempotencyKey;
		}

		if (idempotencyKey) {
			const { data: existing, error: existingError } = await supabase
				.from('chat_messages')
				.select('*')
				.eq('session_id', sessionId)
				.eq('user_id', userId)
				.eq('role', role)
				.contains('metadata', { idempotency_key: idempotencyKey })
				.order('created_at', { ascending: false })
				.limit(1)
				.maybeSingle();

			if (existingError) {
				logger.warn('Failed to load idempotent chat message', {
					error: existingError,
					sessionId,
					role
				});
				logFastChatSessionError({
					error: existingError,
					operationType: 'fastchat_message_idempotency_lookup',
					userId,
					tableName: 'chat_messages',
					recordId: sessionId,
					metadata: {
						sessionId,
						role,
						idempotencyKey
					}
				});
			} else if (existing) {
				return existing;
			}
		}

		const insert: ChatMessageInsert = {
			session_id: sessionId,
			user_id: userId,
			role,
			content,
			metadata: Object.keys(metadataRecord).length > 0 ? metadataRecord : null,
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

	async function updateSessionContext(params: UpdateSessionContextParams): Promise<ChatSession> {
		const { session, contextType, entityId } = params;
		const updates: ChatSessionUpdate = {};
		if (contextType && session.context_type !== contextType) {
			updates.context_type = contextType;
		}
		if (entityId !== undefined && session.entity_id !== entityId) {
			updates.entity_id = entityId ?? null;
		}
		if (Object.keys(updates).length === 0) {
			return session;
		}

		const { data, error } = await supabase
			.from('chat_sessions')
			.update({ ...updates, updated_at: new Date().toISOString() })
			.eq('id', session.id)
			.select('*')
			.maybeSingle();

		if (error) {
			logger.warn('Failed to update session context', { error, sessionId: session.id });
			logFastChatSessionError({
				error,
				operationType: 'fastchat_session_update_context',
				userId: session.user_id,
				tableName: 'chat_sessions',
				recordId: session.id,
				metadata: {
					sessionId: session.id,
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
		updateSessionContext,
		attachVoiceNoteGroup
	};
}
