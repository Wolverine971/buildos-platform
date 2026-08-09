// apps/web/src/lib/tests/agentic-e2e/phase0/evidence-report.ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { AgentTimingSummary } from '@buildos/shared-types';

import {
	waitForToolExecutions,
	waitForTurnRun,
	waitForUsageSummary,
	type StreamUsageSummary,
	type ToolExecutionRow,
	type TurnRunRow
} from '../harness/telemetry';
import type { Scenario, TurnEventTiming, TurnResult, TurnTiming } from '../harness/types';
import type { AgenticE2EExecutionMode } from '../harness/worker-client';

export const PHASE0_EVIDENCE_SCHEMA_VERSION = 1 as const;

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
}

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
	completed: boolean;
	finishedReason: string | null;
	streamErrors: string[];
	clientTiming: TurnTiming;
	serverTiming: AgentTimingSummary | null;
	eventTimings: TurnEventTiming[];
	toolExecutions: Phase0ToolExecutionEvidence[];
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
		completedCount: number;
		streamErrorTurnCount: number;
		captureErrorTurnCount: number;
		totalModelCostUsd: number;
		client: Record<string, Phase0MetricSummary>;
		server: Record<string, Phase0MetricSummary>;
		toolExecutionMs: Phase0MetricSummary;
		retainedRowsPerTurn: Phase0MetricSummary;
		retainedBytesPerTurn: Phase0MetricSummary;
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

function toolEvidence(rows: ToolExecutionRow[]): Phase0ToolExecutionEvidence[] {
	return rows.map((row) => ({
		name: row.tool_name,
		op: row.gateway_op,
		success: row.success,
		sequenceIndex: row.sequence_index,
		executionTimeMs: row.execution_time_ms
	}));
}

export async function collectPhase0TurnEvidence(params: {
	admin: TypedSupabaseClient;
	scenario: Pick<Scenario, 'id' | 'title' | 'category'>;
	repetition: number;
	turnIndex: number;
	turnLabel: string | null;
	result: TurnResult;
	assertionError: unknown | null;
}): Promise<Phase0TurnEvidence> {
	const captureErrors: string[] = [];
	let turnRun: TurnRunRow | null = null;
	let tools: ToolExecutionRow[] = [];
	let usage = EMPTY_USAGE;
	let persistence: Phase0PersistenceFootprint | null = null;

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
			persistence = await measurePersistenceFootprint({
				admin: params.admin,
				turnRun,
				streamRunId: params.result.streamRunId,
				durationMs:
					params.result.serverTiming?.phases.total_request_ms ??
					params.result.timing.totalDurationMs
			});
			for (const table of persistence.tables) {
				if (table.error) captureErrors.push(`${table.table}: ${table.error}`);
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
		assertionPassed: params.assertionError === null,
		assertionError: params.assertionError === null ? null : boundedError(params.assertionError),
		completed: params.result.completed,
		finishedReason: params.result.finishedReason,
		streamErrors: params.result.errors.map((error) => error.error),
		clientTiming: params.result.timing,
		serverTiming: params.result.serverTiming,
		eventTimings: params.result.eventTimings,
		toolExecutions: toolEvidence(tools),
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
			completedCount: params.turns.filter((turn) => turn.completed).length,
			streamErrorTurnCount: params.turns.filter((turn) => turn.streamErrors.length > 0)
				.length,
			captureErrorTurnCount: params.turns.filter((turn) => turn.captureErrors.length > 0)
				.length,
			totalModelCostUsd: params.turns.reduce(
				(total, turn) => total + turn.usage.totalCostUsd,
				0
			),
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
			)
		},
		limitations: [
			'The retained-row footprint is a final-state parity baseline, not a PostgreSQL WAL or statement-rate measurement.',
			'Provider latency is included in end-to-end and first-response timing; later worker comparisons must separate BuildOS queue/transport overhead.',
			'Prompt, message, tool-argument, tool-result, and event payload bodies are measured in memory for byte size but are not retained in this artifact.'
		]
	};
}

export function writePhase0EvidenceReport(path: string, report: Phase0EvidenceReport): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
