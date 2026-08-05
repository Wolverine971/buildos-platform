// packages/agentic-chat-runtime/src/lifecycle-observability.ts
export type AgenticChatLifecycleObservationV1 = {
	event_type: string;
	phase: 'prompt' | 'tool' | 'stream' | 'finalize';
};

export type AgenticChatWorkerLifecycleProjectionInputV1 = {
	admissionObserved: boolean;
	publicEvents: readonly unknown[];
	terminalStatus: 'completed' | 'cancelled' | 'failed' | null;
	promptSnapshotCount: number;
};

/**
 * Project private legacy lifecycle meanings from facts the worker already owns
 * durably. This is intentionally not a public stream transform: the returned
 * observations belong to evaluation/admin telemetry and must never consume a
 * reconnect sequence number.
 *
 * The current production contract permits at most one read call, so tool
 * lifecycle cardinality is deliberately bounded to one until a later golden
 * authorizes a wider loop.
 */
export function projectAgenticChatWorkerLifecycleObservationsV1(
	input: AgenticChatWorkerLifecycleProjectionInputV1
): AgenticChatLifecycleObservationV1[] {
	if (typeof input.admissionObserved !== 'boolean') {
		throw new Error('Agentic Chat lifecycle admission evidence is invalid');
	}
	if (!Array.isArray(input.publicEvents)) {
		throw new Error('Agentic Chat lifecycle public events are invalid');
	}
	if (
		!Number.isSafeInteger(input.promptSnapshotCount) ||
		input.promptSnapshotCount < 0 ||
		input.promptSnapshotCount > 1
	) {
		throw new Error('Agentic Chat lifecycle prompt snapshot count is invalid');
	}
	if (
		input.terminalStatus !== null &&
		input.terminalStatus !== 'completed' &&
		input.terminalStatus !== 'cancelled' &&
		input.terminalStatus !== 'failed'
	) {
		throw new Error('Agentic Chat lifecycle terminal status is invalid');
	}

	const payloads = input.publicEvents.map((event, index) => {
		const payload = readEventPayload(event);
		if (!payload) {
			throw new Error(`Agentic Chat lifecycle public event ${index} is invalid`);
		}
		return payload;
	});
	const toolCalls = payloads.filter((payload) => payload.type === 'tool_call');
	const planningCues = payloads.filter(
		(payload) =>
			payload.type === 'agent_state' &&
			payload.state === 'thinking' &&
			payload.details === 'Planning the first step...'
	);
	const toolResults = payloads.filter((payload) => payload.type === 'tool_result');
	const finalizingPhases = payloads.filter(
		(payload) => payload.type === 'turn_phase' && payload.turn_phase === 'finalizing'
	);
	for (const [label, values] of [
		['tool calls', toolCalls],
		['planning cues', planningCues],
		['tool results', toolResults],
		['finalizing phases', finalizingPhases]
	] as const) {
		if (values.length > 1) {
			throw new Error(`Agentic Chat lifecycle ${label} exceed the bounded contract`);
		}
	}

	const done = payloads.find((payload) => payload.type === 'done') ?? null;
	if (payloads.filter((payload) => payload.type === 'done').length > 1) {
		throw new Error('Agentic Chat lifecycle terminal event is duplicated');
	}
	if (
		done &&
		typeof done.status === 'string' &&
		input.terminalStatus !== null &&
		done.status !== input.terminalStatus
	) {
		throw new Error('Agentic Chat lifecycle terminal evidence is inconsistent');
	}

	const observations: AgenticChatLifecycleObservationV1[] = [];
	if (input.admissionObserved) {
		observations.push(
			{ event_type: 'turn_intent_resolved', phase: 'prompt' },
			{ event_type: 'prepared_prompt_cache_checked', phase: 'prompt' }
		);
	}
	if (toolCalls.length === 1) {
		observations.push({ event_type: 'tool_call_emitted', phase: 'tool' });
	}
	if (planningCues.length === 1) {
		observations.push({
			event_type: 'first_tool_call_planning_cue_emitted',
			phase: 'stream'
		});
	}
	if (toolResults.length === 1) {
		observations.push({ event_type: 'tool_result_received', phase: 'tool' });
	}
	if (finalizingPhases.length === 1) {
		observations.push({ event_type: 'turn_phase_changed', phase: 'stream' });
	}
	if (done && (input.terminalStatus === 'completed' || input.terminalStatus === 'cancelled')) {
		observations.push(
			{ event_type: 'turn_outcome_resolved', phase: 'finalize' },
			{ event_type: 'orchestration_interventions', phase: 'finalize' }
		);
	}
	if (done) observations.push({ event_type: 'done_emitted', phase: 'finalize' });
	if (input.promptSnapshotCount === 1) {
		observations.push({ event_type: 'prompt_snapshot_created', phase: 'prompt' });
	}
	return observations;
}

function readEventPayload(value: unknown): Record<string, unknown> | null {
	if (!isRecord(value)) return null;
	if ('event_payload' in value) {
		return isRecord(value.event_payload) ? value.event_payload : null;
	}
	if ('payload' in value) {
		return isRecord(value.payload) ? value.payload : null;
	}
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
