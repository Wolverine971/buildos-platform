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

export class AgentStreamProtocolError extends Error {
	constructor(message: string) {
		super(`Agent stream protocol violation: ${message}`);
		this.name = 'AgentStreamProtocolError';
	}
}

export class StrictAgentStreamValidator {
	#expectedStreamRunId: string;
	#expectedClientTurnId: string;
	#nextSequenceIndex = 1;
	#seenEventIds = new Set<string>();
	#seenSequenceIndices = new Set<number>();
	#doneSeen = false;

	constructor(expected: { streamRunId: string; clientTurnId: string }) {
		this.#expectedStreamRunId = expected.streamRunId;
		this.#expectedClientTurnId = expected.clientTurnId;
	}

	accept(value: unknown): Record<string, unknown> {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			throw new AgentStreamProtocolError('event payload must be a JSON object');
		}
		const event = value as Record<string, unknown>;
		const type = normalizeString(event.type);
		if (!type) throw new AgentStreamProtocolError('event type is missing');
		if (this.#doneSeen) {
			throw new AgentStreamProtocolError(`received ${type} after terminal done`);
		}

		const streamRunId = normalizeString(event.stream_run_id);
		if (streamRunId !== this.#expectedStreamRunId) {
			throw new AgentStreamProtocolError(
				`stream_run_id mismatch: expected ${this.#expectedStreamRunId}, received ${streamRunId ?? 'missing'}`
			);
		}
		const clientTurnId = normalizeString(event.client_turn_id);
		if (clientTurnId !== this.#expectedClientTurnId) {
			throw new AgentStreamProtocolError(
				`client_turn_id mismatch: expected ${this.#expectedClientTurnId}, received ${clientTurnId ?? 'missing'}`
			);
		}

		const sequenceIndex = event.sequence_index;
		if (
			typeof sequenceIndex !== 'number' ||
			!Number.isInteger(sequenceIndex) ||
			sequenceIndex < 1
		) {
			throw new AgentStreamProtocolError('sequence_index must be a positive integer');
		}
		if (this.#seenSequenceIndices.has(sequenceIndex)) {
			throw new AgentStreamProtocolError(`duplicate sequence_index ${sequenceIndex}`);
		}
		if (sequenceIndex !== this.#nextSequenceIndex) {
			throw new AgentStreamProtocolError(
				`non-contiguous sequence_index: expected ${this.#nextSequenceIndex}, received ${sequenceIndex}`
			);
		}

		const eventId = normalizeString(event.event_id);
		const expectedEventId = `${this.#expectedStreamRunId}:${sequenceIndex}`;
		if (eventId !== expectedEventId) {
			throw new AgentStreamProtocolError(
				`event_id mismatch: expected ${expectedEventId}, received ${eventId ?? 'missing'}`
			);
		}
		if (this.#seenEventIds.has(eventId)) {
			throw new AgentStreamProtocolError(`duplicate event_id ${eventId}`);
		}

		this.#seenSequenceIndices.add(sequenceIndex);
		this.#seenEventIds.add(eventId);
		this.#nextSequenceIndex += 1;
		if (type === 'done') this.#doneSeen = true;
		return event;
	}

	assertComplete(): void {
		if (!this.#doneSeen) {
			throw new AgentStreamProtocolError('stream closed without a terminal done event');
		}
	}
}
