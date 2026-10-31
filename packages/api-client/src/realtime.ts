// packages/api-client/src/realtime.ts
/**
 * The agent chat realtime contract, so the app and the web subscribe the same way.
 *
 * The client does not open the socket: the app's own Supabase client does, with the
 * signed-in session, so the private channel authorizes. Mirrors
 * apps/web/src/lib/services/agentic-chat-v2/worker-realtime-channel.ts.
 *
 *   const channel = supabase.channel(chatUserChannelTopic(user.id), CHAT_USER_CHANNEL_CONFIG);
 *   channel.on('broadcast', { event: CHAT_REALTIME_EVENTS.stream }, (message) => {
 *     const event = readBroadcastPayload<AgentStreamEventV1>(message);
 *     if (event) inbox.receive(event);
 *   });
 *
 * The event names are literals here (no runtime import from @buildos/shared-types) but
 * typed against its constants, so a rename there fails this package's typecheck.
 */
import type {
	AGENTIC_CHAT_REALTIME_PREVIEW_EVENT,
	AGENTIC_CHAT_REALTIME_RECONCILE_EVENT,
	AGENTIC_CHAT_REALTIME_STREAM_EVENT
} from '@buildos/shared-types';

export type {
	AgentStreamEventV1,
	AgenticChatLiveTextPreviewV1,
	AgenticChatRealtimeReconcileHintV1
} from '@buildos/shared-types';

/** One private channel per person carries the events of every session they own. */
export function chatUserChannelTopic(userId: string): string {
	return `chat-user:${userId.toLowerCase()}`;
}

/** The second argument of `supabase.channel(topic, …)`; the server rejects other configs. */
export const CHAT_USER_CHANNEL_CONFIG = {
	config: { private: true, broadcast: { self: false } }
} as const;

export const CHAT_REALTIME_EVENTS = {
	/** Durable stream events (`AgentStreamEventV1`): text, tool calls, status, terminal. */
	stream: 'agent-stream-event',
	/** Events were skipped (`AgenticChatRealtimeReconcileHintV1`): call `agent.reconcileTurn`. */
	reconcile: 'agent-stream-reconcile',
	/** Display-only live text (`AgenticChatLiveTextPreviewV1`); never drives state. */
	preview: 'agentic_chat_preview'
} as const satisfies {
	stream: typeof AGENTIC_CHAT_REALTIME_STREAM_EVENT;
	reconcile: typeof AGENTIC_CHAT_REALTIME_RECONCILE_EVENT;
	preview: typeof AGENTIC_CHAT_REALTIME_PREVIEW_EVENT;
};

/** Supabase delivers `{ type: 'broadcast', event, payload }`; the contract object is `payload`. */
export function readBroadcastPayload<T>(message: unknown): T | null {
	if (message === null || typeof message !== 'object' || Array.isArray(message)) return null;
	const payload = (message as { payload?: unknown }).payload;
	return payload === undefined || payload === null ? null : (payload as T);
}
