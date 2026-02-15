// apps/web/src/lib/stores/briefChatSession.store.ts
//
// In-memory store mapping brief_id → session_id for chat session resumption.
// When the user opens chat for a brief, sends messages, and closes the modal,
// the session_id is recorded here so re-opening chat for the same brief can
// pass initialChatSessionId to AgentChatModal and resume the thread immediately.
//
// Resets on page reload — the backend canonicalizes sessions by
// (user_id, 'daily_brief', brief_id) regardless, so persistence is not required.

import { writable, get } from 'svelte/store';

interface BriefChatSessionEntry {
	briefId: string;
	sessionId: string;
	updatedAt: number;
}

const sessionMap = writable<Map<string, BriefChatSessionEntry>>(new Map());

export const briefChatSessionStore = {
	/** Record a session_id for a given brief_id. */
	set(briefId: string, sessionId: string) {
		sessionMap.update((map) => {
			map.set(briefId, { briefId, sessionId, updatedAt: Date.now() });
			return new Map(map);
		});
	},

	/** Get the known session_id for a brief_id, if any. */
	get(briefId: string): string | null {
		const map = get(sessionMap);
		return map.get(briefId)?.sessionId ?? null;
	},

	/** Clear session for a brief_id (e.g. after regeneration produces new brief_id). */
	clear(briefId: string) {
		sessionMap.update((map) => {
			map.delete(briefId);
			return new Map(map);
		});
	},

	/** Clear all stored sessions. */
	clearAll() {
		sessionMap.set(new Map());
	}
};
