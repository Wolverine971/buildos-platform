// apps/web/src/lib/tests/agentic-e2e/phase-a/baseline-report.ts
import type { AcceptanceCheckResult } from './acceptance';
import type { StreamUsageSummary } from '../harness/telemetry';
import type { TurnTiming } from '../harness/types';

export interface PhaseAControlRun {
	scenarioId: string;
	scenarioClass: string;
	expectedRoute: string;
	expectedReasonCode: string;
	runIndex: number;
	replacementIndex?: number;
	scored?: boolean;
	infrastructureInvalidReason?: string | null;
	requestStartedAt: string;
	timing: TurnTiming;
	usage: StreamUsageSummary;
	completed: boolean;
	finishedReason: string | null;
	errors: string[];
	toolCalls: string[];
	acceptance: AcceptanceCheckResult[];
	allRequiredChecksPassed: boolean;
	assistantText: string;
}

export interface BaselineAggregate {
	runCount: number;
	scoredRunCount: number;
	infrastructureInvalidCount: number;
	completedCount: number;
	cleanSuccessCount: number;
	errorRunCount: number;
	ttftSampleCount: number;
	ttftP50Ms: number | null;
	ttftP95Ms: number | null;
	totalDurationP50Ms: number | null;
	totalDurationP95Ms: number | null;
	costMeanUsd: number;
	costP50Usd: number | null;
	costP95Usd: number | null;
	totalCostUsd: number;
	totalOperationalCostUsd: number;
	acceptancePassCount: number;
	acceptancePassRate: number;
}

export interface PhaseAControlBaselineReport {
	schema_version: 1;
	corpus_version: string;
	lane: 'control-agentic-chat-v2';
	generated_at: string;
	runs: PhaseAControlRun[];
	summary: {
		overall: BaselineAggregate;
		byClass: Record<string, BaselineAggregate>;
		byScenario: Record<string, BaselineAggregate>;
	};
}

function round(value: number, places = 6): number {
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
}

/** Nearest-rank percentile; deliberately simple and stable for the small A0 sample. */
export function percentile(values: number[], percentileValue: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const rank = Math.max(1, Math.ceil(percentileValue * sorted.length));
	return sorted[Math.min(rank - 1, sorted.length - 1)] ?? null;
}

export function aggregateControlRuns(runs: PhaseAControlRun[]): BaselineAggregate {
	const scored = runs.filter((run) => run.scored !== false);
	const ttft = scored.flatMap((run) => (run.timing.ttftMs === null ? [] : [run.timing.ttftMs]));
	const durations = scored.flatMap((run) =>
		run.timing.totalDurationMs === null ? [] : [run.timing.totalDurationMs]
	);
	const costs = scored.map((run) => run.usage.totalCostUsd);
	const acceptancePassCount = scored.filter((run) => run.allRequiredChecksPassed).length;
	const totalCostUsd = costs.reduce((total, cost) => total + cost, 0);

	return {
		runCount: runs.length,
		scoredRunCount: scored.length,
		infrastructureInvalidCount: runs.length - scored.length,
		completedCount: scored.filter((run) => run.completed).length,
		cleanSuccessCount: scored.filter((run) => run.completed && run.errors.length === 0).length,
		errorRunCount: scored.filter((run) => run.errors.length > 0).length,
		ttftSampleCount: ttft.length,
		ttftP50Ms: percentile(ttft, 0.5),
		ttftP95Ms: percentile(ttft, 0.95),
		totalDurationP50Ms: percentile(durations, 0.5),
		totalDurationP95Ms: percentile(durations, 0.95),
		costMeanUsd: runs.length > 0 ? round(totalCostUsd / runs.length) : 0,
		costP50Usd: percentile(costs, 0.5),
		costP95Usd: percentile(costs, 0.95),
		totalCostUsd: round(totalCostUsd),
		totalOperationalCostUsd: round(
			runs.reduce((total, run) => total + run.usage.totalCostUsd, 0)
		),
		acceptancePassCount,
		acceptancePassRate: scored.length > 0 ? round(acceptancePassCount / scored.length) : 0
	};
}

function groupRuns(runs: PhaseAControlRun[], key: (run: PhaseAControlRun) => string) {
	const groups = new Map<string, PhaseAControlRun[]>();
	for (const run of runs) {
		const groupKey = key(run);
		groups.set(groupKey, [...(groups.get(groupKey) ?? []), run]);
	}
	return Object.fromEntries(
		Array.from(groups.entries()).map(([groupKey, groupRuns]) => [
			groupKey,
			aggregateControlRuns(groupRuns)
		])
	);
}

export function buildControlBaselineReport(
	corpusVersion: string,
	runs: PhaseAControlRun[],
	generatedAt = new Date().toISOString()
): PhaseAControlBaselineReport {
	return {
		schema_version: 1,
		corpus_version: corpusVersion,
		lane: 'control-agentic-chat-v2',
		generated_at: generatedAt,
		runs,
		summary: {
			overall: aggregateControlRuns(runs),
			byClass: groupRuns(runs, (run) => run.scenarioClass),
			byScenario: groupRuns(runs, (run) => run.scenarioId)
		}
	};
}
