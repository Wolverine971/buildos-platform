// packages/agentic-chat-runtime/src/parity.ts
import type {
	AgentSSEMessage,
	AgentStreamEventPhase,
	AgentStreamEventV1,
	JsonObject,
	JsonValue
} from '@buildos/shared-types';

const TRANSPORT_EVENT_KEYS = new Set([
	'client_turn_id',
	'contract_version',
	'durable',
	'event_id',
	'event_type',
	'execution_generation',
	'phase',
	'sequence_index',
	'session_id',
	'stream_run_id',
	'turn_run_id'
]);

const EVENT_PHASES = new Set<AgentStreamEventPhase>([
	'prompt',
	'llm',
	'tool',
	'stream',
	'finalize'
]);

export type AgenticChatParitySourceEventV1 = AgentSSEMessage | AgentStreamEventV1<AgentSSEMessage>;

export type AgenticChatParityEventV1 = {
	/** `text` and `text_delta` both normalize to this semantic event type. */
	type: string;
	phase: AgentStreamEventPhase | null;
	payload: JsonObject;
};

export type AgenticChatParityRunInputV1 = {
	events: readonly AgenticChatParitySourceEventV1[];
	messages: readonly JsonObject[];
	toolExecutions: readonly JsonObject[];
	checkpoints: readonly JsonObject[];
	outcome: JsonObject;
	metadata: JsonObject;
};

export type AgenticChatParityRunV1 = {
	events: readonly AgenticChatParityEventV1[];
	messages: readonly JsonObject[];
	toolExecutions: readonly JsonObject[];
	checkpoints: readonly JsonObject[];
	outcome: JsonObject;
	metadata: JsonObject;
};

/**
 * Produce the deterministic comparison surface used by Phase 4 fixtures.
 *
 * The projection removes only transport ownership fields and coalesces
 * adjacent assistant text chunks. Semantic payloads, phases, collection order,
 * and every persistence snapshot remain exact. Deterministic fixtures must
 * therefore control clocks and identifiers inside their product payloads
 * instead of adding broad ignore lists that could conceal a parity regression.
 */
export function normalizeAgenticChatParityRunV1(
	input: AgenticChatParityRunInputV1
): AgenticChatParityRunV1 {
	return {
		events: normalizeAgenticChatParityEventsV1(input.events),
		messages: input.messages.map((message) => canonicalJsonObject(message)),
		toolExecutions: input.toolExecutions.map((execution) => canonicalJsonObject(execution)),
		checkpoints: input.checkpoints.map((checkpoint) => canonicalJsonObject(checkpoint)),
		outcome: canonicalJsonObject(input.outcome),
		metadata: canonicalJsonObject(input.metadata)
	};
}

export function normalizeAgenticChatParityEventsV1(
	events: readonly AgenticChatParitySourceEventV1[]
): readonly AgenticChatParityEventV1[] {
	const usesSequences = events.some((event) => event.sequence_index !== undefined);
	let lastSequence = 0;
	let executionGeneration: number | null | undefined;
	const normalized: AgenticChatParityEventV1[] = [];

	for (const event of events) {
		const runtimeType = (event as unknown as Record<string, unknown>).type;
		if (
			runtimeType === 'phase_update' &&
			typeof (event as unknown as Record<string, unknown>).session_phase !== 'string'
		) {
			throw new Error(
				'Agentic Chat phase_update requires session_phase separate from envelope phase'
			);
		}
		const eventExecutionGeneration = executionGenerationOf(event);
		validateEnvelope(
			event,
			usesSequences,
			lastSequence,
			executionGeneration,
			eventExecutionGeneration
		);
		if (usesSequences) lastSequence = event.sequence_index!;
		if (eventExecutionGeneration !== undefined) {
			executionGeneration = eventExecutionGeneration;
		}

		const phase = normalizePhase(event.phase);
		const record = event as unknown as Record<string, unknown>;
		const payload = Object.fromEntries(
			Object.entries(record).filter(
				([key]) => key !== 'type' && !TRANSPORT_EVENT_KEYS.has(key)
			)
		);

		if (runtimeType === 'text' || runtimeType === 'text_delta') {
			const content = record.content;
			if (typeof content !== 'string') {
				throw new Error('Agentic Chat parity assistant text must be a string');
			}
			const previous = normalized.at(-1);
			if (previous?.type === 'assistant_text' && previous.phase === phase) {
				const previousContent = previous.payload.content;
				if (typeof previousContent !== 'string') {
					throw new Error('Agentic Chat parity assistant text projection is invalid');
				}
				previous.payload = canonicalJsonObject({
					content: `${previousContent}${content}`
				});
			} else {
				normalized.push({
					type: 'assistant_text',
					phase,
					payload: canonicalJsonObject({ content })
				});
			}
			continue;
		}

		normalized.push({
			type: event.type,
			phase,
			payload: canonicalJsonObject(payload)
		});
	}

	return normalized;
}

function validateEnvelope(
	event: AgenticChatParitySourceEventV1,
	usesSequences: boolean,
	lastSequence: number,
	executionGeneration: number | null | undefined,
	eventExecutionGeneration: number | undefined
): void {
	if (typeof event.type !== 'string' || !event.type || event.type !== event.type.trim()) {
		throw new Error('Agentic Chat parity event type must be canonical');
	}
	if (event.event_type !== undefined && event.event_type !== event.type) {
		throw new Error('Agentic Chat parity event_type does not match type');
	}
	if (usesSequences) {
		if (!Number.isSafeInteger(event.sequence_index) || event.sequence_index! < 1) {
			throw new Error('Agentic Chat parity event sequence is missing or invalid');
		}
		if (event.sequence_index! <= lastSequence) {
			throw new Error('Agentic Chat parity events are not in strict sequence order');
		}
	}

	if (eventExecutionGeneration !== undefined) {
		if (executionGeneration !== undefined && executionGeneration !== eventExecutionGeneration) {
			throw new Error('Agentic Chat parity run cannot mix execution generations');
		}
	}
	if (event.phase !== undefined && !EVENT_PHASES.has(event.phase)) {
		throw new Error('Agentic Chat parity event phase is invalid');
	}
}

function executionGenerationOf(event: AgenticChatParitySourceEventV1): number | undefined {
	const generation = (event as unknown as Record<string, unknown>).execution_generation;
	if (generation === undefined) return undefined;
	if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 0) {
		throw new Error('Agentic Chat parity execution generation is invalid');
	}
	return generation;
}

function normalizePhase(value: AgentStreamEventPhase | undefined): AgentStreamEventPhase | null {
	return value ?? null;
}

function canonicalJsonObject(value: Record<string, unknown>): JsonObject {
	const serialized = JSON.stringify(value, (_key, entry: unknown) => {
		if (typeof entry === 'number' && !Number.isFinite(entry)) {
			throw new Error('Agentic Chat parity snapshots require finite numbers');
		}
		if (typeof entry === 'function' || typeof entry === 'symbol') {
			throw new Error('Agentic Chat parity snapshots must be JSON serializable');
		}
		return entry;
	});
	if (serialized === undefined) {
		throw new Error('Agentic Chat parity snapshot is not serializable');
	}
	const parsed = JSON.parse(serialized) as JsonValue;
	if (!isJsonObject(parsed)) {
		throw new Error('Agentic Chat parity snapshot must be an object');
	}
	return sortJsonObject(parsed);
}

function sortJsonObject(value: JsonObject): JsonObject {
	return Object.fromEntries(
		Object.entries(value)
			.filter((entry): entry is [string, JsonValue] => entry[1] !== undefined)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => [key, sortJsonValue(entry)])
	) as JsonObject;
}

function sortJsonValue(value: JsonValue): JsonValue {
	if (Array.isArray(value)) return value.map(sortJsonValue);
	if (isJsonObject(value)) return sortJsonObject(value);
	return value;
}

function isJsonObject(value: JsonValue): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
