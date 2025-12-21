// apps/web/src/routes/api/agent/stream/services/message-persister.ts
/**
 * Message Persister Service for /api/agent/stream endpoint.
 *
 * Handles chat message persistence operations.
 * Extracts message saving logic from the main endpoint file.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	Database,
	ChatMessageInsert,
	ChatContextType,
	ChatToolCall
} from '@buildos/shared-types';
import { createLogger } from '$lib/utils/logger';
import type { ToolResultData } from '../types';

const logger = createLogger('MessagePersister');

// ============================================
// MESSAGE PERSISTER CLASS
// ============================================

/**
 * Handles chat message persistence.
 */
export class MessagePersister {
	constructor(private supabase: SupabaseClient<Database>) {}

	/**
	 * Persist a user message.
	 *
	 * @param params - User message parameters
	 */
	async persistUserMessage(params: {
		sessionId: string;
		userId: string;
		content: string;
		timestamp?: string;
	}): Promise<void> {
		const messageData: ChatMessageInsert = {
			session_id: params.sessionId,
			user_id: params.userId,
			role: 'user',
			content: params.content,
			created_at: params.timestamp ?? new Date().toISOString()
		};

		await this.persistMessage(messageData);
	}

	/**
	 * Persist an assistant message with optional tool calls.
	 *
	 * @param params - Assistant message parameters
	 */
	async persistAssistantMessage(params: {
		sessionId: string;
		userId: string;
		content: string;
		toolCalls?: ChatToolCall[];
		timestamp?: string;
		messageType?: string | null;
		metadata?: Record<string, unknown>;
	}): Promise<void> {
		// Use type assertion on entire object to handle Json type compatibility
		const messageData = {
			session_id: params.sessionId,
			user_id: params.userId,
			role: 'assistant',
			content: params.content || '', // Can be empty if only tool calls
			tool_calls:
				params.toolCalls && params.toolCalls.length > 0 ? params.toolCalls : undefined,
			created_at: params.timestamp ?? new Date().toISOString(),
			message_type: params.messageType ?? null,
			metadata: (params.metadata ??
				null) as Database['public']['Tables']['chat_messages']['Insert']['metadata']
		} as ChatMessageInsert;

		await this.persistMessage(messageData);
	}

	/**
	 * Persist tool result messages.
	 * Creates a separate message for each tool result.
	 *
	 * @param params - Tool results parameters
	 */
	async persistToolResults(params: {
		sessionId: string;
		userId: string;
		toolCalls: ChatToolCall[];
		toolResults: ToolResultData[];
		messageType?: string | null;
		metadata?: Record<string, unknown>;
	}): Promise<void> {
		for (const toolCall of params.toolCalls) {
			// Match result by tool_call_id
			const result = params.toolResults.find((r) => r.tool_call_id === toolCall.id);

			if (result) {
				const normalizedResult = result.result;
				const toolName =
					toolCall.function?.name ??
					(result.tool_name as string | undefined) ??
					(toolCall as any)?.name ??
					null;

				const toolResultMessage: ChatMessageInsert = {
					session_id: params.sessionId,
					user_id: params.userId,
					role: 'tool',
					content: JSON.stringify(normalizedResult),
					tool_call_id: toolCall.id,
					tool_name: toolName,
					tool_result:
						normalizedResult as Database['public']['Tables']['chat_messages']['Insert']['tool_result'],
					created_at: new Date().toISOString(),
					message_type: params.messageType ?? null,
					metadata: (params.metadata ??
						null) as Database['public']['Tables']['chat_messages']['Insert']['metadata']
				};

				await this.persistMessage(toolResultMessage);
			} else {
				logger.warn('No result found for tool call', {
					toolCallId: toolCall.id,
					toolName: toolCall.function?.name
				});
			}
		}
	}

	/**
	 * Persist a context shift system message.
	 *
	 * @param params - Context shift parameters
	 */
	async persistContextShiftMessage(params: {
		sessionId: string;
		userId: string;
		newContextType: ChatContextType;
		entityId?: string;
		entityName?: string;
	}): Promise<void> {
		const content = `Context shifted to ${params.newContextType} for "${params.entityName ?? 'entity'}" (ID: ${params.entityId ?? 'unknown'})`;

		const messageData: ChatMessageInsert = {
			session_id: params.sessionId,
			user_id: params.userId,
			role: 'system',
			content,
			created_at: new Date().toISOString()
		};

		await this.persistMessage(messageData);
	}

	/**
	 * Internal method to persist any message.
	 *
	 * @param message - The message to persist
	 */
	private async persistMessage(message: ChatMessageInsert): Promise<void> {
		const { error } = await this.supabase.from('chat_messages').insert(message);

		if (error) {
			logger.error('Failed to save chat message', {
				error,
				sessionId: message.session_id,
				role: message.role,
				hasToolCalls: !!(message as any).tool_calls
			});
		}
	}
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create a MessagePersister instance.
 *
 * @param supabase - Supabase client
 * @returns MessagePersister instance
 */
export function createMessagePersister(supabase: SupabaseClient<Database>): MessagePersister {
	return new MessagePersister(supabase);
}
