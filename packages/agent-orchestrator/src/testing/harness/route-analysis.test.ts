// packages/agent-orchestrator/src/testing/harness/route-analysis.test.ts
import { describe, expect, it } from 'vitest';

import {
	analyzeRouteItems,
	buildRouteConfusionMatrix,
	maxReachableCallScore
} from './route-analysis';
import type { RouteEvalRun } from './route-eval-report';

function run(overrides: Partial<RouteEvalRun> & { scenarioId: string }): RouteEvalRun {
	return {
		scenarioClass: 'simple_read',
		runIndex: 1,
		replacementIndex: 0,
		expectedRoute: 'direct',
		expectedReasonCode: 'simple_read',
		actualRoute: 'direct',
		actualReasonCode: 'simple_read',
		routeMatch: true,
		reasonCodeMatch: true,
		strictMatch: true,
		scored: true,
		infrastructureInvalidReason: null,
		repaired: false,
		planCritical: false,
		reviewed: null,
		reviewReason: null,
		modelCallCount: 1,
		durationMs: 900,
		usage: [],
		error: null,
		...overrides
	};
}

function block(
	scenarioId: string,
	expectedRoute: string,
	observed: (string | null)[]
): RouteEvalRun[] {
	return observed.map((actualRoute, index) =>
		run({
			scenarioId,
			expectedRoute,
			actualRoute,
			runIndex: index + 1,
			routeMatch: actualRoute === expectedRoute
		})
	);
}

describe('route confusion matrix', () => {
	it('locates every error on the boundary where it actually occurred', () => {
		const runs = [
			...block('c01', 'direct', Array(3).fill('direct')),
			...block('c09', 'clarify', Array(3).fill('workflow')),
			...block('c08', 'workflow', ['workflow', 'clarify', 'workflow'])
		];
		const confusion = buildRouteConfusionMatrix(runs);

		expect(confusion.scoredCallCount).toBe(9);
		expect(confusion.matrix.clarify.workflow).toBe(3);
		expect(confusion.matrix.workflow.clarify).toBe(1);
		expect(confusion.matrix.direct.direct).toBe(3);
		// Every confusion sits on the clarify<->workflow boundary; nothing touches direct.
		expect(confusion.confusions).toEqual([
			{ expected: 'clarify', observed: 'workflow', count: 3 },
			{ expected: 'workflow', observed: 'clarify', count: 1 }
		]);
	});

	it('counts a null route as an observed outcome rather than dropping it', () => {
		const confusion = buildRouteConfusionMatrix(block('c07', 'workflow', ['workflow', null]));
		expect(confusion.matrix.workflow.null).toBe(1);
	});

	it('ignores infrastructure-invalid runs', () => {
		const runs = [
			...block('c01', 'direct', ['direct']),
			run({
				scenarioId: 'c01',
				actualRoute: null,
				routeMatch: false,
				scored: false,
				infrastructureInvalidReason: 'pin mismatch'
			})
		];
		expect(buildRouteConfusionMatrix(runs).scoredCallCount).toBe(1);
	});
});

describe('item-level analysis', () => {
	const runs = [
		...block('c01', 'direct', Array(9).fill('direct')),
		...block('c08', 'workflow', [
			'workflow',
			'workflow',
			'workflow',
			'workflow',
			'workflow',
			'workflow',
			'clarify',
			'clarify',
			'clarify'
		]),
		...block('c09', 'clarify', Array(9).fill('workflow'))
	];

	it('separates item accuracy from call accuracy', () => {
		const analysis = analyzeRouteItems(runs);
		expect(analysis.itemCount).toBe(3);
		// 21 of 27 calls correct (77.8%), but 2 of 3 items correct (66.7%) — different questions.
		expect(analysis.majorityCorrectCount).toBe(2);
		expect(analysis.passPowKCount).toBe(1);
		expect(analysis.passAtKCount).toBe(2);
	});

	it('flags a systematically failing item', () => {
		expect(analyzeRouteItems(runs).systematicFailureScenarioIds).toEqual(['c09']);
	});

	it('reports self-consistency, which is what the replicates actually measure', () => {
		// c01 9/9, c08 6/9, c09 9/9 modal agreement -> (1 + 0.667 + 1) / 3
		expect(analyzeRouteItems(runs).meanSelfConsistency).toBeCloseTo(0.888889, 5);
	});
});

describe('reachable score under systematic failure', () => {
	it('shows a 65/72 bound cannot tolerate even one systematically failing scenario', () => {
		expect(
			maxReachableCallScore({
				scenarioCount: 8,
				runsPerScenario: 9,
				systematicFailureCount: 1
			})
		).toBe(63);
		expect(
			maxReachableCallScore({
				scenarioCount: 8,
				runsPerScenario: 9,
				systematicFailureCount: 0
			})
		).toBe(72);
	});
});
