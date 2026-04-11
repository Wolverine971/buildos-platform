// apps/web/src/routes/api/admin/chat/sessions/[id]/session-detail-payload.ts
type TimelineSeverity = 'info' | 'success' | 'warning' | 'error';
type TimelineType =
	| 'session'
	| 'message'
	| 'tool_execution'
	| 'llm_call'
	| 'operation'
	| 'context_shift'
	| 'timing'
	| 'turn_run'
	| 'prompt_snapshot'
	| 'turn_event'
	| 'eval_run';

export interface TimelineEvent {
	id: string;
	timestamp: string;
	type: TimelineType;
	severity: TimelineSeverity;
	title: string;
	summary: string;
	turn_index: number | null;
	payload: Record<string, unknown>;
}

interface SessionUserRow {
	id?: string | null;
	email?: string | null;
	name?: string | null;
}

export interface SessionRow {
	id: string;
	user_id: string;
	title?: string | null;
	auto_title?: string | null;
	summary?: string | null;
	status?: string | null;
	context_type?: string | null;
	entity_id?: string | null;
	message_count?: number | string | null;
	total_tokens_used?: number | string | null;
	tool_call_count?: number | string | null;
	created_at?: string | null;
	updated_at?: string | null;
	last_message_at?: string | null;
	agent_metadata?: unknown;
	users?: SessionUserRow | null;
}

export interface MessageRow {
	id: string;
	role?: string | null;
	content?: string | null;
	created_at?: string | null;
	metadata?: unknown;
	tool_call_id?: string | null;
	tool_calls?: unknown;
	tool_name?: string | null;
	tool_result?: unknown;
	prompt_tokens?: number | string | null;
	completion_tokens?: number | string | null;
	total_tokens?: number | string | null;
	message_type?: string | null;
	error_message?: string | null;
	error_code?: string | null;
	operation_ids?: unknown;
}

export interface ToolExecutionRow {
	id: string;
	message_id?: string | null;
	turn_run_id?: string | null;
	stream_run_id?: string | null;
	client_turn_id?: string | null;
	tool_name?: string | null;
	tool_category?: string | null;
	gateway_op?: string | null;
	help_path?: string | null;
	sequence_index?: number | string | null;
	arguments?: unknown;
	result?: unknown;
	execution_time_ms?: number | string | null;
	tokens_consumed?: number | string | null;
	success?: boolean | null;
	error_message?: string | null;
	requires_user_action?: boolean | null;
	created_at?: string | null;
}

export interface LlmCallRow {
	id: string;
	turn_run_id?: string | null;
	stream_run_id?: string | null;
	client_turn_id?: string | null;
	operation_type?: string | null;
	model_requested?: string | null;
	model_used?: string | null;
	provider?: string | null;
	status?: string | null;
	error_message?: string | null;
	prompt_tokens?: number | string | null;
	completion_tokens?: number | string | null;
	total_tokens?: number | string | null;
	total_cost_usd?: number | string | null;
	response_time_ms?: number | string | null;
	request_started_at?: string | null;
	request_completed_at?: string | null;
	created_at?: string | null;
	metadata?: unknown;
	openrouter_request_id?: string | null;
	openrouter_cache_status?: string | null;
	streaming?: boolean | null;
}

export interface OperationRow {
	id: string;
	operation_type?: string | null;
	table_name?: string | null;
	status?: string | null;
	reasoning?: string | null;
	data?: unknown;
	result?: unknown;
	error_message?: string | null;
	duration_ms?: number | string | null;
	created_at?: string | null;
	executed_at?: string | null;
	sequence_number?: number | string | null;
}

export interface TimingDataRow extends Record<string, unknown> {
	id?: string | null;
	message_received_at?: string | null;
	created_at?: string | null;
	time_to_first_response_ms?: number | string | null;
	time_to_first_event_ms?: number | string | null;
}

export interface TurnRunRow {
	id: string;
	stream_run_id?: string | null;
	client_turn_id?: string | null;
	source?: string | null;
	context_type?: string | null;
	entity_id?: string | null;
	project_id?: string | null;
	gateway_enabled?: boolean | null;
	request_message?: string | null;
	user_message_id?: string | null;
	assistant_message_id?: string | null;
	status?: string | null;
	finished_reason?: string | null;
	tool_round_count?: number | string | null;
	tool_call_count?: number | string | null;
	validation_failure_count?: number | string | null;
	llm_pass_count?: number | string | null;
	first_lane?: string | null;
	first_help_path?: string | null;
	first_skill_path?: string | null;
	first_canonical_op?: string | null;
	history_strategy?: string | null;
	history_compressed?: boolean | null;
	raw_history_count?: number | string | null;
	history_for_model_count?: number | string | null;
	cache_source?: string | null;
	cache_age_seconds?: number | string | null;
	request_prewarmed_context?: boolean | null;
	prompt_snapshot_id?: string | null;
	timing_metric_id?: string | null;
	started_at?: string | null;
	finished_at?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
}

export interface PromptSnapshotRow {
	id: string;
	turn_run_id?: string | null;
	snapshot_version?: string | null;
	system_prompt?: string | null;
	model_messages?: unknown;
	tool_definitions?: unknown;
	request_payload?: unknown;
	prompt_sections?: unknown;
	context_payload?: unknown;
	rendered_dump_text?: string | null;
	system_prompt_sha256?: string | null;
	messages_sha256?: string | null;
	tools_sha256?: string | null;
	system_prompt_chars?: number | string | null;
	message_chars?: number | string | null;
	approx_prompt_tokens?: number | string | null;
	created_at?: string | null;
}

export interface TurnEventRow {
	id: string;
	turn_run_id?: string | null;
	stream_run_id?: string | null;
	sequence_index?: number | string | null;
	phase?: string | null;
	event_type?: string | null;
	payload?: unknown;
	created_at?: string | null;
}

export interface PromptEvalRunRow {
	id: string;
	turn_run_id?: string | null;
	scenario_slug?: string | null;
	scenario_version?: string | null;
	runner_type?: string | null;
	status?: string | null;
	summary?: unknown;
	started_at?: string | null;
	completed_at?: string | null;
	created_by?: string | null;
	created_at?: string | null;
}

export interface PromptEvalAssertionRow {
	id: string;
	eval_run_id?: string | null;
	assertion_key?: string | null;
	status?: string | null;
	expected?: unknown;
	actual?: unknown;
	details?: string | null;
	created_at?: string | null;
}

export interface SessionPromptEvalPayload {
	id: string;
	scenario_slug: string;
	scenario_version: string;
	runner_type: string;
	status: string;
	summary: Record<string, unknown>;
	started_at: string;
	completed_at: string | null;
	created_by: string | null;
	assertions: PromptEvalAssertionRow[];
}

export interface SessionTurnRunPayload {
	id: string;
	turn_index: number;
	stream_run_id: string | null;
	client_turn_id: string | null;
	status: string;
	finished_reason: string | null;
	context_type: string;
	entity_id: string | null;
	project_id: string | null;
	gateway_enabled: boolean;
	request_message: string;
	user_message_id: string | null;
	assistant_message_id: string | null;
	tool_round_count: number;
	tool_call_count: number;
	validation_failure_count: number;
	llm_pass_count: number;
	first_lane: string | null;
	first_help_path: string | null;
	first_skill_path: string | null;
	first_canonical_op: string | null;
	history_strategy: string | null;
	history_compressed: boolean | null;
	raw_history_count: number;
	history_for_model_count: number;
	cache_source: string | null;
	cache_age_seconds: number;
	request_prewarmed_context: boolean;
	started_at: string;
	finished_at: string | null;
	prompt_snapshot: PromptSnapshotRow | null;
	events: TurnEventRow[];
	eval_runs: SessionPromptEvalPayload[];
}

interface LinkedTurnToolArtifacts {
	toolExecution: ToolExecutionRow | null;
	toolMessage: MessageRow | null;
}

const COST_PER_MILLION_TOKENS_USD = 0.21;

const asNumber = (value: unknown): number => {
	if (typeof value === 'number') return value;
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
};

const toIsoOrFallback = (value: string | null | undefined, fallback: string): string =>
	value ?? fallback;

const summarizeText = (value: string | null | undefined, maxChars = 160): string => {
	const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
	if (!normalized) return '';
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
};

const sessionTitle = (session: SessionRow, firstUserMessage?: string | null): string => {
	const explicit = session.title?.trim() || session.auto_title?.trim();
	if (explicit) return explicit;
	if (session.summary?.trim()) return summarizeText(session.summary, 120);
	if (firstUserMessage?.trim()) return summarizeText(firstUserMessage, 120);
	const contextType = (session.context_type ?? 'global').replaceAll('_', ' ');
	return `Agent Session (${contextType})`;
};

const resolveTurnIndex = (timestamp: string, userMessageTimestamps: string[]): number | null => {
	if (!userMessageTimestamps.length) return null;
	let turn = 0;
	for (const userTs of userMessageTimestamps) {
		if (userTs <= timestamp) turn += 1;
	}
	return turn > 0 ? turn : null;
};

const formatCost = (value: number): string => `$${value.toFixed(4)}`;

const parseToolTraceFromMessageMetadata = (metadata: unknown): Array<Record<string, unknown>> => {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
	const trace = (metadata as Record<string, unknown>).fastchat_tool_trace_v1;
	return Array.isArray(trace)
		? trace.filter(
				(entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object'
			)
		: [];
};

const isToolOutcomeTurnEvent = (event: TurnEventRow): boolean =>
	event.event_type === 'tool_result_received' ||
	event.event_type === 'tool_call_validation_failed';

const compareToolExecutions = (a: ToolExecutionRow, b: ToolExecutionRow): number => {
	const sequenceDiff = asNumber(a.sequence_index) - asNumber(b.sequence_index);
	if (sequenceDiff !== 0) return sequenceDiff;

	const left = toIsoOrFallback(a.created_at, '');
	const right = toIsoOrFallback(b.created_at, '');
	if (left !== right) return left < right ? -1 : 1;

	return a.id.localeCompare(b.id);
};

const normalizeTurnEventPayload = (payload: unknown): Record<string, unknown> =>
	payload && typeof payload === 'object' && !Array.isArray(payload)
		? (payload as Record<string, unknown>)
		: { value: payload };

const stringRecordField = (record: Record<string, unknown>, key: string): string | null => {
	const value = record[key];
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const toLinkedToolExecutionPayload = (
	toolExecution: ToolExecutionRow
): Record<string, unknown> => ({
	id: toolExecution.id,
	message_id: toolExecution.message_id ?? null,
	turn_run_id: toolExecution.turn_run_id ?? null,
	stream_run_id: toolExecution.stream_run_id ?? null,
	client_turn_id: toolExecution.client_turn_id ?? null,
	tool_name: toolExecution.tool_name ?? null,
	tool_category: toolExecution.tool_category ?? null,
	gateway_op: toolExecution.gateway_op ?? null,
	help_path: toolExecution.help_path ?? null,
	sequence_index: toolExecution.sequence_index ?? null,
	success: toolExecution.success ?? null,
	execution_time_ms: toolExecution.execution_time_ms ?? null,
	tokens_consumed: toolExecution.tokens_consumed ?? null,
	error_message: toolExecution.error_message ?? null,
	requires_user_action: toolExecution.requires_user_action ?? null,
	arguments: toolExecution.arguments ?? null,
	result: toolExecution.result ?? null,
	created_at: toolExecution.created_at ?? null
});

const toLinkedToolMessagePayload = (message: MessageRow): Record<string, unknown> => ({
	id: message.id,
	role: message.role ?? null,
	content: message.content ?? null,
	message_type: message.message_type ?? null,
	tool_call_id: message.tool_call_id ?? null,
	tool_name: message.tool_name ?? null,
	tool_result: message.tool_result ?? null,
	error_message: message.error_message ?? null,
	created_at: message.created_at ?? null
});

const enrichTurnToolArtifacts = (
	payload: Record<string, unknown>,
	artifacts: LinkedTurnToolArtifacts
): Record<string, unknown> => {
	const toolResultSource = artifacts.toolExecution
		? 'chat_tool_executions'
		: artifacts.toolMessage?.tool_result !== undefined
			? 'chat_messages'
			: null;

	return {
		...payload,
		...(artifacts.toolExecution
			? {
					tool_execution_id: artifacts.toolExecution.id,
					tool_execution_time_ms: artifacts.toolExecution.execution_time_ms ?? null,
					tool_execution_error: artifacts.toolExecution.error_message ?? null,
					tool_arguments: artifacts.toolExecution.arguments ?? null,
					tool_result: artifacts.toolExecution.result ?? null,
					linked_tool_execution: toLinkedToolExecutionPayload(artifacts.toolExecution)
				}
			: {}),
		...(artifacts.toolMessage
			? {
					tool_message_id: artifacts.toolMessage.id,
					linked_tool_message: toLinkedToolMessagePayload(artifacts.toolMessage)
				}
			: {}),
		...(toolResultSource ? { tool_result_source: toolResultSource } : {})
	};
};

const linkToolArtifactsToTurnEvents = (params: {
	events: TurnEventRow[];
	toolExecutions: ToolExecutionRow[];
	toolMessagesByToolCallId: Map<string, MessageRow>;
}): TurnEventRow[] => {
	const usedToolExecutionIds = new Set<string>();
	let toolOutcomeOrdinal = 0;

	return params.events.map((event) => {
		if (!isToolOutcomeTurnEvent(event)) return event;

		toolOutcomeOrdinal += 1;
		const payload = normalizeTurnEventPayload(event.payload);
		const toolCallId = stringRecordField(payload, 'tool_call_id');
		const toolName = stringRecordField(payload, 'tool_name');
		const canonicalOp = stringRecordField(payload, 'canonical_op');
		const toolMessage = toolCallId
			? (params.toolMessagesByToolCallId.get(toolCallId) ?? null)
			: null;
		const toolExecution = selectMatchingToolExecution(
			params.toolExecutions,
			usedToolExecutionIds,
			{
				ordinal: toolOutcomeOrdinal,
				toolName,
				canonicalOp
			}
		);

		if (toolExecution) {
			usedToolExecutionIds.add(toolExecution.id);
		}

		if (!toolExecution && !toolMessage) {
			return {
				...event,
				payload
			};
		}

		return {
			...event,
			payload: enrichTurnToolArtifacts(payload, {
				toolExecution,
				toolMessage
			})
		};
	});
};

const selectMatchingToolExecution = (
	candidates: ToolExecutionRow[],
	usedToolExecutionIds: Set<string>,
	params: {
		ordinal: number;
		toolName: string | null;
		canonicalOp: string | null;
	}
): ToolExecutionRow | null => {
	const unusedCandidates = candidates.filter(
		(candidate) => !usedToolExecutionIds.has(candidate.id)
	);
	if (!unusedCandidates.length) return null;

	const sequenceMatch = unusedCandidates.find((candidate) => {
		if (asNumber(candidate.sequence_index) !== params.ordinal) return false;
		if (params.toolName && candidate.tool_name && candidate.tool_name !== params.toolName) {
			return false;
		}
		if (
			params.canonicalOp &&
			candidate.gateway_op &&
			candidate.gateway_op !== params.canonicalOp
		) {
			return false;
		}
		return true;
	});
	if (sequenceMatch) return sequenceMatch;

	if (params.toolName) {
		const toolNameMatch = unusedCandidates.find(
			(candidate) => candidate.tool_name === params.toolName
		);
		if (toolNameMatch) return toolNameMatch;
	}

	if (params.canonicalOp) {
		const opMatch = unusedCandidates.find(
			(candidate) => candidate.gateway_op === params.canonicalOp
		);
		if (opMatch) return opMatch;
	}

	return unusedCandidates[0] ?? null;
};

export interface SessionDetailPayload {
	session: {
		id: string;
		title: string;
		user: { id: string; email: string; name: string };
		context_type: string;
		context_id: string | null;
		status: string;
		message_count: number;
		total_tokens: number;
		tool_call_count: number;
		llm_call_count: number;
		cost_estimate: number;
		has_errors: boolean;
		created_at: string;
		updated_at: string;
		last_message_at: string | null;
		agent_metadata: Record<string, unknown>;
	};
	metrics: {
		total_tokens: number;
		total_cost_usd: number;
		tool_calls: number;
		tool_failures: number;
		llm_calls: number;
		llm_failures: number;
		messages: number;
	};
	messages: MessageRow[];
	tool_executions: ToolExecutionRow[];
	llm_calls: LlmCallRow[];
	operations: OperationRow[];
	timeline: TimelineEvent[];
	timing_metrics: TimingDataRow | null;
	turn_runs: SessionTurnRunPayload[];
}

interface BuildPayloadInput {
	sessionRow: SessionRow;
	messages: MessageRow[];
	toolExecutions: ToolExecutionRow[];
	llmCalls: LlmCallRow[];
	operations: OperationRow[];
	timingData: TimingDataRow | null;
	turnRuns: TurnRunRow[];
	promptSnapshots: PromptSnapshotRow[];
	turnEvents: TurnEventRow[];
	evalRuns: PromptEvalRunRow[];
	evalAssertions: PromptEvalAssertionRow[];
}

export const buildSessionDetailPayload = ({
	sessionRow,
	messages,
	toolExecutions,
	llmCalls,
	operations,
	timingData,
	turnRuns,
	promptSnapshots,
	turnEvents,
	evalRuns,
	evalAssertions
}: BuildPayloadInput): SessionDetailPayload => {
	const sessionCreatedAt = toIsoOrFallback(sessionRow.created_at, new Date().toISOString());
	const userMessageTimestamps = messages
		.filter((row) => row.role === 'user' && typeof row.created_at === 'string')
		.map((row) => row.created_at as string);

	const firstUserMessage = messages.find((row) => row.role === 'user')?.content ?? null;
	const computedTitle = sessionTitle(sessionRow, firstUserMessage);

	const messageTokenTotal = messages.reduce((sum, row) => sum + asNumber(row.total_tokens), 0);
	const usageTokenTotal = llmCalls.reduce((sum, row) => sum + asNumber(row.total_tokens), 0);
	const usageCostTotal = llmCalls.reduce((sum, row) => sum + asNumber(row.total_cost_usd), 0);
	const toolCallCountFromTrace = messages.reduce((sum, row) => {
		return sum + parseToolTraceFromMessageMetadata(row.metadata).length;
	}, 0);

	const totalTokens = Number(
		sessionRow.total_tokens_used ?? usageTokenTotal ?? messageTokenTotal ?? 0
	);
	const totalCost =
		usageCostTotal > 0
			? usageCostTotal
			: (totalTokens / 1_000_000) * COST_PER_MILLION_TOKENS_USD;
	const toolCallCount = Number(
		toolExecutions.length || sessionRow.tool_call_count || toolCallCountFromTrace
	);
	const promptSnapshotByTurnRunId = new Map<string, PromptSnapshotRow>();
	for (const snapshot of promptSnapshots) {
		if (snapshot.turn_run_id) {
			promptSnapshotByTurnRunId.set(snapshot.turn_run_id, snapshot);
		}
	}
	const toolExecutionsByTurnRunId = new Map<string, ToolExecutionRow[]>();
	for (const toolExecution of toolExecutions) {
		if (!toolExecution.turn_run_id) continue;
		const existing = toolExecutionsByTurnRunId.get(toolExecution.turn_run_id) ?? [];
		existing.push(toolExecution);
		toolExecutionsByTurnRunId.set(toolExecution.turn_run_id, existing);
	}
	for (const entry of toolExecutionsByTurnRunId.values()) {
		entry.sort(compareToolExecutions);
	}
	const toolMessagesByToolCallId = new Map<string, MessageRow>();
	for (const message of messages) {
		if (!message.tool_call_id) continue;
		const existing = toolMessagesByToolCallId.get(message.tool_call_id);
		if (!existing || existing.role !== 'tool' || message.role === 'tool') {
			toolMessagesByToolCallId.set(message.tool_call_id, message);
		}
	}
	const eventsByTurnRunId = new Map<string, TurnEventRow[]>();
	for (const event of turnEvents) {
		if (!event.turn_run_id) continue;
		const existing = eventsByTurnRunId.get(event.turn_run_id) ?? [];
		existing.push(event);
		eventsByTurnRunId.set(event.turn_run_id, existing);
	}
	for (const [turnRunId, entry] of eventsByTurnRunId.entries()) {
		entry.sort((a, b) => asNumber(a.sequence_index) - asNumber(b.sequence_index));
		eventsByTurnRunId.set(
			turnRunId,
			linkToolArtifactsToTurnEvents({
				events: entry,
				toolExecutions: toolExecutionsByTurnRunId.get(turnRunId) ?? [],
				toolMessagesByToolCallId
			})
		);
	}
	const assertionsByEvalRunId = new Map<string, PromptEvalAssertionRow[]>();
	for (const assertion of evalAssertions) {
		if (!assertion.eval_run_id) continue;
		const existing = assertionsByEvalRunId.get(assertion.eval_run_id) ?? [];
		existing.push(assertion);
		assertionsByEvalRunId.set(assertion.eval_run_id, existing);
	}
	const evalRunsByTurnRunId = new Map<string, SessionPromptEvalPayload[]>();
	for (const evalRun of evalRuns) {
		if (!evalRun.turn_run_id) continue;
		const existing = evalRunsByTurnRunId.get(evalRun.turn_run_id) ?? [];
		existing.push({
			id: evalRun.id,
			scenario_slug: evalRun.scenario_slug ?? 'unknown',
			scenario_version: evalRun.scenario_version ?? 'unknown',
			runner_type: evalRun.runner_type ?? 'unknown',
			status: evalRun.status ?? 'unknown',
			summary:
				evalRun.summary &&
				typeof evalRun.summary === 'object' &&
				!Array.isArray(evalRun.summary)
					? (evalRun.summary as Record<string, unknown>)
					: {},
			started_at: toIsoOrFallback(evalRun.started_at ?? evalRun.created_at, sessionCreatedAt),
			completed_at: evalRun.completed_at ?? null,
			created_by: evalRun.created_by ?? null,
			assertions: (assertionsByEvalRunId.get(evalRun.id) ?? []).sort((a, b) =>
				toIsoOrFallback(a.created_at, sessionCreatedAt).localeCompare(
					toIsoOrFallback(b.created_at, sessionCreatedAt)
				)
			)
		});
		evalRunsByTurnRunId.set(evalRun.turn_run_id, existing);
	}
	const orderedTurnRuns = [...turnRuns].sort((a, b) => {
		const left = toIsoOrFallback(a.started_at ?? a.created_at, sessionCreatedAt);
		const right = toIsoOrFallback(b.started_at ?? b.created_at, sessionCreatedAt);
		if (left === right) return a.id.localeCompare(b.id);
		return left < right ? -1 : 1;
	});
	const sessionTurnRuns: SessionTurnRunPayload[] = orderedTurnRuns.map((turnRun, index) => ({
		id: turnRun.id,
		turn_index: index + 1,
		stream_run_id: turnRun.stream_run_id ?? null,
		client_turn_id: turnRun.client_turn_id ?? null,
		status: turnRun.status ?? 'running',
		finished_reason: turnRun.finished_reason ?? null,
		context_type: turnRun.context_type ?? sessionRow.context_type ?? 'global',
		entity_id: turnRun.entity_id ?? null,
		project_id: turnRun.project_id ?? null,
		gateway_enabled: turnRun.gateway_enabled === true,
		request_message: turnRun.request_message ?? '',
		user_message_id: turnRun.user_message_id ?? null,
		assistant_message_id: turnRun.assistant_message_id ?? null,
		tool_round_count: asNumber(turnRun.tool_round_count),
		tool_call_count: asNumber(turnRun.tool_call_count),
		validation_failure_count: asNumber(turnRun.validation_failure_count),
		llm_pass_count: asNumber(turnRun.llm_pass_count),
		first_lane: turnRun.first_lane ?? null,
		first_help_path: turnRun.first_help_path ?? null,
		first_skill_path: turnRun.first_skill_path ?? null,
		first_canonical_op: turnRun.first_canonical_op ?? null,
		history_strategy: turnRun.history_strategy ?? null,
		history_compressed:
			typeof turnRun.history_compressed === 'boolean' ? turnRun.history_compressed : null,
		raw_history_count: asNumber(turnRun.raw_history_count),
		history_for_model_count: asNumber(turnRun.history_for_model_count),
		cache_source: turnRun.cache_source ?? null,
		cache_age_seconds: asNumber(turnRun.cache_age_seconds),
		request_prewarmed_context: turnRun.request_prewarmed_context === true,
		started_at: toIsoOrFallback(turnRun.started_at ?? turnRun.created_at, sessionCreatedAt),
		finished_at: turnRun.finished_at ?? null,
		prompt_snapshot: promptSnapshotByTurnRunId.get(turnRun.id) ?? null,
		events: eventsByTurnRunId.get(turnRun.id) ?? [],
		eval_runs: (evalRunsByTurnRunId.get(turnRun.id) ?? []).sort((a, b) =>
			b.started_at.localeCompare(a.started_at)
		)
	}));
	const turnIndexByTurnRunId = new Map<string, number>(
		sessionTurnRuns.map((turnRun) => [turnRun.id, turnRun.turn_index])
	);

	const timeline: TimelineEvent[] = [];
	timeline.push({
		id: `session:${sessionRow.id}`,
		timestamp: sessionCreatedAt,
		type: 'session',
		severity: 'info',
		title: 'Session Created',
		summary: `Context: ${sessionRow.context_type ?? 'global'} • Status: ${sessionRow.status ?? 'active'}`,
		turn_index: null,
		payload: {
			session_id: sessionRow.id,
			context_type: sessionRow.context_type,
			entity_id: sessionRow.entity_id,
			status: sessionRow.status
		}
	});

	for (const turnRun of sessionTurnRuns) {
		timeline.push({
			id: `turn_run:${turnRun.id}`,
			timestamp: turnRun.started_at,
			type: 'turn_run',
			severity:
				turnRun.status === 'failed'
					? 'error'
					: turnRun.status === 'cancelled'
						? 'warning'
						: 'info',
			title: `Turn ${turnRun.turn_index}: ${turnRun.status}`,
			summary: [
				turnRun.first_lane ? `lane=${turnRun.first_lane}` : null,
				turnRun.first_skill_path ? `skill=${turnRun.first_skill_path}` : null,
				turnRun.first_canonical_op ? `op=${turnRun.first_canonical_op}` : null,
				`${turnRun.tool_call_count} tool calls`,
				`${turnRun.llm_pass_count} LLM passes`
			]
				.filter(Boolean)
				.join(' • '),
			turn_index: turnRun.turn_index,
			payload: {
				id: turnRun.id,
				stream_run_id: turnRun.stream_run_id,
				client_turn_id: turnRun.client_turn_id,
				status: turnRun.status,
				finished_reason: turnRun.finished_reason,
				context_type: turnRun.context_type,
				entity_id: turnRun.entity_id,
				project_id: turnRun.project_id,
				gateway_enabled: turnRun.gateway_enabled,
				request_message: turnRun.request_message,
				tool_round_count: turnRun.tool_round_count,
				tool_call_count: turnRun.tool_call_count,
				validation_failure_count: turnRun.validation_failure_count,
				llm_pass_count: turnRun.llm_pass_count,
				first_lane: turnRun.first_lane,
				first_help_path: turnRun.first_help_path,
				first_skill_path: turnRun.first_skill_path,
				first_canonical_op: turnRun.first_canonical_op,
				history_strategy: turnRun.history_strategy,
				history_compressed: turnRun.history_compressed,
				raw_history_count: turnRun.raw_history_count,
				history_for_model_count: turnRun.history_for_model_count,
				cache_source: turnRun.cache_source,
				cache_age_seconds: turnRun.cache_age_seconds,
				request_prewarmed_context: turnRun.request_prewarmed_context,
				started_at: turnRun.started_at,
				finished_at: turnRun.finished_at
			}
		});

		if (turnRun.prompt_snapshot) {
			const snapshot = turnRun.prompt_snapshot;
			const snapshotTimestamp = toIsoOrFallback(snapshot.created_at, turnRun.started_at);
			timeline.push({
				id: `prompt_snapshot:${snapshot.id}`,
				timestamp: snapshotTimestamp,
				type: 'prompt_snapshot',
				severity: 'info',
				title: `Prompt Snapshot: Turn ${turnRun.turn_index}`,
				summary: `${asNumber(snapshot.approx_prompt_tokens)} est tokens • ${asNumber(snapshot.system_prompt_chars)} system chars • ${asNumber(snapshot.message_chars)} message chars`,
				turn_index: turnRun.turn_index,
				payload: {
					id: snapshot.id,
					turn_run_id: snapshot.turn_run_id,
					snapshot_version: snapshot.snapshot_version,
					approx_prompt_tokens: snapshot.approx_prompt_tokens,
					system_prompt_chars: snapshot.system_prompt_chars,
					message_chars: snapshot.message_chars,
					system_prompt_sha256: snapshot.system_prompt_sha256,
					messages_sha256: snapshot.messages_sha256,
					tools_sha256: snapshot.tools_sha256,
					prompt_sections: snapshot.prompt_sections,
					request_payload: snapshot.request_payload,
					context_payload: snapshot.context_payload,
					rendered_dump_text: snapshot.rendered_dump_text
				}
			});
		}

		for (const event of turnRun.events) {
			const eventTimestamp = toIsoOrFallback(event.created_at, turnRun.started_at);
			const payload =
				event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
					? (event.payload as Record<string, unknown>)
					: { value: event.payload };
			const severity: TimelineSeverity =
				event.event_type === 'tool_call_validation_failed'
					? 'error'
					: event.event_type === 'context_shift_emitted'
						? 'warning'
						: 'info';
			timeline.push({
				id: `turn_event:${event.id}`,
				timestamp: eventTimestamp,
				type: 'turn_event',
				severity,
				title: `Turn Event: ${event.event_type ?? 'event'}`,
				summary: summarizeText(
					[
						event.phase ? `phase=${event.phase}` : null,
						payload.path ? `path=${String(payload.path)}` : null,
						payload.canonical_op ? `op=${String(payload.canonical_op)}` : null,
						payload.tool_name ? `tool=${String(payload.tool_name)}` : null,
						payload.error ? `error=${String(payload.error)}` : null
					]
						.filter(Boolean)
						.join(' • '),
					220
				),
				turn_index: turnRun.turn_index,
				payload: {
					id: event.id,
					turn_run_id: event.turn_run_id,
					stream_run_id: event.stream_run_id,
					sequence_index: event.sequence_index,
					phase: event.phase,
					event_type: event.event_type,
					tool_call_id: stringRecordField(payload, 'tool_call_id'),
					tool_name: stringRecordField(payload, 'tool_name'),
					canonical_op: stringRecordField(payload, 'canonical_op'),
					success: typeof payload.success === 'boolean' ? payload.success : null,
					error: typeof payload.error === 'string' ? payload.error : null,
					duration_ms:
						typeof payload.duration_ms === 'number' ? payload.duration_ms : null,
					arguments: Object.prototype.hasOwnProperty.call(payload, 'tool_arguments')
						? payload.tool_arguments
						: Object.prototype.hasOwnProperty.call(payload, 'args')
							? payload.args
							: null,
					result: Object.prototype.hasOwnProperty.call(payload, 'tool_result')
						? payload.tool_result
						: Object.prototype.hasOwnProperty.call(payload, 'result')
							? payload.result
							: null,
					tool_result_source:
						typeof payload.tool_result_source === 'string'
							? payload.tool_result_source
							: null,
					linked_tool_execution:
						payload.linked_tool_execution &&
						typeof payload.linked_tool_execution === 'object' &&
						!Array.isArray(payload.linked_tool_execution)
							? payload.linked_tool_execution
							: null,
					linked_tool_message:
						payload.linked_tool_message &&
						typeof payload.linked_tool_message === 'object' &&
						!Array.isArray(payload.linked_tool_message)
							? payload.linked_tool_message
							: null,
					payload
				}
			});
		}

		for (const evalRun of turnRun.eval_runs) {
			timeline.push({
				id: `eval_run:${evalRun.id}`,
				timestamp: evalRun.started_at,
				type: 'eval_run',
				severity:
					evalRun.status === 'passed'
						? 'success'
						: evalRun.status === 'failed'
							? 'error'
							: 'warning',
				title: `Prompt Eval: ${evalRun.scenario_slug}`,
				summary: `${evalRun.status} • ${String(
					(evalRun.summary.assertion_counts as Record<string, unknown> | undefined)
						?.passed ?? 0
				)} passed • ${String(
					(evalRun.summary.assertion_counts as Record<string, unknown> | undefined)
						?.failed ?? 0
				)} failed`,
				turn_index: turnRun.turn_index,
				payload: {
					id: evalRun.id,
					scenario_slug: evalRun.scenario_slug,
					scenario_version: evalRun.scenario_version,
					runner_type: evalRun.runner_type,
					status: evalRun.status,
					summary: evalRun.summary,
					started_at: evalRun.started_at,
					completed_at: evalRun.completed_at,
					assertions: evalRun.assertions
				}
			});
		}
	}

	for (const message of messages) {
		const timestamp = toIsoOrFallback(message.created_at, sessionCreatedAt);
		const severity: TimelineSeverity = message.error_message ? 'error' : 'info';
		const roleLabel =
			message.role === 'user'
				? 'User'
				: message.role === 'assistant'
					? 'Assistant'
					: message.role === 'tool'
						? 'Tool'
						: message.role === 'system'
							? 'System'
							: 'Message';

		timeline.push({
			id: `message:${message.id}`,
			timestamp,
			type: 'message',
			severity,
			title: `${roleLabel} Message`,
			summary:
				summarizeText(message.content, 200) ||
				(message.error_message ? `Error: ${message.error_message}` : '(empty message)'),
			turn_index: resolveTurnIndex(timestamp, userMessageTimestamps),
			payload: {
				id: message.id,
				role: message.role,
				content: message.content,
				message_type: message.message_type,
				total_tokens: message.total_tokens,
				prompt_tokens: message.prompt_tokens,
				completion_tokens: message.completion_tokens,
				tool_call_id: message.tool_call_id,
				tool_name: message.tool_name,
				tool_calls: message.tool_calls,
				tool_result: message.tool_result,
				error_message: message.error_message,
				error_code: message.error_code,
				operation_ids: message.operation_ids,
				metadata: message.metadata
			}
		});

		const traceEntries = parseToolTraceFromMessageMetadata(message.metadata);
		traceEntries.forEach((entry, index) => {
			const success = entry.success === true;
			const traceTool =
				(typeof entry.op === 'string' && entry.op) ||
				(typeof entry.tool_name === 'string' && entry.tool_name) ||
				'tool';
			timeline.push({
				id: `trace:${message.id}:${index}`,
				timestamp,
				type: 'tool_execution',
				severity: success ? 'success' : 'error',
				title: `Tool Trace (${traceTool})`,
				summary: success
					? `${traceTool} completed`
					: `${traceTool} failed${typeof entry.error === 'string' ? `: ${entry.error}` : ''}`,
				turn_index: resolveTurnIndex(timestamp, userMessageTimestamps),
				payload: {
					source: 'assistant_message_metadata',
					message_id: message.id,
					trace_entry: entry
				}
			});
		});
	}

	for (const tool of toolExecutions) {
		const timestamp = toIsoOrFallback(tool.created_at, sessionCreatedAt);
		const success = tool.success === true;
		timeline.push({
			id: `tool:${tool.id}`,
			timestamp,
			type: 'tool_execution',
			severity: success ? 'success' : 'error',
			title: `Tool Execution: ${tool.tool_name}`,
			summary: success
				? `${tool.tool_name} succeeded${tool.execution_time_ms ? ` in ${tool.execution_time_ms}ms` : ''}`
				: `${tool.tool_name} failed${tool.error_message ? `: ${tool.error_message}` : ''}`,
			turn_index: resolveTurnIndex(timestamp, userMessageTimestamps),
			payload: {
				id: tool.id,
				message_id: tool.message_id,
				turn_run_id: tool.turn_run_id,
				stream_run_id: tool.stream_run_id,
				client_turn_id: tool.client_turn_id,
				tool_name: tool.tool_name,
				tool_category: tool.tool_category,
				gateway_op: tool.gateway_op,
				help_path: tool.help_path,
				sequence_index: tool.sequence_index,
				success: tool.success,
				execution_time_ms: tool.execution_time_ms,
				tokens_consumed: tool.tokens_consumed,
				error_message: tool.error_message,
				requires_user_action: tool.requires_user_action,
				arguments: tool.arguments,
				result: tool.result
			}
		});
	}

	for (const usage of llmCalls) {
		const timestamp = toIsoOrFallback(
			usage.request_started_at ?? usage.created_at,
			sessionCreatedAt
		);
		const severity: TimelineSeverity = usage.status !== 'success' ? 'error' : 'info';
		const tokenCount = asNumber(usage.total_tokens);
		const cost = asNumber(usage.total_cost_usd);
		const responseMs = asNumber(usage.response_time_ms);
		timeline.push({
			id: `llm:${usage.id}`,
			timestamp,
			type: 'llm_call',
			severity,
			title: `LLM Call: ${usage.model_used || usage.model_requested || 'unknown model'}`,
			summary: `${tokenCount} tokens • ${formatCost(cost)}${responseMs > 0 ? ` • ${Math.round(responseMs)}ms` : ''}`,
			turn_index: usage.turn_run_id
				? (turnIndexByTurnRunId.get(usage.turn_run_id) ??
					resolveTurnIndex(timestamp, userMessageTimestamps))
				: resolveTurnIndex(timestamp, userMessageTimestamps),
			payload: {
				id: usage.id,
				operation_type: usage.operation_type,
				model_requested: usage.model_requested,
				model_used: usage.model_used,
				provider: usage.provider,
				turn_run_id: usage.turn_run_id,
				stream_run_id: usage.stream_run_id,
				client_turn_id: usage.client_turn_id,
				status: usage.status,
				error_message: usage.error_message,
				prompt_tokens: usage.prompt_tokens,
				completion_tokens: usage.completion_tokens,
				total_tokens: usage.total_tokens,
				total_cost_usd: usage.total_cost_usd,
				response_time_ms: usage.response_time_ms,
				request_started_at: usage.request_started_at,
				request_completed_at: usage.request_completed_at,
				openrouter_request_id: usage.openrouter_request_id,
				openrouter_cache_status: usage.openrouter_cache_status,
				streaming: usage.streaming,
				metadata: usage.metadata
			}
		});
	}

	for (const operation of operations) {
		const timestamp = toIsoOrFallback(
			operation.executed_at ?? operation.created_at,
			sessionCreatedAt
		);
		const severity: TimelineSeverity =
			operation.status === 'failed' || operation.error_message ? 'error' : 'info';
		timeline.push({
			id: `operation:${operation.id}`,
			timestamp,
			type: 'operation',
			severity,
			title: `Operation: ${operation.operation_type}`,
			summary: `${operation.table_name}${operation.status ? ` • ${operation.status}` : ''}${operation.error_message ? ` • ${operation.error_message}` : ''}`,
			turn_index: resolveTurnIndex(timestamp, userMessageTimestamps),
			payload: {
				id: operation.id,
				operation_type: operation.operation_type,
				table_name: operation.table_name,
				status: operation.status,
				reasoning: operation.reasoning,
				duration_ms: operation.duration_ms,
				sequence_number: operation.sequence_number,
				error_message: operation.error_message,
				data: operation.data,
				result: operation.result
			}
		});
	}

	const metadata =
		sessionRow.agent_metadata && typeof sessionRow.agent_metadata === 'object'
			? (sessionRow.agent_metadata as Record<string, unknown>)
			: {};
	const maybeContextShift = metadata.fastchat_last_context_shift;
	const contextShift =
		maybeContextShift && typeof maybeContextShift === 'object'
			? (maybeContextShift as Record<string, unknown>)
			: null;

	if (contextShift) {
		const timestamp =
			typeof contextShift.shifted_at === 'string'
				? contextShift.shifted_at
				: sessionCreatedAt;
		timeline.push({
			id: `context_shift:${sessionRow.id}`,
			timestamp,
			type: 'context_shift',
			severity: 'warning',
			title: 'Context Shift',
			summary: `Switched to ${String(contextShift.context_type ?? 'unknown')} (${String(
				contextShift.entity_id ?? 'no entity'
			)})`,
			turn_index: resolveTurnIndex(timestamp, userMessageTimestamps),
			payload: contextShift
		});
	}

	if (timingData) {
		const timestamp = toIsoOrFallback(
			timingData.message_received_at ?? timingData.created_at,
			sessionCreatedAt
		);
		timeline.push({
			id: `timing:${timingData.id}`,
			timestamp,
			type: 'timing',
			severity: 'info',
			title: 'Timing Snapshot',
			summary: `TTFR: ${timingData.time_to_first_response_ms ?? '-'}ms • TTFE: ${timingData.time_to_first_event_ms ?? '-'}ms`,
			turn_index: resolveTurnIndex(timestamp, userMessageTimestamps),
			payload: timingData as Record<string, unknown>
		});
	}

	timeline.sort((a, b) => {
		if (a.timestamp === b.timestamp) return a.id.localeCompare(b.id);
		return a.timestamp < b.timestamp ? -1 : 1;
	});

	const hasErrors =
		messages.some((row) => !!row.error_message) ||
		toolExecutions.some((row) => row.success === false) ||
		llmCalls.some((row) => row.status !== 'success' || !!row.error_message) ||
		operations.some((row) => row.status === 'failed' || !!row.error_message) ||
		sessionTurnRuns.some(
			(row) =>
				row.status === 'failed' ||
				row.validation_failure_count > 0 ||
				row.events.some((event) => event.event_type === 'tool_call_validation_failed')
		);

	return {
		session: {
			id: sessionRow.id,
			title: computedTitle,
			user: {
				id: sessionRow.users?.id ?? sessionRow.user_id,
				email: sessionRow.users?.email ?? '',
				name: sessionRow.users?.name ?? ''
			},
			context_type: sessionRow.context_type ?? 'global',
			context_id: sessionRow.entity_id ?? null,
			status: sessionRow.status ?? 'active',
			message_count: Number(sessionRow.message_count ?? messages.length),
			total_tokens: totalTokens,
			tool_call_count: toolCallCount,
			llm_call_count: llmCalls.length,
			cost_estimate: totalCost,
			has_errors: hasErrors,
			created_at: sessionCreatedAt,
			updated_at: toIsoOrFallback(
				sessionRow.updated_at ?? sessionRow.last_message_at,
				sessionCreatedAt
			),
			last_message_at: sessionRow.last_message_at ?? null,
			agent_metadata: metadata
		},
		metrics: {
			total_tokens: totalTokens,
			total_cost_usd: totalCost,
			tool_calls: toolCallCount,
			tool_failures: toolExecutions.filter((row) => row.success === false).length,
			llm_calls: llmCalls.length,
			llm_failures: llmCalls.filter((row) => row.status !== 'success').length,
			messages: messages.length
		},
		messages,
		tool_executions: toolExecutions,
		llm_calls: llmCalls,
		operations,
		timeline,
		timing_metrics: timingData ?? null,
		turn_runs: sessionTurnRuns
	};
};
