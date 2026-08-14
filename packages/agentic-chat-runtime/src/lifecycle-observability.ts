// packages/agentic-chat-runtime/src/lifecycle-observability.ts
export type AgenticChatLifecycleObservationV1 = {
	event_type: string;
	phase: 'prompt' | 'llm' | 'tool' | 'stream' | 'finalize';
};

export type AgenticChatWorkerLifecycleProjectionInputV1 = {
	admissionObserved: boolean;
	publicEvents: readonly unknown[];
	terminalStatus: 'completed' | 'cancelled' | 'failed' | null;
	promptSnapshotCount: number;
	/** Exact typed provider-pass failure observed before terminal recovery. */
	streamTerminalFailureObserved?: boolean;
};

/**
 * Project private legacy lifecycle meanings from facts the worker already owns
 * durably. This is intentionally not a public stream transform: the returned
 * observations belong to evaluation/admin telemetry and must never consume a
 * reconnect sequence number.
 *
 * The Slice 18 multi-round golden widened tool lifecycle cardinality from the
 * original one-read bound to N pairs: legacy inserts one `tool_call_emitted`
 * and one terminal result observation per pair in event order. Expected
 * pre-execution validation failures retain their distinct legacy event name.
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
	if (
		input.streamTerminalFailureObserved !== undefined &&
		typeof input.streamTerminalFailureObserved !== 'boolean'
	) {
		throw new Error('Agentic Chat lifecycle terminal failure evidence is invalid');
	}

	const payloads = input.publicEvents.map((event, index) => {
		const payload = readEventPayload(event);
		if (!payload) {
			throw new Error(`Agentic Chat lifecycle public event ${index} is invalid`);
		}
		return payload;
	});
	const planningCues = payloads.filter(
		(payload) =>
			payload.type === 'agent_state' &&
			payload.state === 'thinking' &&
			payload.details === 'Planning the first step...'
	);
	const finalizingPhases = payloads.filter(
		(payload) => payload.type === 'turn_phase' && payload.turn_phase === 'finalizing'
	);
	for (const [label, values] of [
		['planning cues', planningCues],
		['finalizing phases', finalizingPhases]
	] as const) {
		if (values.length > 1) {
			throw new Error(`Agentic Chat lifecycle ${label} exceed the bounded contract`);
		}
	}
	const toolObservations: AgenticChatLifecycleObservationV1[] = [];
	let toolCallCount = 0;
	let toolResultCount = 0;
	for (const payload of payloads) {
		if (payload.type === 'tool_call') {
			toolCallCount += 1;
			toolObservations.push({ event_type: 'tool_call_emitted', phase: 'tool' });
			if (toolCallCount === 1 && planningCues.length === 1) {
				toolObservations.push({
					event_type: 'first_tool_call_planning_cue_emitted',
					phase: 'stream'
				});
			}
		} else if (payload.type === 'tool_result') {
			toolResultCount += 1;
			toolObservations.push({
				event_type: isValidationFailureResult(payload.result)
					? 'tool_call_validation_failed'
					: 'tool_result_received',
				phase: 'tool'
			});
		} else if (payload.type === 'context_shift') {
			toolObservations.push({ event_type: 'context_shift_emitted', phase: 'tool' });
		}
	}
	if (toolResultCount > toolCallCount) {
		throw new Error('Agentic Chat lifecycle tool results exceed the bounded contract');
	}
	if (toolCallCount === 0 && planningCues.length === 1) {
		toolObservations.unshift({
			event_type: 'first_tool_call_planning_cue_emitted',
			phase: 'stream'
		});
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
	observations.push(...toolObservations);
	if (input.streamTerminalFailureObserved === true) {
		observations.push({ event_type: 'stream_terminal_failure', phase: 'llm' });
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

function isValidationFailureResult(value: unknown): boolean {
	if (!isRecord(value) || value.success !== false || typeof value.error !== 'string') {
		return false;
	}
	return /Tool validation failed|Missing required parameter|No update fields provided|Invalid .*expected UUID|Tool arguments must be a JSON object|Invalid JSON in tool arguments/i.test(
		value.error
	);
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
