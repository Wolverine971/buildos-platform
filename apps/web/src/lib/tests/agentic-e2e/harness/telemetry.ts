// apps/web/src/lib/tests/agentic-e2e/harness/telemetry.ts
//
// Read helpers for the three assertion surfaces: per-turn telemetry
// (chat_turn_runs / chat_tool_executions), and ground-truth onto_* rows.
// All reads use the service-role admin client (bypasses RLS).
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { STATED_FUTURE_SOURCE } from '$lib/server/stated-future.service';

export interface TurnRunRow {
	id: string;
	session_id: string;
	execution_mode: string;
	transport_contract_version: string | null;
	status: string;
	created_at: string;
	started_at: string;
	finished_at: string | null;
	finished_reason: string | null;
	tool_call_count: number;
	tool_round_count: number;
	llm_pass_count: number;
	validation_failure_count: number;
	first_canonical_op: string | null;
	assistant_message_id: string | null;
	user_message_id: string | null;
	timing_metric_id: string | null;
}

export interface ToolExecutionRow {
	provider_tool_call_id?: string | null;
	tool_name: string;
	success: boolean;
	gateway_op: string | null;
	sequence_index: number | null;
	execution_time_ms: number | null;
	arguments: unknown;
	result: unknown;
	affected_entities: AffectedEntity[];
}

export interface LlmUsageLogRow {
	id: string;
	model_requested: string;
	model_used: string;
	provider: string | null;
	profile: string | null;
	operation_type: string;
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
	total_cost_usd: number;
	request_started_at: string;
	request_completed_at: string;
}

export interface ExecutionObservationRow {
	execution_generation: number;
	phase: string;
	event_type: string;
	observed_at: string;
	payload: unknown;
}

export interface ReadPlanningSummary {
	evidenceReadCallCount: number;
	uniqueExactReadCount: number;
	exactDuplicateCount: number;
	uniqueResourceCount: number;
	additionalProjectionCount: number;
	evidenceProviderRoundCount: number;
	controlProviderRoundCount: number;
	firstCompleteEvidenceRound: number | null;
	memoServedCount: number;
	justifiedPostMutationRereadCount: number;
	mutationCallCount: number;
	replayedMutationCount: number;
	rejectedCallCount: number;
	providerRetryCount: number;
	evidenceRoundWidths: number[];
	graphLayerWidths: number[];
}

export interface StreamUsageSummary {
	requestCount: number;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	totalCostUsd: number;
	models: string[];
	providers: string[];
	profiles: string[];
	operations: string[];
}

export interface AffectedEntity {
	kind?: string;
	id?: string;
	title?: string;
	operation?: string;
	projectId?: string;
	url?: string;
}

export interface DocumentRow {
	id: string;
	project_id: string;
	title: string;
	content: string | null;
	type_key: string;
	state_key: string;
	updated_at: string;
}

export interface TaskRow {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	priority: number | null;
	due_at: string | null;
	start_at: string | null;
	state_key: string;
	type_key: string;
	completed_at: string | null;
	archived_at: string | null;
	deleted_at: string | null;
	facet_scale: string | null;
	idempotency_key: string | null;
	props: unknown;
	created_at: string;
	created_by: string;
	updated_at: string;
}

export interface MilestoneRow {
	id: string;
	project_id: string;
	title: string;
	due_at: string | null;
	state_key: string;
}

export interface GoalRow {
	id: string;
	project_id: string;
	name: string;
	description: string | null;
	state_key: string;
	target_date: string | null;
}

export interface PlanRow {
	id: string;
	project_id: string;
	name: string;
	state_key: string;
}

export interface DocumentTreeNode {
	id: string;
	title: string | null;
	order: number;
	children: DocumentTreeNode[];
}

export interface ProjectDocumentTree {
	version: number;
	root: DocumentTreeNode[];
}

export interface ProjectRow {
	id: string;
	name: string;
	type_key: string;
	description: string | null;
}

/** Exact-name lookup used to capture a project created during a project_create turn. */
export async function listProjectsByExactName(
	admin: TypedSupabaseClient,
	actorId: string,
	name: string
): Promise<ProjectRow[]> {
	const { data, error } = await admin
		.from('onto_projects')
		.select('id, name, type_key, description')
		.eq('created_by', actorId)
		.eq('name', name);
	if (error) {
		throw new Error(`[agentic-e2e] failed to find created project "${name}": ${error.message}`);
	}
	return (data as ProjectRow[] | null) ?? [];
}

/** The single turn row for a stream_run_id (may be null if not yet persisted). */
export async function getTurnRun(
	admin: TypedSupabaseClient,
	streamRunId: string
): Promise<TurnRunRow | null> {
	const { data } = await admin
		.from('chat_turn_runs')
		.select(
			'id, session_id, execution_mode, transport_contract_version, status, created_at, started_at, finished_at, finished_reason, tool_call_count, tool_round_count, llm_pass_count, validation_failure_count, first_canonical_op, assistant_message_id, user_message_id, timing_metric_id'
		)
		.eq('stream_run_id', streamRunId)
		.maybeSingle();
	return (data as TurnRunRow | null) ?? null;
}

/** Every persisted turn run for one chat session, oldest first. */
export async function listTurnRunsForSession(
	admin: TypedSupabaseClient,
	sessionId: string
): Promise<TurnRunRow[]> {
	const { data, error } = await admin
		.from('chat_turn_runs')
		.select(
			'id, session_id, execution_mode, transport_contract_version, status, created_at, started_at, finished_at, finished_reason, tool_call_count, tool_round_count, llm_pass_count, validation_failure_count, first_canonical_op, assistant_message_id, user_message_id, timing_metric_id'
		)
		.eq('session_id', sessionId)
		.order('created_at', { ascending: true });
	if (error) {
		throw new Error(
			`[agentic-e2e] failed to read chat_turn_runs for session ${sessionId}: ${error.message}`
		);
	}
	return (data as TurnRunRow[] | null) ?? [];
}

/**
 * Retire a still-`running` turn row after it has been observed and checked. The
 * per-session admission guard rejects a new turn while the previous one is
 * `running`; local `vite dev` can leave that lock behind. Marking the row
 * cancelled records the harness intervention without fabricating a successful
 * completion. No-op when the server already finalized the row.
 */
export async function releaseTurnForFollowup(
	admin: TypedSupabaseClient,
	streamRunId: string | null
): Promise<void> {
	if (!streamRunId) return;
	const { error } = await admin
		.from('chat_turn_runs')
		.update({
			status: 'cancelled',
			finished_reason: 'agentic_e2e_followup_release_after_observation',
			finished_at: new Date().toISOString()
		})
		.eq('stream_run_id', streamRunId)
		.eq('status', 'running');
	if (error) {
		throw new Error(`[agentic-e2e] failed to release follow-up turn lock: ${error.message}`);
	}
}

/**
 * Delete one exact harness-owned chat session and its cascading test data.
 * Worker stream-state and signal rows deliberately enforce a seven-day
 * retention window with ON DELETE RESTRICT, so worker evidence runs retain the
 * owning session until that production control-row window expires.
 */
export async function teardownChatSession(
	admin: TypedSupabaseClient,
	userId: string,
	sessionId: string | null | undefined,
	options: { retainForWorkerControlRowRetention?: boolean } = {}
): Promise<void> {
	if (!sessionId) return;
	if (options.retainForWorkerControlRowRetention) return;
	const { data, error } = await admin
		.from('chat_sessions')
		.delete()
		.eq('id', sessionId)
		.eq('user_id', userId)
		.select('id')
		.maybeSingle();
	if (error) {
		throw new Error(
			`[agentic-e2e] failed to delete chat session ${sessionId}: ${error.message}`
		);
	}
	if (!data) {
		throw new Error(`[agentic-e2e] chat session ${sessionId} was not deleted`);
	}
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

/**
 * Poll for the turn's telemetry row until it reaches a terminal status (or
 * timeout). The `done` SSE event can arrive a beat before the DB write of
 * status='completed' lands, so assertions should wait on this first.
 */
export async function waitForTurnRun(
	admin: TypedSupabaseClient,
	streamRunId: string,
	options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<TurnRunRow | null> {
	// Local `vite dev` never finalizes these rows, so don't burn 15s polling for a
	// terminal status that won't come unless we're asserting telemetry strictly.
	const strict = process.env.AGENTIC_ASSERT_TELEMETRY === 'true';
	const timeoutMs = options.timeoutMs ?? (strict ? 15000 : 1500);
	const intervalMs = options.intervalMs ?? 400;
	const deadline = Date.now() + timeoutMs;
	let last: TurnRunRow | null = null;
	while (Date.now() < deadline) {
		last = await getTurnRun(admin, streamRunId);
		if (last && TERMINAL_STATUSES.has(last.status)) return last;
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	return last;
}

/** All tool executions for a stream_run_id, in call order. */
export async function getToolExecutions(
	admin: TypedSupabaseClient,
	streamRunId: string
): Promise<ToolExecutionRow[]> {
	const { data } = await admin
		.from('chat_tool_executions')
		.select(
			'provider_tool_call_id, tool_name, success, gateway_op, sequence_index, execution_time_ms, arguments, result, affected_entities'
		)
		.eq('stream_run_id', streamRunId)
		.order('sequence_index', { ascending: true });
	return ((data as ToolExecutionRow[] | null) ?? []).map((row) => ({
		...row,
		affected_entities: Array.isArray(row.affected_entities)
			? (row.affected_entities as AffectedEntity[])
			: []
	}));
}

/** Wait for detached tool telemetry to reach the number observed on the SSE stream. */
export async function waitForToolExecutions(
	admin: TypedSupabaseClient,
	streamRunId: string,
	expectedCount: number,
	options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<ToolExecutionRow[]> {
	const timeoutMs = options.timeoutMs ?? 5_000;
	const intervalMs = options.intervalMs ?? 250;
	const deadline = Date.now() + timeoutMs;
	let last: ToolExecutionRow[] = [];
	do {
		last = await getToolExecutions(admin, streamRunId);
		if (last.length >= expectedCount) return last;
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	} while (Date.now() < deadline);
	return last;
}

/** All model-usage rows attributable to one streamed turn. */
export async function getUsageLogsForStreamRun(
	admin: TypedSupabaseClient,
	streamRunId: string
): Promise<LlmUsageLogRow[]> {
	const { data, error } = await admin
		.from('llm_usage_logs')
		.select(
			'id, model_requested, model_used, provider, profile, operation_type, prompt_tokens, completion_tokens, total_tokens, total_cost_usd, request_started_at, request_completed_at'
		)
		.eq('stream_run_id', streamRunId)
		.order('request_started_at', { ascending: true });
	if (error) {
		throw new Error(`[agentic-e2e] failed to read usage for ${streamRunId}: ${error.message}`);
	}
	return (data as LlmUsageLogRow[] | null) ?? [];
}

/** Redacted provider/tool boundary observations retained for one durable worker turn. */
export async function getExecutionObservations(
	admin: TypedSupabaseClient,
	turnRunId: string
): Promise<ExecutionObservationRow[]> {
	const { data, error } = await admin
		.from('agentic_chat_execution_observations')
		.select('execution_generation, phase, event_type, observed_at, payload')
		.eq('turn_run_id', turnRunId)
		.order('observed_at', { ascending: true })
		.order('id', { ascending: true });
	if (error) {
		throw new Error(
			`[agentic-e2e] failed to read execution observations for ${turnRunId}: ${error.message}`
		);
	}
	return (data as ExecutionObservationRow[] | null) ?? [];
}

/** Content-free read-planning attribution matching the durable SQL summary contract. */
export function summarizeReadPlanningObservations(
	rows: readonly ExecutionObservationRow[]
): ReadPlanningSummary {
	const calls = rows
		.map((row, index) => {
			const payload = telemetryRecord(row.payload);
			return {
				index,
				phase: row.phase,
				eventType: row.event_type,
				executionClass: telemetryText(payload.execution_class),
				logicalProviderRound: telemetryInteger(payload.logical_provider_round),
				sequenceIndex: telemetryInteger(payload.sequence_index),
				readEpoch: telemetryInteger(payload.read_epoch),
				exactReadKey: telemetrySha256(payload.exact_read_key),
				resourceKey: telemetrySha256(payload.resource_key),
				status: telemetryText(payload.status),
				memoServed: payload.memo_served === true,
				replayed: payload.replayed === true
			};
		})
		.filter(
			(call) =>
				call.phase === 'tool' &&
				call.eventType === 'tool_execution_ended' &&
				call.executionClass !== null
		)
		.sort(
			(left, right) =>
				(left.sequenceIndex ?? Number.MAX_SAFE_INTEGER) -
					(right.sequenceIndex ?? Number.MAX_SAFE_INTEGER) || left.index - right.index
		);
	const evidence = calls.filter((call) => call.executionClass === 'evidence_read');
	const providerRetryCount = rows.filter((row) => {
		const payload = telemetryRecord(row.payload);
		return (
			row.phase === 'provider' &&
			row.event_type === 'provider_attempt_ended' &&
			payload.attempt_kind === 'retry'
		);
	}).length;
	const exactKeys = new Set<string>();
	const resourceProjections = new Map<string, Set<string>>();
	const evidenceRoundWidths = new Map<number, number>();
	const controlRounds = new Set<number>();
	const successfulExactEpochs = new Map<string, Set<number>>();
	const firstSuccessfulRoundByExact = new Map<string, number>();
	let exactDuplicateCount = 0;
	let justifiedPostMutationRereadCount = 0;

	for (const call of calls) {
		if (
			(call.executionClass === 'control' || call.executionClass === 'review') &&
			call.logicalProviderRound !== null
		) {
			controlRounds.add(call.logicalProviderRound);
		}
		if (call.executionClass !== 'evidence_read') continue;
		if (call.logicalProviderRound !== null) {
			evidenceRoundWidths.set(
				call.logicalProviderRound,
				(evidenceRoundWidths.get(call.logicalProviderRound) ?? 0) + 1
			);
		}
		if (call.exactReadKey === null || call.readEpoch === null) continue;
		const readEpoch = call.readEpoch;
		exactKeys.add(call.exactReadKey);
		const successfulEpochs = successfulExactEpochs.get(call.exactReadKey) ?? new Set<number>();
		if (successfulEpochs.has(readEpoch)) exactDuplicateCount += 1;
		if ([...successfulEpochs].some((epoch) => epoch < readEpoch)) {
			justifiedPostMutationRereadCount += 1;
		}
		if (call.status === 'success') {
			successfulEpochs.add(readEpoch);
			successfulExactEpochs.set(call.exactReadKey, successfulEpochs);
			if (
				call.logicalProviderRound !== null &&
				!firstSuccessfulRoundByExact.has(call.exactReadKey)
			) {
				firstSuccessfulRoundByExact.set(call.exactReadKey, call.logicalProviderRound);
			}
		}
		if (call.resourceKey !== null) {
			const projections = resourceProjections.get(call.resourceKey) ?? new Set<string>();
			projections.add(call.exactReadKey);
			resourceProjections.set(call.resourceKey, projections);
		}
	}

	const graphLayers = new Map<string, { width: number; firstSequence: number }>();
	for (const row of rows) {
		if (row.phase !== 'tool') continue;
		const payload = telemetryRecord(row.payload);
		const graphPlanSha256 = telemetrySha256(payload.graph_plan_sha256);
		const graphLayerIndex = telemetryInteger(payload.graph_layer_index);
		const graphLayerWidth = telemetryInteger(payload.graph_layer_width);
		const sequenceIndex = telemetryInteger(payload.sequence_index);
		if (
			graphPlanSha256 === null ||
			graphLayerIndex === null ||
			graphLayerWidth === null ||
			sequenceIndex === null
		) {
			continue;
		}
		const key = `${graphPlanSha256}:${graphLayerIndex}`;
		const firstSequence = sequenceIndex;
		const existing = graphLayers.get(key);
		if (!existing || firstSequence < existing.firstSequence) {
			graphLayers.set(key, { width: graphLayerWidth, firstSequence });
		}
	}

	return {
		evidenceReadCallCount: evidence.length,
		uniqueExactReadCount: exactKeys.size,
		exactDuplicateCount,
		uniqueResourceCount: resourceProjections.size,
		additionalProjectionCount: [...resourceProjections.values()].reduce(
			(total, projections) => total + Math.max(projections.size - 1, 0),
			0
		),
		evidenceProviderRoundCount: evidenceRoundWidths.size,
		controlProviderRoundCount: controlRounds.size,
		firstCompleteEvidenceRound:
			firstSuccessfulRoundByExact.size === exactKeys.size && exactKeys.size > 0
				? Math.max(...firstSuccessfulRoundByExact.values())
				: null,
		memoServedCount: evidence.filter((call) => call.memoServed).length,
		justifiedPostMutationRereadCount,
		mutationCallCount: calls.filter((call) => call.executionClass === 'mutation').length,
		replayedMutationCount: calls.filter(
			(call) => call.executionClass === 'mutation' && call.replayed
		).length,
		rejectedCallCount: calls.filter((call) => call.executionClass === 'rejected').length,
		providerRetryCount,
		evidenceRoundWidths: [...evidenceRoundWidths.entries()]
			.sort(([left], [right]) => left - right)
			.map(([, width]) => width),
		graphLayerWidths: [...graphLayers.values()]
			.sort((left, right) => left.firstSequence - right.firstSequence)
			.map((layer) => layer.width)
	};
}

function telemetryRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function telemetryText(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function telemetryInteger(value: unknown): number | null {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function telemetrySha256(value: unknown): string | null {
	return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

export function summarizeUsageLogs(rows: LlmUsageLogRow[]): StreamUsageSummary {
	const unique = (values: Array<string | null>) =>
		Array.from(new Set(values.filter((value): value is string => Boolean(value))));
	return {
		requestCount: rows.length,
		promptTokens: rows.reduce((total, row) => total + row.prompt_tokens, 0),
		completionTokens: rows.reduce((total, row) => total + row.completion_tokens, 0),
		totalTokens: rows.reduce((total, row) => total + row.total_tokens, 0),
		totalCostUsd: rows.reduce((total, row) => total + row.total_cost_usd, 0),
		models: unique(rows.map((row) => row.model_used)),
		providers: unique(rows.map((row) => row.provider)),
		profiles: unique(rows.map((row) => row.profile)),
		operations: unique(rows.map((row) => row.operation_type))
	};
}

/**
 * Usage logging is asynchronous to the SSE response. Wait until at least one row
 * exists and the row set has remained unchanged for a quiet period.
 */
export async function waitForUsageSummary(
	admin: TypedSupabaseClient,
	streamRunId: string,
	options: { timeoutMs?: number; intervalMs?: number; quietPeriodMs?: number } = {}
): Promise<StreamUsageSummary> {
	const timeoutMs = options.timeoutMs ?? 10_000;
	const intervalMs = options.intervalMs ?? 250;
	const quietPeriodMs = options.quietPeriodMs ?? 2_000;
	const deadline = Date.now() + timeoutMs;
	let lastSignature = '';
	let stableSince = Date.now();
	let lastRows: LlmUsageLogRow[] = [];

	while (Date.now() < deadline) {
		lastRows = await getUsageLogsForStreamRun(admin, streamRunId);
		const signature = lastRows.map((row) => row.id).join(',');
		if (signature !== lastSignature) {
			lastSignature = signature;
			stableSince = Date.now();
		}
		if (lastRows.length > 0 && Date.now() - stableSince >= quietPeriodMs) {
			return summarizeUsageLogs(lastRows);
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}

	return summarizeUsageLogs(lastRows);
}

export interface EventRow {
	id: string;
	project_id: string | null;
	title: string;
	start_at: string;
}

/** All live events under a project — one of the four forward-carry surfaces. */
export async function listEvents(
	admin: TypedSupabaseClient,
	projectId: string
): Promise<EventRow[]> {
	const { data } = await admin
		.from('onto_events')
		.select('id, project_id, title, start_at')
		.eq('project_id', projectId)
		.is('deleted_at', null);
	return (data as EventRow[] | null) ?? [];
}

/** All live (non-deleted) documents under a project. */
export async function listDocuments(
	admin: TypedSupabaseClient,
	projectId: string
): Promise<DocumentRow[]> {
	const { data } = await admin
		.from('onto_documents')
		.select('id, project_id, title, content, type_key, state_key, updated_at')
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('updated_at', { ascending: false });
	return (data as DocumentRow[] | null) ?? [];
}

/** First live document under a project whose title contains `titlePart` (case-insensitive). */
export async function getDocumentByTitle(
	admin: TypedSupabaseClient,
	projectId: string,
	titlePart: string
): Promise<DocumentRow | null> {
	const docs = await listDocuments(admin, projectId);
	const needle = titlePart.toLowerCase();
	return docs.find((d) => d.title.toLowerCase().includes(needle)) ?? null;
}

export async function getDocumentById(
	admin: TypedSupabaseClient,
	id: string
): Promise<DocumentRow | null> {
	const { data } = await admin
		.from('onto_documents')
		.select('id, project_id, title, content, type_key, state_key, updated_at')
		.eq('id', id)
		.maybeSingle();
	return (data as DocumentRow | null) ?? null;
}

/** All live tasks under a project. */
export async function listTasks(admin: TypedSupabaseClient, projectId: string): Promise<TaskRow[]> {
	const { data } = await admin
		.from('onto_tasks')
		.select(
			'id, project_id, title, description, priority, due_at, start_at, state_key, type_key, completed_at, archived_at, deleted_at, facet_scale, idempotency_key, props, created_at, created_by, updated_at'
		)
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('updated_at', { ascending: false });
	return (data as TaskRow[] | null) ?? [];
}

export interface StatedFutureTaskRow {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	state_key: string;
	props: Record<string, unknown> | null;
}

/**
 * Tasks written by the deterministic stated-future floor
 * (`$lib/server/stated-future.service`, D1 2026-07-26), identified by ground-truth
 * provenance (`props.source === 'stated_future_capture'`) — never by title or
 * description text, which would be exactly the looksLike* escape hatch this
 * harness bans. The floor also stamps `props.source_stream_run_id` with the turn
 * that produced the capture; scenarios assert that linkage.
 */
export async function listStatedFutureTasks(
	admin: TypedSupabaseClient,
	projectId: string
): Promise<StatedFutureTaskRow[]> {
	const { data, error } = await admin
		.from('onto_tasks')
		.select('id, project_id, title, description, state_key, props')
		.eq('project_id', projectId)
		.is('deleted_at', null);
	if (error) {
		throw new Error(`[agentic-e2e] failed to read stated-future tasks: ${error.message}`);
	}
	const rows = (data as StatedFutureTaskRow[] | null) ?? [];
	return rows.filter(
		(row) => (row.props as { source?: unknown } | null)?.source === STATED_FUTURE_SOURCE
	);
}

/** All live goals under a project. */
export async function listGoals(admin: TypedSupabaseClient, projectId: string): Promise<GoalRow[]> {
	const { data } = await admin
		.from('onto_goals')
		.select('id, project_id, name, description, state_key, target_date')
		.eq('project_id', projectId)
		.is('deleted_at', null);
	return (data as GoalRow[] | null) ?? [];
}

/** All live plans under a project. */
export async function listPlans(admin: TypedSupabaseClient, projectId: string): Promise<PlanRow[]> {
	const { data } = await admin
		.from('onto_plans')
		.select('id, project_id, name, state_key')
		.eq('project_id', projectId)
		.is('deleted_at', null);
	return (data as PlanRow[] | null) ?? [];
}

/** All live milestones under a project. */
export async function listMilestones(
	admin: TypedSupabaseClient,
	projectId: string
): Promise<MilestoneRow[]> {
	const { data } = await admin
		.from('onto_milestones')
		.select('id, project_id, title, due_at, state_key')
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('due_at', { ascending: true });
	return (data as MilestoneRow[] | null) ?? [];
}

export async function getProjectDocumentTree(
	admin: TypedSupabaseClient,
	projectId: string
): Promise<ProjectDocumentTree> {
	const { data, error } = await admin
		.from('onto_projects')
		.select('doc_structure')
		.eq('id', projectId)
		.maybeSingle();
	if (error) {
		throw new Error(`[agentic-e2e] failed to read project document tree: ${error.message}`);
	}
	if (!data) throw new Error(`[agentic-e2e] project ${projectId} was not found`);
	const raw = data.doc_structure;
	const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
	return {
		version:
			typeof record.version === 'number' && Number.isFinite(record.version)
				? record.version
				: 1,
		root: normalizeDocumentTreeNodes(record.root)
	};
}

function normalizeDocumentTreeNodes(value: unknown): DocumentTreeNode[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((node) => {
		if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
		const record = node as Record<string, unknown>;
		if (typeof record.id !== 'string' || !record.id) return [];
		return [
			{
				id: record.id,
				title: typeof record.title === 'string' ? record.title : null,
				order:
					typeof record.order === 'number' && Number.isFinite(record.order)
						? record.order
						: 0,
				children: normalizeDocumentTreeNodes(record.children)
			}
		];
	});
}
