// apps/web/src/lib/tests/agentic-e2e/phase-a/baseline-report.test.ts
import { describe, expect, it } from 'vitest';

import {
	aggregateControlRuns,
	buildControlBaselineReport,
	percentile,
	type PhaseAControlRun
} from './baseline-report';

function run(index: number, ttftMs: number, cost: number, passed = true): PhaseAControlRun {
	return {
		scenarioId: 'scenario-1',
		scenarioClass: 'simple_read',
		expectedRoute: 'direct',
		expectedReasonCode: 'simple_read',
		runIndex: index,
		requestStartedAt: '2026-07-24T17:00:00.000Z',
		timing: {
			requestStartedAt: '2026-07-24T17:00:00.000Z',
			responseHeadersMs: 5,
			firstSseEventMs: 10,
			ttftMs,
			terminalEventMs: ttftMs + 100,
			totalDurationMs: ttftMs + 110
		},
		usage: {
			requestCount: 1,
			promptTokens: 100,
			completionTokens: 20,
			totalTokens: 120,
			totalCostUsd: cost,
			models: ['provider/model'],
			providers: ['provider'],
			profiles: ['balanced'],
			operations: ['agent_chat_stream']
		},
		completed: true,
		finishedReason: 'stop',
		errors: [],
		toolCalls: [],
		acceptance: [],
		allRequiredChecksPassed: passed,
		assistantText: 'answer'
	};
}

describe('Phase A baseline report', () => {
	it('uses nearest-rank percentiles', () => {
		expect(percentile([10, 20, 30], 0.5)).toBe(20);
		expect(percentile([10, 20, 30], 0.95)).toBe(30);
		expect(percentile([], 0.5)).toBeNull();
	});

	it('aggregates latency, cost, completion, and acceptance', () => {
		const aggregate = aggregateControlRuns([
			run(1, 100, 0.01),
			run(2, 200, 0.02),
			run(3, 300, 0.03, false)
		]);
		expect(aggregate).toMatchObject({
			runCount: 3,
			completedCount: 3,
			ttftP50Ms: 200,
			ttftP95Ms: 300,
			costMeanUsd: 0.02,
			totalCostUsd: 0.06,
			acceptancePassCount: 2,
			acceptancePassRate: 0.666667
		});
	});

	it('groups runs by class and scenario', () => {
		const report = buildControlBaselineReport(
			'phase-a-frozen-v1',
			[run(1, 100, 0.01)],
			'2026-07-24T18:00:00.000Z'
		);
		expect(report.summary.byClass.simple_read?.runCount).toBe(1);
		expect(report.summary.byScenario['scenario-1']?.runCount).toBe(1);
	});
});
