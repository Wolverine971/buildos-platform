// apps/web/src/routes/api/agent/v2/turns/turn-source.ts
//
// Scripted traffic (agentic e2e harness, book loop, prod battery) marks its turn
// admissions so prod metrics can exclude it. A header keeps the strict request
// schema unchanged. Telemetry only: the value never changes how a turn runs.
// Dependency-free so the Playwright spec can import it.

export const AGENTIC_CHAT_TURN_SOURCE_HEADER = 'x-buildos-turn-source';

export type AgenticChatTurnSource = 'live_ui' | 'harness';

/** Exact-match read of the marker; anything else is a live UI turn. */
export function readAgenticChatTurnSource(headers: Headers): AgenticChatTurnSource {
	return headers.get(AGENTIC_CHAT_TURN_SOURCE_HEADER)?.trim() === 'harness'
		? 'harness'
		: 'live_ui';
}
