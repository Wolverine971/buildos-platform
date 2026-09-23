// apps/web/src/lib/services/agentic-chat-v2/stream-protocol.ts
import type { AgentSSEMessage } from '@buildos/shared-types';

export type AgentStreamGuardReason =
	| 'accepted'
	| 'stale_stream'
	| 'stale_client_turn'
	| 'duplicate_event';

export type AgentStreamGuardResult = {
	accepted: boolean;
	reason: AgentStreamGuardReason;
	eventKey: string | null;
	eventStreamRunId: string | null;
	eventClientTurnId: string | null;
};

function normalizeString(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeSequenceIndex(value: unknown): number | null {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function buildEventKey(
	event: Record<string, unknown>,
	expectedStreamRunId: string | null
): string | null {
	const eventId = normalizeString(event.event_id);
	if (eventId) return `event:${eventId}`;
	const sequenceIndex = normalizeSequenceIndex(event.sequence_index);
	if (sequenceIndex === null) return null;
	const streamRunId = normalizeString(event.stream_run_id) ?? expectedStreamRunId;
	return streamRunId ? `sequence:${streamRunId}:${sequenceIndex}` : null;
}

/**
 * Lenient product guard: missing envelope metadata remains compatible, but
 * stale identities and duplicate envelopes are rejected consistently.
 */
export class AgentStreamEventGuard {
	#seenEventKeys = new Set<string>();

	reset(): void {
		this.#seenEventKeys.clear();
	}

	inspect(
		event: AgentSSEMessage | Record<string, unknown>,
		expected: {
			streamRunId: string | null;
			clientTurnId: string | null;
		}
	): AgentStreamGuardResult {
		const metadata = event as Record<string, unknown>;
		const eventStreamRunId = normalizeString(metadata.stream_run_id);
		const eventClientTurnId = normalizeString(metadata.client_turn_id);
		const eventKey = buildEventKey(metadata, expected.streamRunId);

		if (eventStreamRunId && eventStreamRunId !== expected.streamRunId) {
			return {
				accepted: false,
				reason: 'stale_stream',
				eventKey,
				eventStreamRunId,
				eventClientTurnId
			};
		}
		if (eventClientTurnId && eventClientTurnId !== expected.clientTurnId) {
			return {
				accepted: false,
				reason: 'stale_client_turn',
				eventKey,
				eventStreamRunId,
				eventClientTurnId
			};
		}
		if (eventKey && this.#seenEventKeys.has(eventKey)) {
			return {
				accepted: false,
				reason: 'duplicate_event',
				eventKey,
				eventStreamRunId,
				eventClientTurnId
			};
		}
		if (eventKey) this.#seenEventKeys.add(eventKey);
		return {
			accepted: true,
			reason: 'accepted',
			eventKey,
			eventStreamRunId,
			eventClientTurnId
		};
	}
}
