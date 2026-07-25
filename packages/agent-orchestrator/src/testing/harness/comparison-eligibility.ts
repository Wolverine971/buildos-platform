// packages/agent-orchestrator/src/testing/harness/comparison-eligibility.ts
//
// Which comparison scenarios may enter the PRIMARY blind-win denominator.
//
// Frozen amendment 4 (PHASE_A_FALSIFICATION_PLAN.md), recorded before any workflow output was
// scored. C07's control arm is not a weak answer — all three control runs terminated with a stream
// error after skill loading and produced 73–173 characters. The frozen validity rule already calls
// a harness failure infrastructure-invalid; it was applied to the workflow lane's ZDR failures but
// not to the control lane's crash. Both asymmetries favored the workflow lane.
//
// IMPORTANT: excluding C07 REDUCES the primary sample from 9 pairs to 6 and therefore reduces
// power. It is not a fix on its own — it removes a bias, and must be paired with growing the
// comparison corpus before the result can decide anything. Under a coin-flip null, 4-of-6 occurs
// 34.4% of the time and 5-of-6 occurs 10.9%; neither is a 5% test. See
// research/03_EVAL_METHODOLOGY_PRACTITIONERS.md and research/04_AGENT_BENCHMARKS_AND_HARNESS_DESIGN.md.
export const COMPARISON_SCENARIO_IDS = [
	'a0-c06-single-source-article',
	'a0-c07-campaign-workflow-research',
	'a0-c08-context-app-recommendation'
] as const;

export type ComparisonScenarioId = (typeof COMPARISON_SCENARIO_IDS)[number];

export interface ExcludedComparisonScenario {
	scenarioId: ComparisonScenarioId;
	reason: string;
	/** Set when a re-run of the affected arm would restore the scenario to the primary set. */
	restoredBy: string | null;
}

export const EXCLUDED_FROM_PRIMARY: ExcludedComparisonScenario[] = [
	{
		scenarioId: 'a0-c07-campaign-workflow-research',
		reason:
			'All three control runs terminated with a stream error after skill loading and produced ' +
			'73–173 characters. A crashed control arm is a harness failure under the frozen ' +
			'invalid-run rule, so these pairs cannot be evidence about architecture.',
		restoredBy:
			'A fresh control cohort for C07 that completes normally. Until then C07 is reported ' +
			'separately and never counted as a workflow win.'
	}
];

export function isExcludedFromPrimary(scenarioId: string): boolean {
	return EXCLUDED_FROM_PRIMARY.some((entry) => entry.scenarioId === scenarioId);
}

/** Scenario ids eligible for the primary blind-win denominator. */
export function primaryComparisonScenarioIds(): ComparisonScenarioId[] {
	return COMPARISON_SCENARIO_IDS.filter((id) => !isExcludedFromPrimary(id));
}

export interface PrimaryDenominator {
	scenarioIds: ComparisonScenarioId[];
	runsPerScenario: number;
	pairCount: number;
	excluded: ExcludedComparisonScenario[];
}

export function primaryDenominator(runsPerScenario = 3): PrimaryDenominator {
	const scenarioIds = primaryComparisonScenarioIds();
	return {
		scenarioIds,
		runsPerScenario,
		pairCount: scenarioIds.length * runsPerScenario,
		excluded: EXCLUDED_FROM_PRIMARY
	};
}

/**
 * Exact two-sided-null probability of observing at least `wins` of `pairs` under a fair coin.
 * Reported alongside any win count so a threshold is never mistaken for a significance test.
 */
export function binomialTailProbability(wins: number, pairs: number): number {
	if (pairs <= 0 || wins > pairs) return 0;
	let choose = 1;
	let total = 0;
	for (let index = 0; index <= pairs; index += 1) {
		if (index >= wins) total += choose;
		choose = (choose * (pairs - index)) / (index + 1);
	}
	return total / 2 ** pairs;
}
