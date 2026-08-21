// apps/web/src/lib/tests/agentic-e2e/phase0/evidence-report.ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { AgentTimingSummary } from '@buildos/shared-types';

import {
	getExecutionObservations,
	waitForToolExecutions,
	waitForTurnRun,
	waitForUsageSummary,
	type ExecutionObservationRow,
	type StreamUsageSummary,
	type ToolExecutionRow,
	type TurnRunRow
} from '../harness/telemetry';
import type {
	Scenario,
	TurnEventTiming,
	TurnEvidenceCheckResult,
	TurnResult,
	TurnTiming
} from '../harness/types';
import type { CheckedTurnOutcome } from '../harness/turn-sequencing';
import type { AgenticE2EExecutionMode } from '../harness/worker-client';

export const PHASE0_EVIDENCE_SCHEMA_VERSION = 2 as const;

export interface Phase0RepositoryState {
	root: string;
	head: string;
	headTree: string;
	branch: string;
	dirty: boolean;
	status: string[];
}

export interface Phase0TableFootprint {
	table: string;
	retainedRows: number;
	approxJsonBytes: number;
	error: string | null;
}

export interface Phase0PersistenceFootprint {
	kind: 'retained_chat_path_rows_v1';
	tables: Phase0TableFootprint[];
	totalRetainedRows: number;
	totalApproxJsonBytes: number;
	measurementDurationMs: number | null;
	retainedRowsPerSecond: number | null;
	note: string;
}

export interface Phase0ToolExecutionEvidence {
	name: string;
	op: string | null;
	success: boolean;
	sequenceIndex: number | null;
	executionTimeMs: number | null;
	decidedBy: string | null;
}

export interface Phase0ControlDecisionEvidence {
	name: string;
	decidedBy: string | null;
	sequenceIndex: number | null;
}

export interface Phase0JudgeEvidence {
	status: 'not_configured' | 'not_reached' | 'passed' | 'failed' | 'error';
	threshold: number | null;
	score: number | null;
	passed: boolean | null;
	reasoning: string | null;
	error: string | null;
}

export interface Phase0ProviderUsageEvidence {
	promptTokens: number | null;
	completionTokens: number | null;
	totalTokens: number | null;
	reasoningTokens: number | null;
	cachedPromptTokens: number | null;
	cacheWriteTokens: number | null;
}

/**
 * Content-free projection of the database-enforced execution-observation allowlist.
 * Prompt, argument, result, and message bodies never enter the report.
 */
export interface Phase0ExecutionObservationEvidence {
	executionGeneration: number;
	phase: string;
	eventType: string;
	observedAt: string;
	round: number | null;
	logicalProviderRound: number | null;
	routeId: string | null;
	modelRequested: string | null;
	modelUsed: string | null;
	provider: string | null;
	status: string | null;
	durationMs: number | null;
	finishReason: string | null;
	errorClass: string | null;
	toolName: string | null;
	providerToolCallId: string | null;
	sequenceIndex: number | null;
	usage: Phase0ProviderUsageEvidence | null;
}

export type Phase0ResultClass =
	| 'end_to_end_pass'
	| 'transport_failure'
	| 'behavior_failure'
	| 'quality_failure'
	| 'judge_infrastructure_failure'
	| 'instrument_failure';

export interface Phase0TurnEvidence {
	scenarioId: string;
	scenarioTitle: string;
	scenarioCategory: string;
	repetition: number;
	turnIndex: number;
	turnLabel: string | null;
	streamRunId: string | null;
	clientTurnId: string;
	sessionId: string | null;
	assertionPassed: boolean;
	assertionError: string | null;
	deterministicAssertionPassed: boolean;
	deterministicAssertionError: string | null;
	judge: Phase0JudgeEvidence;
	resultClass: Phase0ResultClass;
	subchecks: TurnEvidenceCheckResult[];
	completed: boolean;
	finishedReason: string | null;
	streamErrors: string[];
	clientTiming: TurnTiming;
	serverTiming: AgentTimingSummary | null;
	eventTimings: TurnEventTiming[];
	toolExecutions: Phase0ToolExecutionEvidence[];
	controlDecisions: Phase0ControlDecisionEvidence[];
	executionObservations: Phase0ExecutionObservationEvidence[];
	usage: StreamUsageSummary;
	turnRun: TurnRunRow | null;
	persistence: Phase0PersistenceFootprint | null;
	captureErrors: string[];
}

export interface Phase0MetricSummary {
	samples: number;
	min: number | null;
	p50: number | null;
	p95: number | null;
	max: number | null;
}

export interface Phase0RateInterval {
	low: number;
	high: number;
}

export interface Phase0ScenarioResultSummary {
	scenarioId: string;
	turnCount: number;
	passCount: number;
	passRate: number;
	confidenceInterval95: Phase0RateInterval;
	resultClassCounts: Record<Phase0ResultClass, number>;
}

export interface Phase0EvidenceReport {
	schemaVersion: typeof PHASE0_EVIDENCE_SCHEMA_VERSION;
	contractFamily: 'agentic_chat_worker_v1';
	runId: string;
	generatedAt: string;
	repository: Phase0RepositoryState;
	configuration: {
		baseUrl: string;
		executionMode: AgenticE2EExecutionMode;
		scenarioIds: string[];
		repetitions: number;
		retryCount: number;
	};
	turns: Phase0TurnEvidence[];
	summary: {
		turnCount: number;
		assertionPassCount: number;
		deterministicAssertionPassCount: number;
		completedCount: number;
		streamErrorTurnCount: number;
		captureErrorTurnCount: number;
		totalModelCostUsd: number;
		judge: {
			configuredCount: number;
			eligibleCount: number;
			passCount: number;
			failCount: number;
			errorCount: number;
			notReachedCount: number;
			score: Phase0MetricSummary;
		};
		resultClassCounts: Record<Phase0ResultClass, number>;
		subchecks: {
			passedCount: number;
			failedCount: number;
			notApplicableCount: number;
		};
		scenarioResults: Phase0ScenarioResultSummary[];
		client: Record<string, Phase0MetricSummary>;
		server: Record<string, Phase0MetricSummary>;
		toolExecutionMs: Phase0MetricSummary;
		retainedRowsPerTurn: Phase0MetricSummary;
		retainedBytesPerTurn: Phase0MetricSummary;
		executionObservationsPerTurn: Phase0MetricSummary;
	};
	limitations: string[];
}

const EMPTY_USAGE: StreamUsageSummary = {
	requestCount: 0,
	promptTokens: 0,
	completionTokens: 0,
	totalTokens: 0,
	totalCostUsd: 0,
	models: [],
	providers: [],
	profiles: [],
	operations: []
};

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function boundedError(error: unknown): string {
	return errorMessage(error).slice(0, 1_000);
}

function boundedText(value: unknown, max = 256): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed.slice(0, max) : null;
}

function finiteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function providerUsageEvidence(value: unknown): Phase0ProviderUsageEvidence | null {
	const usage = record(value);
	if (!usage) return null;
	return {
		promptTokens: finiteNumber(usage.prompt_tokens),
		completionTokens: finiteNumber(usage.completion_tokens),
		totalTokens: finiteNumber(usage.total_tokens),
		reasoningTokens: finiteNumber(usage.reasoning_tokens),
		cachedPromptTokens: finiteNumber(usage.cached_prompt_tokens),
		cacheWriteTokens: finiteNumber(usage.cache_write_tokens)
	};
}

function executionObservationEvidence(
	rows: ExecutionObservationRow[]
): Phase0ExecutionObservationEvidence[] {
	return rows.map((row) => {
		const payload = record(row.payload) ?? {};
		return {
			executionGeneration: row.execution_generation,
			phase: row.phase,
			eventType: row.event_type,
			observedAt: row.observed_at,
			round: finiteNumber(payload.round),
			logicalProviderRound: finiteNumber(payload.logical_provider_round),
			routeId: boundedText(payload.route_id),
			modelRequested: boundedText(payload.model_requested),
			modelUsed: boundedText(payload.model_used),
			provider: boundedText(payload.provider),
			status: boundedText(payload.status, 64),
			durationMs: finiteNumber(payload.duration_ms),
			finishReason: boundedText(payload.finish_reason, 64),
			errorClass: boundedText(payload.error_class, 128),
			toolName: boundedText(payload.tool_name),
			providerToolCallId: boundedText(payload.provider_tool_call_id, 512),
			sequenceIndex: finiteNumber(payload.sequence_index),
			usage: providerUsageEvidence(payload.usage)
		};
	});
}

function judgeEvidence(outcome: CheckedTurnOutcome): Phase0JudgeEvidence {
	if (outcome.judge.status === 'not_configured' || outcome.judge.status === 'not_reached') {
		return {
			status: outcome.judge.status,
			threshold: null,
			score: null,
			passed: null,
			reasoning: null,
			error: null
		};
	}
	if (outcome.judge.status === 'error') {
		return {
			status: 'error',
			threshold: null,
			score: null,
			passed: null,
			reasoning: null,
			error: boundedError(outcome.judge.error)
		};
	}
	return {
		status: outcome.judge.status,
		threshold: outcome.judge.result.threshold,
		score: outcome.judge.result.score,
		passed: outcome.judge.result.passed,
		reasoning: boundedText(outcome.judge.result.reasoning, 1_000),
		error: null
	};
}

const RESULT_CLASSES: readonly Phase0ResultClass[] = [
	'end_to_end_pass',
	'transport_failure',
	'behavior_failure',
	'quality_failure',
	'judge_infrastructure_failure',
	'instrument_failure'
];

function emptyResultClassCounts(): Record<Phase0ResultClass, number> {
	return Object.fromEntries(RESULT_CLASSES.map((resultClass) => [resultClass, 0])) as Record<
		Phase0ResultClass,
		number
	>;
}

export function classifyPhase0TurnResult(params: {
	result: Pick<TurnResult, 'completed' | 'errors' | 'finishedReason'>;
	turnRun: TurnRunRow | null;
	checkOutcome: CheckedTurnOutcome;
	captureErrors: readonly string[];
}): Phase0ResultClass {
	if (
		!params.result.completed ||
		params.result.errors.length > 0 ||
		['error', 'failed', 'cancelled', 'turn_rejected'].includes(
			params.result.finishedReason ?? ''
		) ||
		(params.turnRun !== null && params.turnRun.status !== 'completed')
	) {
		return 'transport_failure';
	}
	if (!params.checkOutcome.deterministicAssertionPassed) return 'behavior_failure';
	if (params.checkOutcome.judge.status === 'error') return 'judge_infrastructure_failure';
	if (params.checkOutcome.judge.status === 'failed') return 'quality_failure';
	if (params.captureErrors.length > 0) return 'instrument_failure';
	return 'end_to_end_pass';
}

/** 95% Wilson score interval; honest for the very small live battery cohorts. */
export function wilson95(passCount: number, sampleCount: number): Phase0RateInterval {
	if (sampleCount <= 0) return { low: 0, high: 0 };
	const z = 1.959963984540054;
	const proportion = passCount / sampleCount;
	const denominator = 1 + (z * z) / sampleCount;
	const center = (proportion + (z * z) / (2 * sampleCount)) / denominator;
	const margin =
		(z / denominator) *
		Math.sqrt(
			(proportion * (1 - proportion)) / sampleCount +
				(z * z) / (4 * sampleCount * sampleCount)
		);
	return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

function summarizeScenarioResults(turns: Phase0TurnEvidence[]): Phase0ScenarioResultSummary[] {
	const scenarioIds = Array.from(new Set(turns.map((turn) => turn.scenarioId)));
	return scenarioIds.map((scenarioId) => {
		const scenarioTurns = turns.filter((turn) => turn.scenarioId === scenarioId);
		const passCount = scenarioTurns.filter((turn) => turn.assertionPassed).length;
		const resultClassCounts = emptyResultClassCounts();
		for (const turn of scenarioTurns) resultClassCounts[turn.resultClass] += 1;
		return {
			scenarioId,
			turnCount: scenarioTurns.length,
			passCount,
			passRate: scenarioTurns.length > 0 ? passCount / scenarioTurns.length : 0,
			confidenceInterval95: wilson95(passCount, scenarioTurns.length),
			resultClassCounts
		};
	});
}

function jsonBytes(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function percentile(values: number[], fraction: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((left, right) => left - right);
	const rank = Math.max(1, Math.ceil(fraction * sorted.length));
	return sorted[Math.min(rank - 1, sorted.length - 1)] ?? null;
}

export function summarizePhase0Metric(
	values: Array<number | null | undefined>
): Phase0MetricSummary {
	const finite = values.filter(
		(value): value is number => typeof value === 'number' && Number.isFinite(value)
	);
	return {
		samples: finite.length,
		min: finite.length > 0 ? Math.min(...finite) : null,
		p50: percentile(finite, 0.5),
		p95: percentile(finite, 0.95),
		max: finite.length > 0 ? Math.max(...finite) : null
	};
}

function git(cwd: string, args: string[]): string {
	return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** Capture the exact committed tree before a paid run starts. */
export function readPhase0RepositoryState(cwd = process.cwd()): Phase0RepositoryState {
	const root = git(cwd, ['rev-parse', '--show-toplevel']);
	const statusText = git(root, ['status', '--porcelain=v1', '--untracked-files=all']);
	const status = statusText ? statusText.split('\n') : [];
	return {
		root,
		head: git(root, ['rev-parse', 'HEAD']),
		headTree: git(root, ['rev-parse', 'HEAD^{tree}']),
		branch: git(root, ['branch', '--show-current']),
		dirty: status.length > 0,
		status
	};
}

async function measureTable(
	table: string,
	load: () => Promise<{ data: unknown; error: { message: string } | null }>
): Promise<Phase0TableFootprint> {
	try {
		const { data, error } = await load();
		if (error) throw new Error(error.message);
		const rows = Array.isArray(data) ? data : data ? [data] : [];
		return {
			table,
			retainedRows: rows.length,
			approxJsonBytes: jsonBytes(rows),
			error: null
		};
	} catch (error) {
		return { table, retainedRows: 0, approxJsonBytes: 0, error: boundedError(error) };
	}
}

async function measurePersistenceFootprint(params: {
	admin: TypedSupabaseClient;
	turnRun: TurnRunRow;
	streamRunId: string;
	durationMs: number | null;
}): Promise<Phase0PersistenceFootprint> {
	const messageIds = [params.turnRun.user_message_id, params.turnRun.assistant_message_id].filter(
		(id): id is string => Boolean(id)
	);
	const tableMeasurements = await Promise.all([
		measureTable('chat_turn_runs', async () => {
			const result = await params.admin
				.from('chat_turn_runs')
				.select('*')
				.eq('id', params.turnRun.id);
			return { data: result.data, error: result.error };
		}),
		measureTable('chat_turn_events', async () => {
			const result = await params.admin
				.from('chat_turn_events')
				.select('*')
				.eq('turn_run_id', params.turnRun.id);
			return { data: result.data, error: result.error };
		}),
		measureTable('chat_turn_checkpoints', async () => {
			const result = await params.admin
				.from('chat_turn_checkpoints')
				.select('*')
				.eq('turn_run_id', params.turnRun.id);
			return { data: result.data, error: result.error };
		}),
		measureTable('chat_tool_executions', async () => {
			const result = await params.admin
				.from('chat_tool_executions')
				.select('*')
				.eq('turn_run_id', params.turnRun.id);
			return { data: result.data, error: result.error };
		}),
		measureTable('chat_prompt_snapshots', async () => {
			const result = await params.admin
				.from('chat_prompt_snapshots')
				.select('*')
				.eq('turn_run_id', params.turnRun.id);
			return { data: result.data, error: result.error };
		}),
		measureTable('timing_metrics', async () => {
			const result = await params.admin
				.from('timing_metrics')
				.select('*')
				.eq('turn_run_id', params.turnRun.id);
			return { data: result.data, error: result.error };
		}),
		measureTable('chat_messages', async () => {
			if (messageIds.length === 0) return { data: [], error: null };
			const result = await params.admin
				.from('chat_messages')
				.select('*')
				.in('id', messageIds);
			return { data: result.data, error: result.error };
		}),
		measureTable('llm_usage_logs', async () => {
			const result = await params.admin
				.from('llm_usage_logs')
				.select('*')
				.eq('stream_run_id', params.streamRunId);
			return { data: result.data, error: result.error };
		}),
		measureTable('agentic_chat_execution_observations', async () => {
			const result = await params.admin
				.from('agentic_chat_execution_observations')
				.select('*')
				.eq('turn_run_id', params.turnRun.id);
			return { data: result.data, error: result.error };
		})
	]);
	const totalRetainedRows = tableMeasurements.reduce(
		(total, measurement) => total + measurement.retainedRows,
		0
	);
	const totalApproxJsonBytes = tableMeasurements.reduce(
		(total, measurement) => total + measurement.approxJsonBytes,
		0
	);
	return {
		kind: 'retained_chat_path_rows_v1',
		tables: tableMeasurements,
		totalRetainedRows,
		totalApproxJsonBytes,
		measurementDurationMs: params.durationMs,
		retainedRowsPerSecond:
			params.durationMs && params.durationMs > 0
				? (totalRetainedRows * 1_000) / params.durationMs
				: null,
		note: 'Counts final retained chat-path rows and their serialized JSON size. It does not measure update frequency, WAL bytes, or concurrent database traffic.'
	};
}

/** Control tools whose persisted `result` carries a `decided_by` reviewer attribution. */
const CONTROL_TOOL_NAMES: readonly string[] = Object.freeze([
	'declare_turn_contract',
	'request_turn_clarification',
	'approve_turn_contract_review',
	'approve_mutation_batch_review',
	'request_proposal_revision'
]);

function readDecidedBy(result: unknown): string | null {
	if (!result || typeof result !== 'object') return null;
	const value = (result as Record<string, unknown>).decided_by;
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed.slice(0, 64) : null;
}

function toolEvidence(rows: ToolExecutionRow[]): Phase0ToolExecutionEvidence[] {
	return rows.map((row) => ({
		name: row.tool_name,
		op: row.gateway_op,
		success: row.success,
		sequenceIndex: row.sequence_index,
		executionTimeMs: row.execution_time_ms,
		decidedBy: readDecidedBy(row.result)
	}));
}

function controlDecisionEvidence(
	tools: Phase0ToolExecutionEvidence[]
): Phase0ControlDecisionEvidence[] {
	return tools
		.filter((tool) => CONTROL_TOOL_NAMES.includes(tool.name))
		.map((tool) => ({
			name: tool.name,
			decidedBy: tool.decidedBy,
			sequenceIndex: tool.sequenceIndex
		}));
}

export async function collectPhase0TurnEvidence(params: {
	admin: TypedSupabaseClient;
	scenario: Pick<Scenario, 'id' | 'title' | 'category'>;
	repetition: number;
	turnIndex: number;
	turnLabel: string | null;
	result: TurnResult;
	checkOutcome: CheckedTurnOutcome;
	subchecks: TurnEvidenceCheckResult[];
}): Promise<Phase0TurnEvidence> {
	const captureErrors: string[] = [];
	let turnRun: TurnRunRow | null = null;
	let tools: ToolExecutionRow[] = [];
	let usage = EMPTY_USAGE;
	let persistence: Phase0PersistenceFootprint | null = null;
	let executionObservations: ExecutionObservationRow[] = [];

	if (!params.result.streamRunId) {
		captureErrors.push(
			'Turn did not expose stream_run_id; database evidence was not queryable.'
		);
	} else {
		const [turnResult, toolResult, usageResult] = await Promise.allSettled([
			waitForTurnRun(params.admin, params.result.streamRunId, { timeoutMs: 15_000 }),
			waitForToolExecutions(
				params.admin,
				params.result.streamRunId,
				params.result.toolCalls.length
			),
			waitForUsageSummary(params.admin, params.result.streamRunId)
		]);
		if (turnResult.status === 'fulfilled') turnRun = turnResult.value;
		else captureErrors.push(`turn run: ${boundedError(turnResult.reason)}`);
		if (toolResult.status === 'fulfilled') tools = toolResult.value;
		else captureErrors.push(`tool executions: ${boundedError(toolResult.reason)}`);
		if (usageResult.status === 'fulfilled') usage = usageResult.value;
		else captureErrors.push(`usage: ${boundedError(usageResult.reason)}`);

		if (!turnRun) {
			captureErrors.push('No chat_turn_runs row was observed for the streamed turn.');
		} else {
			if (!['completed', 'failed', 'cancelled'].includes(turnRun.status)) {
				captureErrors.push(
					`chat_turn_runs remained non-terminal (${turnRun.status}) after the evidence wait.`
				);
			}
			const [persistenceResult, observationResult] = await Promise.allSettled([
				measurePersistenceFootprint({
					admin: params.admin,
					turnRun,
					streamRunId: params.result.streamRunId,
					durationMs:
						params.result.serverTiming?.phases.total_request_ms ??
						params.result.timing.totalDurationMs
				}),
				getExecutionObservations(params.admin, turnRun.id)
			]);
			if (persistenceResult.status === 'fulfilled') {
				persistence = persistenceResult.value;
				for (const table of persistence.tables) {
					if (table.error) captureErrors.push(`${table.table}: ${table.error}`);
				}
			} else {
				captureErrors.push(
					`persistence footprint: ${boundedError(persistenceResult.reason)}`
				);
			}
			if (observationResult.status === 'fulfilled') {
				executionObservations = observationResult.value;
			} else {
				captureErrors.push(
					`execution observations: ${boundedError(observationResult.reason)}`
				);
			}
		}
		if (tools.length < params.result.toolCalls.length) {
			captureErrors.push(
				`Only ${tools.length} of ${params.result.toolCalls.length} streamed tool call(s) had retained execution telemetry.`
			);
		}
	}
	if (!params.result.serverTiming) {
		captureErrors.push('The stream did not emit a valid server timing summary.');
	}
	if (usage.requestCount === 0) {
		captureErrors.push('No stream-correlated model usage row was observed.');
	}

	const toolExecutionEvidence = toolEvidence(tools);
	const judge = judgeEvidence(params.checkOutcome);
	const resultClass = classifyPhase0TurnResult({
		result: params.result,
		turnRun,
		checkOutcome: params.checkOutcome,
		captureErrors
	});

	return {
		scenarioId: params.scenario.id,
		scenarioTitle: params.scenario.title,
		scenarioCategory: params.scenario.category,
		repetition: params.repetition,
		turnIndex: params.turnIndex,
		turnLabel: params.turnLabel,
		streamRunId: params.result.streamRunId,
		clientTurnId: params.result.clientTurnId,
		sessionId: params.result.sessionId,
		assertionPassed: params.checkOutcome.overallError === null,
		assertionError:
			params.checkOutcome.overallError === null
				? null
				: boundedError(params.checkOutcome.overallError),
		deterministicAssertionPassed: params.checkOutcome.deterministicAssertionPassed,
		deterministicAssertionError:
			params.checkOutcome.deterministicAssertionError === null
				? null
				: boundedError(params.checkOutcome.deterministicAssertionError),
		judge,
		resultClass,
		subchecks: params.subchecks,
		completed: params.result.completed,
		finishedReason: params.result.finishedReason,
		streamErrors: params.result.errors.map((error) => error.error),
		clientTiming: params.result.timing,
		serverTiming: params.result.serverTiming,
		eventTimings: params.result.eventTimings,
		toolExecutions: toolExecutionEvidence,
		controlDecisions: controlDecisionEvidence(toolExecutionEvidence),
		executionObservations: executionObservationEvidence(executionObservations),
		usage,
		turnRun,
		persistence,
		captureErrors
	};
}

export function buildPhase0EvidenceReport(params: {
	runId: string;
	generatedAt?: string;
	repository: Phase0RepositoryState;
	baseUrl: string;
	executionMode?: AgenticE2EExecutionMode;
	scenarioIds: string[];
	repetitions: number;
	retryCount: number;
	turns: Phase0TurnEvidence[];
}): Phase0EvidenceReport {
	const clientMetric = (key: keyof TurnTiming) =>
		summarizePhase0Metric(
			params.turns.map((turn) =>
				typeof turn.clientTiming[key] === 'number'
					? (turn.clientTiming[key] as number)
					: null
			)
		);
	const serverMetric = (key: keyof AgentTimingSummary['phases']) =>
		summarizePhase0Metric(params.turns.map((turn) => turn.serverTiming?.phases[key]));
	const resultClassCounts = emptyResultClassCounts();
	for (const turn of params.turns) resultClassCounts[turn.resultClass] += 1;
	const subchecks = params.turns.flatMap((turn) => turn.subchecks);
	return {
		schemaVersion: PHASE0_EVIDENCE_SCHEMA_VERSION,
		contractFamily: 'agentic_chat_worker_v1',
		runId: params.runId,
		generatedAt: params.generatedAt ?? new Date().toISOString(),
		repository: params.repository,
		configuration: {
			baseUrl: params.baseUrl,
			executionMode: params.executionMode ?? 'legacy_sse',
			scenarioIds: params.scenarioIds,
			repetitions: params.repetitions,
			retryCount: params.retryCount
		},
		turns: params.turns,
		summary: {
			turnCount: params.turns.length,
			assertionPassCount: params.turns.filter((turn) => turn.assertionPassed).length,
			deterministicAssertionPassCount: params.turns.filter(
				(turn) => turn.deterministicAssertionPassed
			).length,
			completedCount: params.turns.filter((turn) => turn.completed).length,
			streamErrorTurnCount: params.turns.filter((turn) => turn.streamErrors.length > 0)
				.length,
			captureErrorTurnCount: params.turns.filter((turn) => turn.captureErrors.length > 0)
				.length,
			totalModelCostUsd: params.turns.reduce(
				(total, turn) => total + turn.usage.totalCostUsd,
				0
			),
			judge: {
				configuredCount: params.turns.filter(
					(turn) => turn.judge.status !== 'not_configured'
				).length,
				eligibleCount: params.turns.filter((turn) =>
					['passed', 'failed', 'error'].includes(turn.judge.status)
				).length,
				passCount: params.turns.filter((turn) => turn.judge.status === 'passed').length,
				failCount: params.turns.filter((turn) => turn.judge.status === 'failed').length,
				errorCount: params.turns.filter((turn) => turn.judge.status === 'error').length,
				notReachedCount: params.turns.filter((turn) => turn.judge.status === 'not_reached')
					.length,
				score: summarizePhase0Metric(params.turns.map((turn) => turn.judge.score))
			},
			resultClassCounts,
			subchecks: {
				passedCount: subchecks.filter((check) => check.status === 'passed').length,
				failedCount: subchecks.filter((check) => check.status === 'failed').length,
				notApplicableCount: subchecks.filter((check) => check.status === 'not_applicable')
					.length
			},
			scenarioResults: summarizeScenarioResults(params.turns),
			client: {
				responseHeadersMs: clientMetric('responseHeadersMs'),
				firstSseEventMs: clientMetric('firstSseEventMs'),
				ttftMs: clientMetric('ttftMs'),
				terminalEventMs: clientMetric('terminalEventMs'),
				totalDurationMs: clientMetric('totalDurationMs')
			},
			server: {
				turnAdmissionMs: serverMetric('turn_admission_ms'),
				timeToFirstEventMs: serverMetric('time_to_first_event_ms'),
				timeToFirstResponseMs: serverMetric('time_to_first_response_ms'),
				assistantPersistMs: serverMetric('assistant_persist_ms'),
				finalizationMs: serverMetric('finalization_ms'),
				totalRequestMs: serverMetric('total_request_ms')
			},
			toolExecutionMs: summarizePhase0Metric(
				params.turns.flatMap((turn) =>
					turn.toolExecutions.map((execution) => execution.executionTimeMs)
				)
			),
			retainedRowsPerTurn: summarizePhase0Metric(
				params.turns.map((turn) => turn.persistence?.totalRetainedRows)
			),
			retainedBytesPerTurn: summarizePhase0Metric(
				params.turns.map((turn) => turn.persistence?.totalApproxJsonBytes)
			),
			executionObservationsPerTurn: summarizePhase0Metric(
				params.turns.map((turn) => turn.executionObservations.length)
			)
		},
		limitations: [
			'The retained-row footprint is a final-state parity baseline, not a PostgreSQL WAL or statement-rate measurement.',
			'Provider latency is included in end-to-end and first-response timing; later worker comparisons must separate BuildOS queue/transport overhead.',
			'Prompt, message, tool-argument, tool-result, and event payload bodies are measured in memory for byte size but are not retained in this artifact.',
			'Execution observations include only the database-enforced provider/tool metadata allowlist; prompt, argument, result, message, and hidden-reasoning content is excluded.'
		]
	};
}

export function writePhase0EvidenceReport(path: string, report: Phase0EvidenceReport): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
