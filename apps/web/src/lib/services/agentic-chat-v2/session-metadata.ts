// apps/web/src/lib/services/agentic-chat-v2/session-metadata.ts
import type { Database, Json } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createLogger } from '$lib/utils/logger';
import { sanitizeLogData } from '$lib/utils/logging-helpers';

const logger = createLogger('FastChatSessionMetadata');

type FastChatSupabaseClient = SupabaseClient<Database>;

function isTransientNetworkError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;

	const candidate = error as Record<string, unknown>;
	const details = [candidate.message, candidate.details, candidate.hint, candidate.code]
		.filter((value): value is string => typeof value === 'string')
		.join(' ')
		.toLowerCase();

	return (
		details.includes('fetch failed') ||
		details.includes('econnreset') ||
		details.includes('socket disconnected') ||
		details.includes('network error')
	);
}

export async function updateAgentMetadata(
	supabase: FastChatSupabaseClient,
	sessionId: string,
	patch: Record<string, unknown>,
	options?: {
		errorLogger?: ErrorLoggerService;
		userId?: string;
		projectId?: string;
		endpoint?: string;
		httpMethod?: string;
	}
): Promise<boolean> {
	const errorLogger = options?.errorLogger;
	let { data, error } = await supabase.rpc('merge_chat_session_agent_metadata', {
		p_session_id: sessionId,
		p_patch: patch as Json
	});

	// The merge is idempotent for a given patch, so one retry safely absorbs
	// brief TLS/socket resets without turning them into user-visible failures.
	if (error && isTransientNetworkError(error)) {
		({ data, error } = await supabase.rpc('merge_chat_session_agent_metadata', {
			p_session_id: sessionId,
			p_patch: patch as Json
		}));
	}

	if (error) {
		logger.warn('Failed to merge agent metadata', { error, sessionId });
		if (errorLogger) {
			void errorLogger.logError(error, {
				userId: options?.userId,
				projectId: options?.projectId,
				endpoint: options?.endpoint ?? '/api/agent/v2/stream',
				httpMethod: options?.httpMethod ?? 'POST',
				operationType: 'fastchat_update_agent_metadata',
				tableName: 'chat_sessions',
				recordId: sessionId,
				metadata: {
					stage: 'rpc',
					patch: sanitizeLogData(patch)
				}
			});
		}
		return false;
	}

	if (data === null) {
		logger.warn('No chat session metadata merged', { sessionId });
		return false;
	}
	return true;
}
