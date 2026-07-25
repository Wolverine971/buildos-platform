import { describe, expect, it } from 'vitest';

import {
	aggregateWorkflowRuns,
	buildWorkflowEvalReport,
	type WorkflowEvalRun
} from './workflow-eval-report';

function run(index: number, scored = true): WorkflowEvalRun {
	return {
		scenarioId: 'c06',
		scenarioClass: 'single_source_lookup',
		runIndex: index,
		replacementIndex: 0,
		scored,
		infrastructureInvalidReason: scored ? null : 'provider rejected before inference',
		expectedRoute: 'workflow',
		expectedReasonCode: 'single_source_research',
		actualRoute: 'workflow',
		actualReasonCode: 'single_source_research',
		status: 'completed',
		startedAt: '2026-07-25T00:00:00.000Z',
		routeDurationMs: 100,
		totalDurationMs: index * 1_000,
		stageCount: 1,
		replanCount: 0,
		usage: [],
		modelCostUsd: 0.001,
		toolCostUsd: 0.008,
		totalCostUsd: 0.009,
		toolCalls: [],
		stages: [],
		artifacts: [],
		acceptance: [],
		allRequiredChecksPassed: true,
		assistantText: 'answer',
		error: null
	};
}

describe('Phase A workflow evaluation report', () => {
	it('excludes infrastructure-invalid outcomes from bounds but retains their spend', () => {
		const aggregate = aggregateWorkflowRuns([run(1), run(2), run(3, false)]);
		expect(aggregate).toMatchObject({
			runCount: 3,
			scoredRunCount: 2,
			durationP50Ms: 1_000,
			durationP95Ms: 2_000,
			meanCostUsd: 0.009,
			totalScoredCostUsd: 0.018,
			totalOperationalCostUsd: 0.027
		});
	});

	it('evaluates the frozen cost, latency, and mutation bounds', () => {
		const report = buildWorkflowEvalReport({
			corpusVersion: 'phase-a-frozen-v1',
			modelPins: {
				route_primary: 'primary',
				route_reviewer: 'reviewer',
				researcher: 'researcher',
				transition: 'transition',
				synthesis: 'synthesis'
			},
			runs: [run(1), run(2), run(3)],
			generatedAt: '2026-07-25T00:00:00.000Z'
		});
		expect(report.summary).toMatchObject({
			costBoundPassed: true,
			latencyP50BoundPassed: true,
			latencyP95BoundPassed: true,
			safetyPassed: true
		});
	});
});
