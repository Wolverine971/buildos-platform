// apps/web/src/lib/services/agentic-chat-v2/last-turn-context.server.ts
//
// The worker commits each turn's continuity packet as a durable
// `last_turn_context` event (finalize_agentic_chat_turn_with_terminal_events).
// The server reads the latest one for the session instead of trusting a copy the
// browser carried back: requests stay small, a reopened chat keeps its
// continuity, and the packet can no longer block a user's message.
//
// Turn events follow chat retention (7 days after the turn ends), so a session
// idle longer than that simply has no continuity hint.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, LastTurnContext } from '@buildos/shared-types';
import { boundLastTurnContext } from './last-turn-context';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('AgenticChat:LastTurnContext');

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The latest committed continuity packet for this user's session, or null.
 * Optional recall: a failed read logs and returns null, never blocks the turn.
 * Packets written before the per-kind cap are bounded on the way out.
 */
export async function loadSessionLastTurnContext(params: {
	client: SupabaseClient<Database>;
	userId: string;
	sessionId: string;
}): Promise<LastTurnContext | null> {
	try {
		const { data, error } = await params.client
			.from('chat_turn_events')
			.select('payload')
			.eq('session_id', params.sessionId)
			.eq('user_id', params.userId)
			.eq('event_type', 'last_turn_context')
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle();
		if (error) {
			logger.warn('Last-turn context read failed; continuing without it', {
				sessionId: params.sessionId,
				error: error.message
			});
			return null;
		}
		const context = isRecord(data?.payload) ? data.payload.context : null;
		if (!isRecord(context)) return null;
		return boundLastTurnContext(context) as LastTurnContext | null;
	} catch (error) {
		logger.warn('Last-turn context read threw; continuing without it', {
			sessionId: params.sessionId,
			error: error instanceof Error ? error.message : String(error)
		});
		return null;
	}
}
