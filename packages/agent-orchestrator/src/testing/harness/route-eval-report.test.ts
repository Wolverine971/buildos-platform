// packages/agent-orchestrator/src/testing/harness/route-eval-report.test.ts
import { describe, expect, it } from 'vitest';

import {
	aggregateRouteEvalRuns,
	buildRouteEvalReport,
	routeEvalPercentile,
	type RouteEvalRun
} from './route-eval-report';

function run(index: number, strictMatch: boolean, scored = true): RouteEvalRun {
	return {
		scenarioId: 'scenario-1',
		scenarioClass: 'simple_read',
		runIndex: index,
		replacementIndex: 0,
		expectedRoute: 'direct',
		expectedReasonCode: 'simple_read',
		actualRoute: strictMatch ? 'direct' : 'workflow',
		actualReasonCode: strictMatch ? 'simple_read' : 'multi_step_synthesis',
		routeMatch: strictMatch,
		reasonCodeMatch: strictMatch,
		strictMatch,
		scored,
		infrastructureInvalidReason: scored ? null : 'provider rejection',
		repaired: index === 2,
		planCritical: false,
		reviewed: false,
		reviewReason: null,
		modelCallCount: 1,
		durationMs: index * 100,
		usage: [
			{
				model: 'model-pin',
				provider: 'provider-a',
				promptTokens: 100,
				completionTokens: 20,
				totalTokens: 120,
				totalCostUsd: 0.01,
				billingDisposition: 'settled'
			}
		],
		error: null
	};
}

describe('Phase A route evaluation report', () => {
	it('uses nearest-rank latency percentiles', () => {
		expect(routeEvalPercentile([100, 200, 300], 0.5)).toBe(200);
		expect(routeEvalPercentile([100, 200, 300], 0.95)).toBe(300);
	});

	it('scores only eligible runs while retaining invalid-run spend', () => {
		const aggregate = aggregateRouteEvalRuns([
			run(1, true),
			run(2, false),
			run(3, true, false)
		]);
		expect(aggregate).toMatchObject({
			runCount: 3,
			scoredRunCount: 2,
			infrastructureInvalidCount: 1,
			strictMatchCount: 1,
			decisionAccuracy: 0.5,
			repairCount: 1,
			totalCostUsd: 0.03
		});
	});

	it('derives the pre-registered A1 decision band', () => {
		const runs = Array.from({ length: 10 }, (_, index) => run(index + 1, index < 8));
		const report = buildRouteEvalReport({
			corpusVersion: 'corpus-v1',
			promptVersion: 'prompt-v1',
			promptSha256: 'a'.repeat(64),
			worldCardVersion: 'world-v1',
			worldCardSha256: 'b'.repeat(64),
			modelPin: 'model-pin',
			profile: 'fast',
			runs,
			generatedAt: '2026-07-24T23:00:00.000Z'
		});
		expect(report.summary.routeAccuracyDecision).toBe('change');
		expect(report.profile).toBe('fast');
		expect(report.routing_strategy).toBe('single_model');
		expect(report.review_model_pin).toBeNull();
		expect(report.review_prompt_version).toBeNull();
		expect(report.review_prompt_sha256).toBeNull();
		expect(report.summary.models).toEqual(['model-pin']);
		expect(report.summary.providers).toEqual(['provider-a']);
	});

	it('records the independently frozen review prompt', () => {
		const report = buildRouteEvalReport({
			corpusVersion: 'corpus-v1',
			promptVersion: 'prompt-v1',
			promptSha256: 'a'.repeat(64),
			worldCardVersion: 'world-v1',
			worldCardSha256: 'b'.repeat(64),
			modelPin: 'fast -> review',
			routingStrategy: 'fast_then_review',
			reviewModelPin: 'review',
			reviewPolicyVersion: 'policy-v2',
			reviewPromptVersion: 'scope-v1',
			reviewPromptSha256: 'c'.repeat(64),
			runs: [run(1, true)]
		});

		expect(report.review_prompt_version).toBe('scope-v1');
		expect(report.review_prompt_sha256).toBe('c'.repeat(64));
	});

	it('keeps comparison-scenario reason accuracy diagnostic after plan selection is decoupled', () => {
		const runs = Array.from({ length: 27 }, (_, index) => ({
			...run(index + 1, true),
			planCritical: true,
			actualReasonCode: 'multi_step_synthesis',
			reasonCodeMatch: false,
			strictMatch: false
		}));
		const report = buildRouteEvalReport({
			corpusVersion: 'corpus-v1',
			promptVersion: 'prompt-v1',
			promptSha256: 'a'.repeat(64),
			worldCardVersion: 'world-v1',
			worldCardSha256: 'b'.repeat(64),
			modelPin: 'model-pin',
			profile: 'fast',
			gatePlanCriticalReasons: false,
			runs
		});

		expect(report.summary.overall.routeAccuracy).toBe(1);
		expect(report.summary.overall.planCriticalReasonMatchCount).toBe(0);
		expect(report.summary.planCriticalReasonGateApplied).toBe(false);
		expect(report.summary.planCriticalReasonBoundPassed).toBeNull();
		expect(report.summary.routeAccuracyDecision).toBe('go_candidate');
	});

	it('retains the historical reason gate when explicitly requested', () => {
		const runs = Array.from({ length: 27 }, (_, index) => ({
			...run(index + 1, true),
			planCritical: true,
			actualReasonCode: 'multi_step_synthesis',
			reasonCodeMatch: false,
			strictMatch: false
		}));
		const report = buildRouteEvalReport({
			corpusVersion: 'corpus-v1',
			promptVersion: 'prompt-v1',
			promptSha256: 'a'.repeat(64),
			worldCardVersion: 'world-v1',
			worldCardSha256: 'b'.repeat(64),
			modelPin: 'model-pin',
			profile: 'fast',
			gatePlanCriticalReasons: true,
			runs
		});

		expect(report.summary.planCriticalReasonGateApplied).toBe(true);
		expect(report.summary.planCriticalReasonBoundPassed).toBe(false);
		expect(report.summary.routeAccuracyDecision).toBe('change');
	});
});
