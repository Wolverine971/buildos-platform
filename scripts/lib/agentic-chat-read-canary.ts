// scripts/lib/agentic-chat-read-canary.ts

export const AGENTIC_CHAT_READ_CANARY_TOOL_NAME = 'get_project_overview';

const CANONICAL_UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Slice 16 added durable provider-attempt and tool-execution boundaries to the
// lifecycle projection; the passing canary contract is sixteen observations in
// causal order (verified live on turn 9e54c04b, 2026-08-07).
const EXPECTED_LIFECYCLE = [
	['turn_intent_resolved', 'prompt'],
	['prepared_prompt_cache_checked', 'prompt'],
	['provider_attempt_started', 'provider'],
	['provider_attempt_ended', 'provider'],
	['tool_call_emitted', 'tool'],
	['first_tool_call_planning_cue_emitted', 'stream'],
	['tool_execution_started', 'tool'],
	['tool_execution_ended', 'tool'],
	['tool_result_received', 'tool'],
	['provider_attempt_started', 'provider'],
	['provider_attempt_ended', 'provider'],
	['turn_phase_changed', 'stream'],
	['turn_outcome_resolved', 'finalize'],
	['orchestration_interventions', 'finalize'],
	['done_emitted', 'finalize'],
	['prompt_snapshot_created', 'prompt']
] as const;

export type AgenticChatReadCanaryEvidence = {
	turns: unknown[];
	artifacts: unknown[];
	toolExecutions: unknown[];
	events: unknown[];
	streamStates: unknown[];
	promptSnapshots: unknown[];
	assistantMessages: unknown[];
	effects: unknown[];
	queueJobs: unknown[];
	lifecycleObservations: unknown[];
};

export type AgenticChatReadCanaryVerification = {
	ok: boolean;
	failures: Array<{ code: string; message: string }>;
	summary: {
		turnRunId: string | null;
		executionGeneration: number | null;
		publicEventCount: number;
		lastEventSequence: number | null;
		toolExecutionCount: number;
		toolRoundCount: number | null;
		toolCallCount: number | null;
		usageEvidence: 'exact' | 'unknown' | 'invalid';
		lifecycleObservationCount: number;
		queueCompleted: boolean;
		mutationEffectCount: number;
	};
};

export function parseAgenticChatReadCanaryTurnIdArgument(
	rawValues: readonly string[]
): string | null {
	const values = rawValues[0] === '--' ? rawValues.slice(1) : rawValues;
	if (values.length !== 2 || values[0] !== '--turn-id') return null;
	const turnRunId = values[1];
	return turnRunId && CANONICAL_UUID_PATTERN.test(turnRunId) ? turnRunId : null;
}

/**
 * Validate one completed, bounded production read round from service-role,
 * read-only database evidence. Provider HTTP request shape remains a separate
 * source-controlled network-boundary test gate; it is not inferable from these
 * durable rows.
 */
export function verifyAgenticChatReadCanaryEvidence(
	evidence: AgenticChatReadCanaryEvidence,
	expectedTurnRunId: string
): AgenticChatReadCanaryVerification {
	const failures: AgenticChatReadCanaryVerification['failures'] = [];
	const check = (condition: boolean, code: string, message: string): void => {
		if (!condition && !failures.some((failure) => failure.code === code)) {
			failures.push({ code, message });
		}
	};

	check(evidence.turns.length === 1, 'turn.cardinality', 'Expected exactly one turn row.');
	if (evidence.turns.length !== 1) {
		return {
			ok: false,
			failures,
			summary: {
				turnRunId: null,
				executionGeneration: null,
				publicEventCount: evidence.events.length,
				lastEventSequence: null,
				toolExecutionCount: evidence.toolExecutions.length,
				toolRoundCount: null,
				toolCallCount: null,
				usageEvidence: 'invalid',
				lifecycleObservationCount: evidence.lifecycleObservations.length,
				queueCompleted: false,
				mutationEffectCount: evidence.effects.length
			}
		};
	}
	check(
		evidence.artifacts.length === 1,
		'artifact.cardinality',
		'Expected exactly one linked input artifact.'
	);
	check(
		evidence.toolExecutions.length === 1,
		'tool.cardinality',
		'Expected exactly one durable tool execution.'
	);
	check(
		evidence.streamStates.length === 1,
		'stream.cardinality',
		'Expected exactly one stream-state row.'
	);
	check(
		evidence.promptSnapshots.length === 1,
		'prompt.cardinality',
		'Expected exactly one prompt snapshot.'
	);
	check(
		evidence.assistantMessages.length === 1,
		'assistant.cardinality',
		'Expected exactly one linked assistant message.'
	);
	check(evidence.effects.length === 0, 'effects.present', 'Expected zero mutation effects.');
	check(evidence.queueJobs.length === 1, 'queue.cardinality', 'Expected exactly one queue job.');

	const turn = recordAt(evidence.turns, 0);
	const artifact = recordAt(evidence.artifacts, 0);
	const tool = recordAt(evidence.toolExecutions, 0);
	const stream = recordAt(evidence.streamStates, 0);
	const prompt = recordAt(evidence.promptSnapshots, 0);
	const assistant = recordAt(evidence.assistantMessages, 0);
	const queue = recordAt(evidence.queueJobs, 0);
	const generation = positiveInteger(turn?.execution_generation);

	if (turn) {
		check(
			turn.id === expectedTurnRunId,
			'turn.identity',
			'Turn identity does not match the request.'
		);
		check(
			turn.execution_mode === 'worker_realtime',
			'turn.execution_mode',
			'Turn was not executed by the realtime worker.'
		);
		check(
			turn.transport_contract_version === 'agentic_chat_worker_v1',
			'turn.contract',
			'Turn does not use the reviewed worker contract.'
		);
		check(turn.status === 'completed', 'turn.status', 'Turn is not completed.');
		check(
			turn.finished_reason === 'stop',
			'turn.finished_reason',
			'Turn did not finish normally.'
		);
		check(turn.failure_code === null, 'turn.failure_code', 'Turn contains a failure code.');
		check(generation !== null, 'turn.generation', 'Execution generation is invalid.');
		check(turn.tool_round_count === 1, 'turn.tool_round_count', 'Expected one tool round.');
		check(turn.tool_call_count === 1, 'turn.tool_call_count', 'Expected one tool call.');
		check(
			canonicalUuid(turn.assistant_message_id),
			'turn.assistant_link',
			'Turn is not linked to an assistant message.'
		);
		check(
			canonicalUuid(turn.prompt_snapshot_id),
			'turn.prompt_link',
			'Turn is not linked to a prompt snapshot.'
		);
		check(
			canonicalUuid(turn.input_artifact_id),
			'turn.artifact_link',
			'Turn is not linked to an input artifact.'
		);
		check(
			canonicalUuid(turn.queue_job_id),
			'turn.queue_link',
			'Turn is not linked to a queue job.'
		);
	}

	if (artifact && turn) {
		check(
			artifact.id === turn.input_artifact_id && artifact.turn_run_id === turn.id,
			'artifact.linkage',
			'Input artifact linkage is inconsistent.'
		);
		check(
			artifact.session_id === turn.session_id && artifact.user_id === turn.user_id,
			'artifact.scope',
			'Input artifact scope is inconsistent.'
		);
		check(
			artifact.artifact_version === 'agentic_chat_input_v3',
			'artifact.version',
			'Input artifact is not the current immutable contract.'
		);
		const prepared = asRecord(artifact.prepared);
		const toolSurface = asRecord(prepared?.toolSurface);
		const toolNames = Array.isArray(toolSurface?.toolNames) ? toolSurface.toolNames : [];
		check(
			toolNames.includes(AGENTIC_CHAT_READ_CANARY_TOOL_NAME),
			'artifact.tool_surface',
			'Immutable tool surface does not contain the production read tool.'
		);
	}

	const eventRows = evidence.events.map(asRecord).filter(isPresent);
	check(
		eventRows.length === evidence.events.length,
		'events.shape',
		'One or more event rows are malformed.'
	);
	check(eventRows.length > 0, 'events.empty', 'No durable public events were found.');
	if (turn && generation !== null) {
		check(
			eventRows.every(
				(event) =>
					event.turn_run_id === turn.id &&
					event.session_id === turn.session_id &&
					event.user_id === turn.user_id &&
					event.stream_run_id === turn.stream_run_id &&
					event.execution_generation === generation
			),
			'events.scope',
			'Public event scope or generation is inconsistent.'
		);
	}
	// Text batches consume sequence numbers without creating public event rows,
	// so public sequences are strictly increasing from one with gaps, and the
	// terminal event owns the turn's last allocated sequence.
	const sequences = eventRows.map((event) => nonnegativeInteger(event.sequence_index));
	check(
		sequences.every((sequence): sequence is number => sequence !== null) &&
			sequences[0] === 1 &&
			sequences.every(
				(sequence, index) => index === 0 || sequence > (sequences[index - 1] ?? 0)
			) &&
			(turn === null ||
				sequences[sequences.length - 1] === nonnegativeInteger(turn.last_event_sequence)),
		'events.sequence',
		'Public event sequence is not strictly increasing from one to the terminal sequence.'
	);

	const toolCalls = eventRows.filter(
		(event) => event.event_type === 'tool_call' && asRecord(event.payload)?.type === 'tool_call'
	);
	const planningCues = eventRows.filter((event) => {
		const payload = asRecord(event.payload);
		return (
			event.event_type === 'agent_state' &&
			payload?.type === 'agent_state' &&
			payload.state === 'thinking' &&
			payload.details === 'Planning the first step...'
		);
	});
	const toolResults = eventRows.filter(
		(event) =>
			event.event_type === 'tool_result' && asRecord(event.payload)?.type === 'tool_result'
	);
	const finalizing = eventRows.filter((event) => {
		const payload = asRecord(event.payload);
		return (
			event.event_type === 'turn_phase' &&
			payload?.type === 'turn_phase' &&
			payload.turn_phase === 'finalizing'
		);
	});
	const doneEvents = eventRows.filter(
		(event) => event.event_type === 'done' && asRecord(event.payload)?.type === 'done'
	);
	check(toolCalls.length === 1, 'events.tool_call', 'Expected exactly one public tool call.');
	check(planningCues.length === 1, 'events.planning', 'Expected exactly one planning cue.');
	check(
		toolResults.length === 1,
		'events.tool_result',
		'Expected exactly one public tool result.'
	);
	check(finalizing.length === 1, 'events.finalizing', 'Expected exactly one finalizing phase.');
	check(doneEvents.length === 1, 'events.done', 'Expected exactly one terminal done event.');

	const planningSequence = nonnegativeInteger(planningCues[0]?.sequence_index);
	const callSequence = nonnegativeInteger(toolCalls[0]?.sequence_index);
	const resultSequence = nonnegativeInteger(toolResults[0]?.sequence_index);
	const finalizingSequence = nonnegativeInteger(finalizing[0]?.sequence_index);
	const doneSequence = nonnegativeInteger(doneEvents[0]?.sequence_index);
	check(
		planningSequence !== null &&
			callSequence !== null &&
			resultSequence !== null &&
			finalizingSequence !== null &&
			doneSequence !== null &&
			planningSequence < callSequence &&
			callSequence < resultSequence &&
			resultSequence < finalizingSequence &&
			finalizingSequence < doneSequence,
		'events.order',
		'Planning, read, finalization, and terminal events are out of order.'
	);

	const callPayload = asRecord(toolCalls[0]?.payload);
	const publicCall = asRecord(callPayload?.tool_call);
	const publicFunction = asRecord(publicCall?.function);
	const resultPayload = asRecord(toolResults[0]?.payload);
	const publicResult = asRecord(resultPayload?.result);
	const providerCallId = canonicalText(publicCall?.id, 512);
	const publicArguments = parseJsonObject(publicFunction?.arguments);
	check(
		publicFunction?.name === AGENTIC_CHAT_READ_CANARY_TOOL_NAME,
		'events.tool_name',
		'Public call does not use the production read tool.'
	);
	check(providerCallId !== null, 'events.provider_call_id', 'Provider tool-call id is invalid.');
	check(publicArguments !== null, 'events.arguments', 'Public tool arguments are invalid.');
	check(
		publicResult?.success === true,
		'events.result_success',
		'Public tool result is not successful.'
	);
	check(
		publicResult?.tool_name === AGENTIC_CHAT_READ_CANARY_TOOL_NAME &&
			publicResult?.tool_call_id === providerCallId,
		'events.result_identity',
		'Public tool result identity does not match the call.'
	);
	check(
		publicResult?.result_count === 1 && publicResult?.zero_result === false,
		'events.result_count',
		'Public tool result does not contain the bounded one-result receipt.'
	);

	if (tool && turn) {
		check(
			tool.turn_run_id === turn.id,
			'tool.turn_link',
			'Tool execution is linked to another turn.'
		);
		check(
			tool.session_id === turn.session_id && tool.stream_run_id === turn.stream_run_id,
			'tool.scope',
			'Tool execution scope is inconsistent.'
		);
		check(
			tool.success === true && tool.error_message === null,
			'tool.success',
			'Tool ledger row failed.'
		);
		check(
			tool.effect_id === null,
			'tool.effect',
			'Read tool ledger row has a mutation effect.'
		);
		check(
			tool.sequence_index === 1,
			'tool.sequence',
			'Tool ledger sequence is not exactly one.'
		);
		check(
			tool.provider_tool_call_id === providerCallId &&
				tool.tool_name === AGENTIC_CHAT_READ_CANARY_TOOL_NAME,
			'tool.identity',
			'Tool ledger identity does not match the public call.'
		);
		check(
			// Slice 18 S3 single-sources durable categories from shared TOOL_METADATA.
			// Production must admit 'read' before this canary is run.
			tool.tool_category === 'read' &&
				tool.result_count === 1 &&
				tool.zero_result === false &&
				tool.requires_user_action === false,
			'tool.bounds',
			'Tool ledger row is outside the bounded project-read contract.'
		);
		check(
			deepEqualJson(tool.arguments, publicArguments),
			'tool.arguments',
			'Tool ledger arguments differ from the public call.'
		);
		check(
			deepEqualJson(tool.result, publicResult?.result),
			'tool.result',
			'Public result differs from the durable ledger result.'
		);
		check(
			turn.assistant_message_id !== null && tool.message_id === turn.assistant_message_id,
			'tool.message_link',
			'Tool ledger row is not linked to the terminal assistant message.'
		);
		const affected = Array.isArray(tool.affected_entities) ? tool.affected_entities : [];
		const affectedProject = asRecord(affected[0]);
		const durableResult = asRecord(tool.result);
		const resultProject = asRecord(durableResult?.project);
		check(
			affected.length === 1 &&
				affectedProject?.type === 'project' &&
				canonicalUuid(affectedProject.id) &&
				affectedProject.id === resultProject?.id,
			'tool.affected_entities',
			'Tool ledger does not identify exactly the returned project.'
		);
		const ledgerAt = timestampMs(tool.created_at);
		const resultAt = timestampMs(toolResults[0]?.created_at);
		check(
			ledgerAt !== null && resultAt !== null && ledgerAt <= resultAt,
			'tool.persistence_order',
			'Tool ledger was not committed before the public result.'
		);
	}

	const lastEvent = eventRows.at(-1);
	if (turn) {
		check(
			doneSequence !== null &&
				turn.last_event_sequence === doneSequence &&
				turn.terminal_event_id === doneEvents[0]?.event_id &&
				lastEvent?.event_id === doneEvents[0]?.event_id,
			'turn.terminal_receipt',
			'Turn terminal receipt does not match the final durable event.'
		);
	}
	const donePayload = asRecord(doneEvents[0]?.payload);
	check(
		donePayload?.status === 'completed' &&
			donePayload.finished_reason === 'stop' &&
			donePayload.failure_code === null &&
			donePayload.assistant_message_id === turn?.assistant_message_id,
		'events.done_receipt',
		'Terminal done payload is inconsistent.'
	);

	if (stream && turn && generation !== null) {
		check(
			stream.turn_run_id === turn.id &&
				stream.session_id === turn.session_id &&
				stream.user_id === turn.user_id &&
				stream.execution_generation === generation,
			'stream.scope',
			'Stream snapshot scope is inconsistent.'
		);
		check(
			doneSequence !== null &&
				stream.snapshot_sequence === doneSequence &&
				stream.durable_through_sequence === doneSequence &&
				stream.projection_durable_sequence === doneSequence,
			'stream.sequence',
			'Stream snapshot is not durable through the terminal event.'
		);
		const terminal = asRecord(asRecord(stream.projection)?.terminal);
		check(
			terminal?.eventId === turn.terminal_event_id &&
				terminal?.sequenceIndex === doneSequence &&
				terminal?.status === 'completed' &&
				terminal?.assistantMessageId === turn.assistant_message_id,
			'stream.terminal_projection',
			'Stream terminal projection is inconsistent.'
		);
	}

	let usageEvidence: AgenticChatReadCanaryVerification['summary']['usageEvidence'] = 'invalid';
	if (assistant && turn) {
		check(
			assistant.id === turn.assistant_message_id &&
				assistant.session_id === turn.session_id &&
				assistant.user_id === turn.user_id &&
				assistant.role === 'assistant',
			'assistant.linkage',
			'Assistant message linkage is inconsistent.'
		);
		check(
			stream === null || assistant.content === stream.assistant_text,
			'assistant.content',
			'Assistant message and stream snapshot text differ.'
		);
		const metadata = asRecord(assistant.metadata);
		check(
			metadata?.turn_run_id === turn.id &&
				metadata?.execution_generation === generation &&
				metadata?.transport_contract_version === 'agentic_chat_worker_v1' &&
				metadata?.tool_round_count === 1 &&
				metadata?.tool_call_count === 1,
			'assistant.metadata',
			'Assistant metadata is inconsistent with the durable turn.'
		);
		const tokenValues = [
			assistant.prompt_tokens,
			assistant.completion_tokens,
			assistant.total_tokens
		];
		const promptTokens = nonnegativeInteger(assistant.prompt_tokens);
		const completionTokens = nonnegativeInteger(assistant.completion_tokens);
		const totalTokens = nonnegativeInteger(assistant.total_tokens);
		if (tokenValues.every((value) => value === null)) {
			usageEvidence = 'unknown';
		} else if (
			promptTokens !== null &&
			completionTokens !== null &&
			totalTokens !== null &&
			promptTokens + completionTokens === totalTokens
		) {
			usageEvidence = 'exact';
		} else {
			usageEvidence = 'invalid';
			check(
				false,
				'assistant.usage',
				'Assistant usage is partial or internally inconsistent.'
			);
		}
	}

	if (prompt && turn) {
		check(
			prompt.id === turn.prompt_snapshot_id &&
				prompt.turn_run_id === turn.id &&
				prompt.session_id === turn.session_id &&
				prompt.user_id === turn.user_id,
			'prompt.linkage',
			'Prompt snapshot linkage is inconsistent.'
		);
		check(
			prompt.snapshot_version === 'agentic_chat_worker_prompt_v1' &&
				sha256(prompt.system_prompt_sha256) &&
				sha256(prompt.messages_sha256) &&
				Array.isArray(prompt.model_messages) &&
				prompt.tool_definitions === null,
			'prompt.contract',
			'Prompt snapshot is outside the worker snapshot contract.'
		);
	}

	if (queue && turn) {
		const metadata = asRecord(queue.metadata);
		const result = asRecord(queue.result);
		check(
			queue.id === turn.queue_job_id,
			'queue.linkage',
			'Queue job linkage is inconsistent.'
		);
		check(
			queue.user_id === turn.user_id && queue.job_type === 'agentic_chat_turn',
			'queue.scope',
			'Queue job scope or type is inconsistent.'
		);
		check(
			queue.status === 'completed' &&
				queue.error_message === null &&
				queue.completed_at !== null,
			'queue.status',
			'Queue job is not cleanly completed.'
		);
		check(
			metadata?.turnRunId === turn.id && metadata?.correlationId === turn.correlation_id,
			'queue.metadata',
			'Queue metadata does not match the admitted turn.'
		);
		check(
			result?.turnRunId === turn.id &&
				result?.status === 'completed' &&
				result?.terminalEventId === turn.terminal_event_id,
			'queue.result',
			'Queue completion result does not match the terminal receipt.'
		);
	}

	const lifecycle = evidence.lifecycleObservations.map(asRecord).filter(isPresent);
	check(
		lifecycle.length === evidence.lifecycleObservations.length,
		'lifecycle.shape',
		'One or more lifecycle observations are malformed.'
	);
	check(
		lifecycle.length === EXPECTED_LIFECYCLE.length,
		'lifecycle.cardinality',
		`Expected exactly ${EXPECTED_LIFECYCLE.length} lifecycle observations.`
	);
	if (turn && generation !== null) {
		check(
			lifecycle.every(
				(observation) =>
					observation.turn_run_id === turn.id &&
					observation.session_id === turn.session_id &&
					observation.user_id === turn.user_id &&
					observation.stream_run_id === turn.stream_run_id &&
					observation.execution_generation === generation
			),
			'lifecycle.scope',
			'Lifecycle projection scope or generation is inconsistent.'
		);
	}
	check(
		EXPECTED_LIFECYCLE.every(
			([eventType, phase], index) =>
				lifecycle[index]?.observation_sequence_index === index + 1 &&
				lifecycle[index]?.event_type === eventType &&
				lifecycle[index]?.phase === phase
		),
		'lifecycle.sequence',
		'Lifecycle projection does not match the bounded read contract.'
	);

	return {
		ok: failures.length === 0,
		failures,
		summary: {
			turnRunId: typeof turn?.id === 'string' ? turn.id : null,
			executionGeneration: generation,
			publicEventCount: eventRows.length,
			lastEventSequence: nonnegativeInteger(lastEvent?.sequence_index),
			toolExecutionCount: evidence.toolExecutions.length,
			toolRoundCount: nonnegativeInteger(turn?.tool_round_count),
			toolCallCount: nonnegativeInteger(turn?.tool_call_count),
			usageEvidence,
			lifecycleObservationCount: lifecycle.length,
			queueCompleted: queue?.status === 'completed',
			mutationEffectCount: evidence.effects.length
		}
	};
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function recordAt(values: unknown[], index: number): Record<string, unknown> | null {
	return asRecord(values[index]);
}

function isPresent<T>(value: T | null): value is T {
	return value !== null;
}

function canonicalUuid(value: unknown): value is string {
	return typeof value === 'string' && CANONICAL_UUID_PATTERN.test(value);
}

function canonicalText(value: unknown, maximum: number): string | null {
	return typeof value === 'string' &&
		value.length > 0 &&
		value.length <= maximum &&
		value.trim() === value
		? value
		: null;
}

function positiveInteger(value: unknown): number | null {
	return Number.isSafeInteger(value) && (value as number) >= 1 ? (value as number) : null;
}

function nonnegativeInteger(value: unknown): number | null {
	return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
	if (typeof value !== 'string') return null;
	try {
		return asRecord(JSON.parse(value));
	} catch {
		return null;
	}
}

function deepEqualJson(left: unknown, right: unknown): boolean {
	return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (value !== null && typeof value === 'object') {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
			.join(',')}}`;
	}
	return JSON.stringify(value);
}

function timestampMs(value: unknown): number | null {
	if (typeof value !== 'string') return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function sha256(value: unknown): boolean {
	return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}
