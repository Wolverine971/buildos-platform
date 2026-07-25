// packages/agent-orchestrator/src/testing/harness/route-analysis.ts
//
// Derived analysis over an existing route-eval report. Pure functions, no I/O, no model calls —
// everything here is recomputable from result JSON that has already been paid for.
//
// Why this exists: `routeAccuracy` aggregates 8 scenarios x 9 replicates into one micro-average,
// which hides the only signal that matters. The v5 run reported 80.6%; the actual structure was
// "six scenarios perfect, one scenario 0/9, and every error on a single route boundary." A micro-
// average cannot express that; a confusion matrix and item-level metrics can.
//
// Terminology follows tau-bench: pass@k = solved at least once in k trials (optimistic),
// pass^k = solved in EVERY one of k trials (reliability). A production router needs pass^k.
// See research/04_AGENT_BENCHMARKS_AND_HARNESS_DESIGN.md and research/10_ROUTING_FAILURE_FORENSICS.md.
import type { RouteEvalRun } from './route-eval-report';

export const ROUTE_LABELS = ['direct', 'workflow', 'clarify', 'capability_gap'] as const;
export type RouteLabel = (typeof ROUTE_LABELS)[number];

/** `null` is a real observed outcome: a truncated or unparseable model response. */
export type ObservedRoute = RouteLabel | 'null';

export interface RouteConfusionMatrix {
	/** `matrix[expected][observed]` call counts over scored runs. */
	matrix: Record<RouteLabel, Record<ObservedRoute, number>>;
	/** Off-diagonal cells with at least one call, worst first. */
	confusions: { expected: RouteLabel; observed: ObservedRoute; count: number }[];
	scoredCallCount: number;
}

export interface RouteItemResult {
	scenarioId: string;
	scenarioClass: string;
	expectedRoute: string;
	runCount: number;
	correctCount: number;
	/** Modal observed route, and how many runs agreed with it. */
	modalRoute: ObservedRoute | null;
	modalCount: number;
	/** Correct on at least one run. */
	passAtK: boolean;
	/** Correct on every run — the reliability metric. */
	passPowK: boolean;
	/** Correct on a majority of runs. */
	majorityCorrect: boolean;
	/** Zero correct across every run: by Anthropic's heuristic, a broken-item signal. */
	systematicFailure: boolean;
}

export interface RouteItemAnalysis {
	items: RouteItemResult[];
	itemCount: number;
	/** Scenarios whose majority answer is correct — the honest denominator is items, not calls. */
	majorityCorrectCount: number;
	passAtKCount: number;
	passPowKCount: number;
	systematicFailureScenarioIds: string[];
	/**
	 * Mean share of runs agreeing with their own modal answer. Near 1.0 means the router is
	 * self-consistent and the replicates carry almost no independent information — which is what
	 * makes a call-level denominator misleading.
	 */
	meanSelfConsistency: number;
}

function emptyRow(): Record<ObservedRoute, number> {
	return { direct: 0, workflow: 0, clarify: 0, capability_gap: 0, null: 0 };
}

function asObserved(route: string | null): ObservedRoute {
	return route && (ROUTE_LABELS as readonly string[]).includes(route)
		? (route as RouteLabel)
		: 'null';
}

export function buildRouteConfusionMatrix(runs: RouteEvalRun[]): RouteConfusionMatrix {
	const scored = runs.filter((run) => run.scored);
	const matrix = Object.fromEntries(ROUTE_LABELS.map((label) => [label, emptyRow()])) as Record<
		RouteLabel,
		Record<ObservedRoute, number>
	>;

	for (const run of scored) {
		if (!(ROUTE_LABELS as readonly string[]).includes(run.expectedRoute)) continue;
		matrix[run.expectedRoute as RouteLabel][asObserved(run.actualRoute)] += 1;
	}

	const confusions = ROUTE_LABELS.flatMap((expected) =>
		(Object.keys(matrix[expected]) as ObservedRoute[])
			.filter((observed) => observed !== expected && matrix[expected][observed] > 0)
			.map((observed) => ({ expected, observed, count: matrix[expected][observed] }))
	).sort((left, right) => right.count - left.count);

	return { matrix, confusions, scoredCallCount: scored.length };
}

export function analyzeRouteItems(runs: RouteEvalRun[]): RouteItemAnalysis {
	const scored = runs.filter((run) => run.scored);
	const byScenario = new Map<string, RouteEvalRun[]>();
	for (const run of scored) {
		byScenario.set(run.scenarioId, [...(byScenario.get(run.scenarioId) ?? []), run]);
	}

	const items: RouteItemResult[] = Array.from(byScenario.entries())
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([scenarioId, scenarioRuns]) => {
			const counts = new Map<ObservedRoute, number>();
			for (const run of scenarioRuns) {
				const observed = asObserved(run.actualRoute);
				counts.set(observed, (counts.get(observed) ?? 0) + 1);
			}
			const [modalRoute, modalCount] = Array.from(counts.entries()).sort(
				([leftRoute, leftCount], [rightRoute, rightCount]) =>
					rightCount - leftCount || leftRoute.localeCompare(rightRoute)
			)[0] ?? [null, 0];
			const correctCount = scenarioRuns.filter((run) => run.routeMatch).length;

			return {
				scenarioId,
				scenarioClass: scenarioRuns[0]!.scenarioClass,
				expectedRoute: scenarioRuns[0]!.expectedRoute,
				runCount: scenarioRuns.length,
				correctCount,
				modalRoute,
				modalCount,
				passAtK: correctCount > 0,
				passPowK: correctCount === scenarioRuns.length,
				majorityCorrect: correctCount * 2 > scenarioRuns.length,
				systematicFailure: correctCount === 0
			};
		});

	const meanSelfConsistency =
		items.length > 0
			? items.reduce((total, item) => total + item.modalCount / item.runCount, 0) /
				items.length
			: 0;

	return {
		items,
		itemCount: items.length,
		majorityCorrectCount: items.filter((item) => item.majorityCorrect).length,
		passAtKCount: items.filter((item) => item.passAtK).length,
		passPowKCount: items.filter((item) => item.passPowK).length,
		systematicFailureScenarioIds: items
			.filter((item) => item.systematicFailure)
			.map((item) => item.scenarioId),
		meanSelfConsistency: Math.round(meanSelfConsistency * 1e6) / 1e6
	};
}

/**
 * The maximum call-level score still reachable once a scenario fails systematically.
 *
 * With `runsPerScenario` replicates and near-deterministic behavior, one systematically-failing item
 * costs a full block of calls. This makes explicit what the 65/72 bound actually required: at most
 * 7 wrong calls, i.e. NO scenario may fail systematically, because a single one costs 9.
 */
export function maxReachableCallScore(params: {
	scenarioCount: number;
	runsPerScenario: number;
	systematicFailureCount: number;
}): number {
	const total = params.scenarioCount * params.runsPerScenario;
	return total - params.systematicFailureCount * params.runsPerScenario;
}
