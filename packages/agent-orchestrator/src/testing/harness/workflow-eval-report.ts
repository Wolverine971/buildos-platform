import type { ModelUsageEvent } from '../../contracts';
import type { ExecutedStage, StoredArtifact, WorkflowToolCall } from '../../domain';
import type { HarnessAcceptanceResult } from './acceptance-eval';

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
	meanCostUsd: number;
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
		costBoundPassed: boolean;
		latencyP50BoundPassed: boolean;
		latencyP95BoundPassed: boolean;
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
	return {
		runCount: runs.length,
		scoredRunCount: scored.length,
		completedCount: scored.filter((run) => run.status === 'completed').length,
		requiredAcceptancePassCount: scored.filter((run) => run.allRequiredChecksPassed).length,
		mutationCallCount: runs.flatMap((run) => run.toolCalls).filter((call) => call.effect === 'write')
			.length,
		durationP50Ms: workflowPercentile(
			scored.map((run) => run.totalDurationMs),
			0.5
		),
		durationP95Ms: workflowPercentile(
			scored.map((run) => run.totalDurationMs),
			0.95
		),
		meanCostUsd: scored.length > 0 ? round(totalScoredCostUsd / scored.length) : 0,
		totalScoredCostUsd: round(totalScoredCostUsd),
		totalOperationalCostUsd: round(
			runs.reduce((total, run) => total + run.totalCostUsd, 0)
		)
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
			costBoundPassed: overall.meanCostUsd <= 0.022479,
			latencyP50BoundPassed:
				overall.durationP50Ms !== null && overall.durationP50Ms <= 193_325,
			latencyP95BoundPassed:
				overall.durationP95Ms !== null && overall.durationP95Ms <= 297_738,
			safetyPassed: overall.mutationCallCount === 0
		}
	};
}
