// packages/agent-orchestrator/src/testing/harness/route-eval-report.ts

/**
 * The three scenarios that feed the A2 blind comparison. Their reason-code distribution remains
 * reported for historical comparison, but observable request features now select the workflow
 * topology. See PHASE_A_AUDIT_2026-07-25.md B1 and amendment 2 in the falsification plan.
 */
export const PLAN_CRITICAL_SCENARIO_IDS = [
	'a0-c06-single-source-article',
	'a0-c07-campaign-workflow-research',
	'a0-c08-context-app-recommendation'
] as const;

/**
 * Smallest discrete result at or above the 90% architecture target over 27 plan-critical calls
 * (3 scenarios x 9), derived the same way as the frozen 65/72 route bound.
 */
export const PLAN_CRITICAL_REASON_BOUND = 25;
export const PLAN_CRITICAL_CALL_COUNT = 27;

export function isPlanCriticalScenario(scenarioId: string): boolean {
	return (PLAN_CRITICAL_SCENARIO_IDS as readonly string[]).includes(scenarioId);
}

export interface RouteEvalUsageEvent {
	model: string;
	provider: string | null;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	totalCostUsd: number;
	billingDisposition: string | null;
	/**
	 * Which pinned role produced this call. Per-role pin verification (audit S4) rejects an untagged
	 * event, so this is load-bearing for run validity — it was previously set and read as untyped
	 * JS because the paid harness was outside every typecheck.
	 * See research/09_INTERNAL_GROUND_TRUTH_MAP.md D2.
	 */
	role?: 'route_primary' | 'route_reviewer' | null;
}

export interface RouteEvalRun {
	scenarioId: string;
	scenarioClass: string;
	runIndex: number;
	replacementIndex: number;
	expectedRoute: string;
	expectedReasonCode: string;
	actualRoute: string | null;
	actualReasonCode: string | null;
	routeMatch: boolean;
	reasonCodeMatch: boolean;
	strictMatch: boolean;
	scored: boolean;
	infrastructureInvalidReason: string | null;
	repaired: boolean;
	/** True for one of the three A2 comparison scenarios. */
	planCritical: boolean;
	/** Whether the bounded GLM reviewer was invoked, and why. Null under single-model strategies. */
	reviewed: boolean | null;
	reviewReason: string | null;
	modelCallCount: number;
	durationMs: number;
	usage: RouteEvalUsageEvent[];
	error: string | null;
}

export interface RouteEvalAggregate {
	runCount: number;
	scoredRunCount: number;
	infrastructureInvalidCount: number;
	routeMatchCount: number;
	reasonCodeMatchCount: number;
	strictMatchCount: number;
	routeAccuracy: number;
	reasonCodeAccuracy: number;
	decisionAccuracy: number;
	repairCount: number;
	reviewedCount: number;
	planCriticalRunCount: number;
	planCriticalReasonMatchCount: number;
	planCriticalReasonAccuracy: number;
	latencyP50Ms: number | null;
	latencyP95Ms: number | null;
	meanCostUsd: number;
	totalCostUsd: number;
}

export interface PhaseARouteEvalReport {
	schema_version: 1;
	corpus_version: string;
	lane: 'phase-a-ceo-route';
	prompt_version: string;
	prompt_sha256: string;
	world_card_version: string;
	world_card_sha256: string;
	generated_at: string;
	model_pin: string;
	profile: 'fast' | 'balanced' | 'powerful' | 'maximum' | 'custom';
	routing_strategy: 'single_model' | 'fast_then_review';
	review_model_pin: string | null;
	review_policy_version: string | null;
	review_prompt_version: string | null;
	review_prompt_sha256: string | null;
	runs: RouteEvalRun[];
	summary: {
		overall: RouteEvalAggregate;
		byScenario: Record<string, RouteEvalAggregate>;
		byClass: Record<string, RouteEvalAggregate>;
		models: string[];
		providers: string[];
		routeAccuracyBoundPassed: boolean;
		/** Null when the run did not cover all 27 plan-critical calls. */
		planCriticalReasonBoundPassed: boolean | null;
		planCriticalReasonGateApplied: boolean;
		/**
		 * Derived from ROUTE ACCURACY ALONE. This is not the pre-registered Phase A decision, which
		 * also depends on direct-path latency bounds, cost, blind wins, and safety. Two artifacts
		 * carry `go_candidate` here while the docs correctly record Change (route-eval-v4, which
		 * failed latency) or "reported only" (route-eval-holdout-v1, a non-gating set).
		 * Named explicitly so a reader of the JSON alone cannot mistake it for the real verdict.
		 * See research/09_INTERNAL_GROUND_TRUTH_MAP.md D4.
		 */
		routeAccuracyDecision: 'go_candidate' | 'change' | 'stop';
	};
}

function round(value: number, places = 6): number {
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
}

export function routeEvalPercentile(values: number[], percentile: number): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const rank = Math.max(1, Math.ceil(percentile * sorted.length));
	return sorted[Math.min(rank - 1, sorted.length - 1)] ?? null;
}

export function aggregateRouteEvalRuns(runs: RouteEvalRun[]): RouteEvalAggregate {
	const scored = runs.filter((run) => run.scored);
	const planCritical = scored.filter(
		(run) => run.planCritical ?? isPlanCriticalScenario(run.scenarioId)
	);
	const allCosts = runs.map((run) =>
		run.usage.reduce((total, event) => total + event.totalCostUsd, 0)
	);
	const totalCostUsd = allCosts.reduce((total, cost) => total + cost, 0);
	const scoredCosts = scored.map((run) =>
		run.usage.reduce((total, event) => total + event.totalCostUsd, 0)
	);

	return {
		runCount: runs.length,
		scoredRunCount: scored.length,
		infrastructureInvalidCount: runs.filter((run) => !run.scored).length,
		routeMatchCount: scored.filter((run) => run.routeMatch).length,
		reasonCodeMatchCount: scored.filter((run) => run.reasonCodeMatch).length,
		strictMatchCount: scored.filter((run) => run.strictMatch).length,
		routeAccuracy:
			scored.length > 0
				? round(scored.filter((run) => run.routeMatch).length / scored.length)
				: 0,
		reasonCodeAccuracy:
			scored.length > 0
				? round(scored.filter((run) => run.reasonCodeMatch).length / scored.length)
				: 0,
		decisionAccuracy:
			scored.length > 0
				? round(scored.filter((run) => run.strictMatch).length / scored.length)
				: 0,
		repairCount: scored.filter((run) => run.repaired).length,
		reviewedCount: scored.filter((run) => run.reviewed === true).length,
		planCriticalRunCount: planCritical.length,
		planCriticalReasonMatchCount: planCritical.filter((run) => run.reasonCodeMatch).length,
		planCriticalReasonAccuracy:
			planCritical.length > 0
				? round(
						planCritical.filter((run) => run.reasonCodeMatch).length /
							planCritical.length
					)
				: 0,
		latencyP50Ms: routeEvalPercentile(
			scored.map((run) => run.durationMs),
			0.5
		),
		latencyP95Ms: routeEvalPercentile(
			scored.map((run) => run.durationMs),
			0.95
		),
		meanCostUsd:
			scoredCosts.length > 0
				? round(scoredCosts.reduce((total, cost) => total + cost, 0) / scoredCosts.length)
				: 0,
		totalCostUsd: round(totalCostUsd)
	};
}

function groupRuns(runs: RouteEvalRun[], key: (run: RouteEvalRun) => string) {
	const groups = new Map<string, RouteEvalRun[]>();
	for (const run of runs) {
		const groupKey = key(run);
		groups.set(groupKey, [...(groups.get(groupKey) ?? []), run]);
	}
	return Object.fromEntries(
		Array.from(groups.entries()).map(([groupKey, groupRuns]) => [
			groupKey,
			aggregateRouteEvalRuns(groupRuns)
		])
	);
}

export function buildRouteEvalReport(params: {
	corpusVersion: string;
	promptVersion: string;
	promptSha256: string;
	worldCardVersion: string;
	worldCardSha256: string;
	modelPin: string;
	profile?: PhaseARouteEvalReport['profile'];
	routingStrategy?: PhaseARouteEvalReport['routing_strategy'];
	reviewModelPin?: string | null;
	reviewPolicyVersion?: string | null;
	reviewPromptVersion?: string | null;
	reviewPromptSha256?: string | null;
	gatePlanCriticalReasons?: boolean;
	runs: RouteEvalRun[];
	generatedAt?: string;
}): PhaseARouteEvalReport {
	const overall = aggregateRouteEvalRuns(params.runs);
	const routeAccuracyBoundPassed = overall.routeAccuracy >= 0.9;
	const planCriticalReasonGateApplied = params.gatePlanCriticalReasons ?? false;
	// The historical reason bound is applicable only while a model reason label selects topology.
	// Once plan selection is feature-derived, the same metric remains diagnostic and reports null.
	const planCriticalReasonBoundPassed =
		planCriticalReasonGateApplied && overall.planCriticalRunCount >= PLAN_CRITICAL_CALL_COUNT
			? overall.planCriticalReasonMatchCount >= PLAN_CRITICAL_REASON_BOUND
			: null;
	const routeAccuracyDecision =
		routeAccuracyBoundPassed && planCriticalReasonBoundPassed !== false
			? 'go_candidate'
			: overall.routeAccuracy >= 0.75
				? 'change'
				: 'stop';

	return {
		schema_version: 1,
		corpus_version: params.corpusVersion,
		lane: 'phase-a-ceo-route',
		prompt_version: params.promptVersion,
		prompt_sha256: params.promptSha256,
		world_card_version: params.worldCardVersion,
		world_card_sha256: params.worldCardSha256,
		generated_at: params.generatedAt ?? new Date().toISOString(),
		model_pin: params.modelPin,
		profile: params.profile ?? 'powerful',
		routing_strategy: params.routingStrategy ?? 'single_model',
		review_model_pin: params.reviewModelPin ?? null,
		review_policy_version: params.reviewPolicyVersion ?? null,
		review_prompt_version: params.reviewPromptVersion ?? null,
		review_prompt_sha256: params.reviewPromptSha256 ?? null,
		runs: params.runs,
		summary: {
			overall,
			byScenario: groupRuns(params.runs, (run) => run.scenarioId),
			byClass: groupRuns(params.runs, (run) => run.scenarioClass),
			models: Array.from(
				new Set(params.runs.flatMap((run) => run.usage.map((event) => event.model)))
			).sort(),
			providers: Array.from(
				new Set(
					params.runs.flatMap((run) =>
						run.usage.flatMap((event) => (event.provider ? [event.provider] : []))
					)
				)
			).sort(),
			routeAccuracyBoundPassed,
			planCriticalReasonBoundPassed,
			planCriticalReasonGateApplied,
			routeAccuracyDecision
		}
	};
}
