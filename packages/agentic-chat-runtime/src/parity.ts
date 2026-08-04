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

export type AgenticChatParityDifferenceKindV1 =
	| 'missing_in_actual'
	| 'unexpected_in_actual'
	| 'value_mismatch';

export type AgenticChatParityDifferenceValueV1 = {
	present: boolean;
	value: JsonValue | null;
};

export type AgenticChatParityDifferenceV1 = {
	path: string;
	kind: AgenticChatParityDifferenceKindV1;
	expected: AgenticChatParityDifferenceValueV1;
	actual: AgenticChatParityDifferenceValueV1;
};

export type AgenticChatParityDiffV1 = {
	matches: boolean;
	truncated: boolean;
	differences: readonly AgenticChatParityDifferenceV1[];
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
			if (
				typeof record.content === 'string' &&
				typeof record.text_delta === 'string' &&
				record.content !== record.text_delta
			) {
				throw new Error('Agentic Chat parity assistant text spellings do not match');
			}
			const content = typeof record.content === 'string' ? record.content : record.text_delta;
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

/** Return a bounded, stable JSON-pointer diff for an already-normalized pair. */
export function diffAgenticChatParityRunsV1(
	expected: AgenticChatParityRunV1,
	actual: AgenticChatParityRunV1,
	options: { maxDifferences?: number } = {}
): AgenticChatParityDiffV1 {
	const maxDifferences = options.maxDifferences ?? 256;
	if (!Number.isSafeInteger(maxDifferences) || maxDifferences < 1 || maxDifferences > 4_096) {
		throw new Error('Agentic Chat parity maxDifferences must be between 1 and 4096');
	}

	const differences: AgenticChatParityDifferenceV1[] = [];
	let truncated = false;
	const markTruncated = () => {
		truncated = true;
	};
	diffParityEvents(expected.events, actual.events, differences, maxDifferences, markTruncated);
	for (const [path, expectedValue, actualValue] of [
		['/messages', expected.messages, actual.messages],
		['/toolExecutions', expected.toolExecutions, actual.toolExecutions],
		['/checkpoints', expected.checkpoints, actual.checkpoints],
		['/outcome', expected.outcome, actual.outcome]
	] as const) {
		diffJsonValue(
			expectedValue as JsonValue,
			actualValue as JsonValue,
			path,
			differences,
			maxDifferences,
			markTruncated
		);
		if (truncated) break;
	}
	if (!truncated) {
		diffParityMetadata(
			expected.metadata,
			actual.metadata,
			differences,
			maxDifferences,
			markTruncated
		);
	}

	return {
		matches: differences.length === 0 && !truncated,
		truncated,
		differences
	};
}

/**
 * Lifecycle observability rows are ordered, but a missing earlier row must not
 * make a later equivalent row look different. Other metadata remains an exact
 * structural comparison.
 */
function diffParityMetadata(
	expected: JsonObject,
	actual: JsonObject,
	differences: AgenticChatParityDifferenceV1[],
	maxDifferences: number,
	markTruncated: () => void
): void {
	const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
	for (const key of keys) {
		if (differences.length >= maxDifferences) {
			markTruncated();
			return;
		}
		const expectedPresent = Object.prototype.hasOwnProperty.call(expected, key);
		const actualPresent = Object.prototype.hasOwnProperty.call(actual, key);
		const path = `/metadata/${escapeJsonPointer(key)}`;
		if (!expectedPresent || !actualPresent) {
			differences.push(
				missingDifference(path, expectedPresent, expected[key], actualPresent, actual[key])
			);
			continue;
		}

		const expectedValue = expected[key]!;
		const actualValue = actual[key]!;
		if (
			key === 'lifecycle_events' &&
			isLifecycleEventArray(expectedValue) &&
			isLifecycleEventArray(actualValue)
		) {
			diffParityLifecycleEvents(
				expectedValue,
				actualValue,
				path,
				differences,
				maxDifferences,
				markTruncated
			);
		} else {
			diffJsonValue(
				expectedValue,
				actualValue,
				path,
				differences,
				maxDifferences,
				markTruncated
			);
		}
	}
}

function diffParityLifecycleEvents(
	expected: readonly JsonObject[],
	actual: readonly JsonObject[],
	path: string,
	differences: AgenticChatParityDifferenceV1[],
	maxDifferences: number,
	markTruncated: () => void
): void {
	let actualCursor = 0;
	for (let expectedIndex = 0; expectedIndex < expected.length; expectedIndex += 1) {
		if (differences.length >= maxDifferences) {
			markTruncated();
			return;
		}
		const expectedEvent = expected[expectedIndex]!;
		let matchedActualIndex = -1;
		for (let actualIndex = actualCursor; actualIndex < actual.length; actualIndex += 1) {
			if (sameLifecycleEventIdentity(expectedEvent, actual[actualIndex]!)) {
				matchedActualIndex = actualIndex;
				break;
			}
		}

		if (matchedActualIndex === -1) {
			differences.push(
				missingDifference(`${path}/${expectedIndex}`, true, expectedEvent, false, undefined)
			);
			continue;
		}

		for (let actualIndex = actualCursor; actualIndex < matchedActualIndex; actualIndex += 1) {
			if (differences.length >= maxDifferences) {
				markTruncated();
				return;
			}
			differences.push(
				missingDifference(
					`${path}/${actualIndex}`,
					false,
					undefined,
					true,
					actual[actualIndex]
				)
			);
		}
		diffJsonValue(
			expectedEvent,
			actual[matchedActualIndex]!,
			`${path}/${expectedIndex}`,
			differences,
			maxDifferences,
			markTruncated
		);
		actualCursor = matchedActualIndex + 1;
	}

	for (let actualIndex = actualCursor; actualIndex < actual.length; actualIndex += 1) {
		if (differences.length >= maxDifferences) {
			markTruncated();
			return;
		}
		differences.push(
			missingDifference(`${path}/${actualIndex}`, false, undefined, true, actual[actualIndex])
		);
	}
}

function sameLifecycleEventIdentity(expected: JsonObject, actual: JsonObject): boolean {
	return expected.event_type === actual.event_type && expected.phase === actual.phase;
}

function isLifecycleEventArray(value: JsonValue): value is JsonObject[] {
	return Array.isArray(value) && value.every(isJsonObject);
}

/**
 * Align ordered events by semantic identity before comparing payloads. A
 * missing lifecycle event must not turn every later, otherwise-equal event
 * into an index-shift cascade.
 */
function diffParityEvents(
	expected: readonly AgenticChatParityEventV1[],
	actual: readonly AgenticChatParityEventV1[],
	differences: AgenticChatParityDifferenceV1[],
	maxDifferences: number,
	markTruncated: () => void
): void {
	let actualCursor = 0;
	for (let expectedIndex = 0; expectedIndex < expected.length; expectedIndex += 1) {
		if (differences.length >= maxDifferences) {
			markTruncated();
			return;
		}
		const expectedEvent = expected[expectedIndex]!;
		let matchedActualIndex = -1;
		for (let actualIndex = actualCursor; actualIndex < actual.length; actualIndex += 1) {
			if (sameEventIdentity(expectedEvent, actual[actualIndex]!)) {
				matchedActualIndex = actualIndex;
				break;
			}
		}

		if (matchedActualIndex === -1) {
			differences.push(
				missingDifference(`/events/${expectedIndex}`, true, expectedEvent, false, undefined)
			);
			continue;
		}

		for (let actualIndex = actualCursor; actualIndex < matchedActualIndex; actualIndex += 1) {
			if (differences.length >= maxDifferences) {
				markTruncated();
				return;
			}
			differences.push(
				missingDifference(
					`/events/${actualIndex}`,
					false,
					undefined,
					true,
					actual[actualIndex]
				)
			);
		}
		diffJsonValue(
			expectedEvent as unknown as JsonValue,
			actual[matchedActualIndex] as unknown as JsonValue,
			`/events/${expectedIndex}`,
			differences,
			maxDifferences,
			markTruncated
		);
		actualCursor = matchedActualIndex + 1;
	}

	for (let actualIndex = actualCursor; actualIndex < actual.length; actualIndex += 1) {
		if (differences.length >= maxDifferences) {
			markTruncated();
			return;
		}
		differences.push(
			missingDifference(`/events/${actualIndex}`, false, undefined, true, actual[actualIndex])
		);
	}
}

function sameEventIdentity(
	expected: AgenticChatParityEventV1,
	actual: AgenticChatParityEventV1
): boolean {
	return (
		expected.type === actual.type &&
		expected.phase === actual.phase &&
		eventVariant(expected) === eventVariant(actual)
	);
}

function eventVariant(event: AgenticChatParityEventV1): string {
	if (event.type === 'turn_phase' && typeof event.payload.turn_phase === 'string') {
		return event.payload.turn_phase;
	}
	if (event.type === 'phase_update' && typeof event.payload.session_phase === 'string') {
		return event.payload.session_phase;
	}
	if (event.type === 'skill_activity') {
		return [event.payload.action, event.payload.path]
			.filter((value): value is string => typeof value === 'string')
			.join(':');
	}
	return '';
}

function diffJsonValue(
	expected: JsonValue,
	actual: JsonValue,
	path: string,
	differences: AgenticChatParityDifferenceV1[],
	maxDifferences: number,
	markTruncated: () => void
): void {
	if (differences.length >= maxDifferences) {
		markTruncated();
		return;
	}
	if (Object.is(expected, actual)) return;

	if (Array.isArray(expected) && Array.isArray(actual)) {
		const length = Math.max(expected.length, actual.length);
		for (let index = 0; index < length; index += 1) {
			if (differences.length >= maxDifferences) {
				markTruncated();
				return;
			}
			const expectedPresent = index < expected.length;
			const actualPresent = index < actual.length;
			const itemPath = `${path}/${index}`;
			if (!expectedPresent || !actualPresent) {
				differences.push(
					missingDifference(
						itemPath,
						expectedPresent,
						expected[index],
						actualPresent,
						actual[index]
					)
				);
				continue;
			}
			diffJsonValue(
				expected[index]!,
				actual[index]!,
				itemPath,
				differences,
				maxDifferences,
				markTruncated
			);
		}
		return;
	}

	if (isJsonObject(expected) && isJsonObject(actual)) {
		const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
		for (const key of keys) {
			if (differences.length >= maxDifferences) {
				markTruncated();
				return;
			}
			const expectedPresent = Object.prototype.hasOwnProperty.call(expected, key);
			const actualPresent = Object.prototype.hasOwnProperty.call(actual, key);
			const itemPath = `${path}/${escapeJsonPointer(key)}`;
			if (!expectedPresent || !actualPresent) {
				differences.push(
					missingDifference(
						itemPath,
						expectedPresent,
						expected[key],
						actualPresent,
						actual[key]
					)
				);
				continue;
			}
			diffJsonValue(
				expected[key]!,
				actual[key]!,
				itemPath,
				differences,
				maxDifferences,
				markTruncated
			);
		}
		return;
	}

	differences.push({
		path: path || '/',
		kind: 'value_mismatch',
		expected: differenceValue(true, expected),
		actual: differenceValue(true, actual)
	});
}

function missingDifference(
	path: string,
	expectedPresent: boolean,
	expected: JsonValue | undefined,
	actualPresent: boolean,
	actual: JsonValue | undefined
): AgenticChatParityDifferenceV1 {
	return {
		path,
		kind: expectedPresent ? 'missing_in_actual' : 'unexpected_in_actual',
		expected: differenceValue(expectedPresent, expected),
		actual: differenceValue(actualPresent, actual)
	};
}

function differenceValue(
	present: boolean,
	value: JsonValue | undefined
): AgenticChatParityDifferenceValueV1 {
	return { present, value: present ? (value ?? null) : null };
}

function escapeJsonPointer(value: string): string {
	return value.replace(/~/g, '~0').replace(/\//g, '~1');
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
