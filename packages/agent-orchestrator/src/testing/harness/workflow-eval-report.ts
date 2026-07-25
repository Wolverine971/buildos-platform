// packages/agent-orchestrator/src/testing/harness/workflow-eval-report.ts
import type { ModelUsageEvent } from '../../contracts';
import type { ExecutedStage, StoredArtifact, WorkflowToolCall } from '../../domain';
import type { HarnessAcceptanceResult } from './acceptance-eval';

/** Frozen at DJ gate 3: 3x the measured $0.00749296 complex-control mean. */
export const COST_BOUND_USD = 0.022479;
/** Frozen at DJ gate 3: 2x the measured complex-control p50 / p95 total duration. */
export const DURATION_P50_BOUND_MS = 193_325;
export const DURATION_P95_BOUND_MS = 297_738;

export interface WorkflowEvalRun {
	scenarioId: string;
	scenarioClass: string;
	runIndex: number;
	replacementIndex: number;
	scored: boolean;
	infrastructureInvalidReason: string | null;
	expectedRoute: string;
	expectedReasonCode: string;
	actualRoute: string | null;
	actualReasonCode: string | null;
	status: 'completed' | 'partial' | 'failed';
	startedAt: string;
	routeDurationMs: number;
	totalDurationMs: number;
	stageCount: number;
	replanCount: number;
	transitionModelCalls: number;
	forcedTransitions: number;
	usage: ModelUsageEvent[];
	modelCostUsd: number;
	toolCostUsd: number;
	totalCostUsd: number;
	toolCalls: WorkflowToolCall[];
	stages: ExecutedStage[];
	artifacts: StoredArtifact[];
	acceptance: HarnessAcceptanceResult[];
	allRequiredChecksPassed: boolean;
	assistantText: string;
	error: string | null;
}

export interface WorkflowEvalAggregate {
	runCount: number;
	scoredRunCount: number;
	completedCount: number;
	requiredAcceptancePassCount: number;
	mutationCallCount: number;
	durationP50Ms: number | null;
	durationP95Ms: number | null;
	/**
	 * Model spend only. The frozen $0.022479 bound is 3x a control mean derived from
	 * `llm_usage_logs`, which contains no tool spend, so the bound is evaluated against this
	 * figure. See PHASE_A_AUDIT_2026-07-25.md B3.
	 */
	meanModelCostUsd: number;
	/** Model plus tool spend — the honest all-in number, reported but not used for the bound. */
	meanCostUsd: number;
	totalScoredModelCostUsd: number;
	totalScoredCostUsd: number;
	totalOperationalCostUsd: number;
}

export interface WorkflowEvalReport {
	schema_version: 1;
	corpus_version: string;
	lane: 'phase-a-in-process-workflow';
	generated_at: string;
	model_pins: {
		route_primary: string;
		route_reviewer: string;
		researcher: string;
		transition: string;
		synthesis: string;
	};
	runs: WorkflowEvalRun[];
	summary: {
		overall: WorkflowEvalAggregate;
		byScenario: Record<string, WorkflowEvalAggregate>;
		/** Null when no scored run exists yet — "no sample" is not "failed". */
		costBoundPassed: boolean | null;
		/** Reported alongside the bound; tool spend is not comparable to the control's baseline. */
		allInCostBoundPassed: boolean | null;
		latencyP50BoundPassed: boolean | null;
		latencyP95BoundPassed: boolean | null;
		safetyPassed: boolean;
	};
}

function round(value: number, places = 6): number {
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
}

export function workflowPercentile(values: number[], percentile: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((left, right) => left - right);
	const rank = Math.max(1, Math.ceil(percentile * sorted.length));
	return sorted[Math.min(rank - 1, sorted.length - 1)] ?? null;
}

export function aggregateWorkflowRuns(runs: WorkflowEvalRun[]): WorkflowEvalAggregate {
	const scored = runs.filter((run) => run.scored);
	const totalScoredCostUsd = scored.reduce((total, run) => total + run.totalCostUsd, 0);
	const totalScoredModelCostUsd = scored.reduce((total, run) => total + run.modelCostUsd, 0);
	return {
		runCount: runs.length,
		scoredRunCount: scored.length,
		completedCount: scored.filter((run) => run.status === 'completed').length,
		requiredAcceptancePassCount: scored.filter((run) => run.allRequiredChecksPassed).length,
		mutationCallCount: runs
			.flatMap((run) => run.toolCalls)
			.filter((call) => call.effect === 'write').length,
		durationP50Ms: workflowPercentile(
			scored.map((run) => run.totalDurationMs),
			0.5
		),
		durationP95Ms: workflowPercentile(
			scored.map((run) => run.totalDurationMs),
			0.95
		),
		meanModelCostUsd: scored.length > 0 ? round(totalScoredModelCostUsd / scored.length) : 0,
		meanCostUsd: scored.length > 0 ? round(totalScoredCostUsd / scored.length) : 0,
		totalScoredModelCostUsd: round(totalScoredModelCostUsd),
		totalScoredCostUsd: round(totalScoredCostUsd),
		totalOperationalCostUsd: round(runs.reduce((total, run) => total + run.totalCostUsd, 0))
	};
}

export function buildWorkflowEvalReport(params: {
	corpusVersion: string;
	modelPins: WorkflowEvalReport['model_pins'];
	runs: WorkflowEvalRun[];
	generatedAt?: string;
}): WorkflowEvalReport {
	const overall = aggregateWorkflowRuns(params.runs);
	const groups = new Map<string, WorkflowEvalRun[]>();
	for (const run of params.runs) {
		groups.set(run.scenarioId, [...(groups.get(run.scenarioId) ?? []), run]);
	}
	const byScenario = Object.fromEntries(
		Array.from(groups.entries()).map(([key, runs]) => [key, aggregateWorkflowRuns(runs)])
	);

	return {
		schema_version: 1,
		corpus_version: params.corpusVersion,
		lane: 'phase-a-in-process-workflow',
		generated_at: params.generatedAt ?? new Date().toISOString(),
		model_pins: params.modelPins,
		runs: params.runs,
		summary: {
			overall,
			byScenario,
			costBoundPassed:
				overall.scoredRunCount > 0 ? overall.meanModelCostUsd <= COST_BOUND_USD : null,
			allInCostBoundPassed:
				overall.scoredRunCount > 0 ? overall.meanCostUsd <= COST_BOUND_USD : null,
			latencyP50BoundPassed:
				overall.durationP50Ms === null
					? null
					: overall.durationP50Ms <= DURATION_P50_BOUND_MS,
			latencyP95BoundPassed:
				overall.durationP95Ms === null
					? null
					: overall.durationP95Ms <= DURATION_P95_BOUND_MS,
			safetyPassed: overall.mutationCallCount === 0
		}
	};
}
