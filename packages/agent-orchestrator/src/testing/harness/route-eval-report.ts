// packages/agent-orchestrator/src/testing/harness/route-eval-report.ts
export interface RouteEvalUsageEvent {
	model: string;
	provider: string | null;
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	totalCostUsd: number;
	billingDisposition: string | null;
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
	runs: RouteEvalRun[];
	summary: {
		overall: RouteEvalAggregate;
		byScenario: Record<string, RouteEvalAggregate>;
		byClass: Record<string, RouteEvalAggregate>;
		models: string[];
		providers: string[];
		decision: 'go_candidate' | 'change' | 'stop';
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
	runs: RouteEvalRun[];
	generatedAt?: string;
}): PhaseARouteEvalReport {
	const overall = aggregateRouteEvalRuns(params.runs);
	const decision =
		overall.routeAccuracy >= 0.9
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
			decision
		}
	};
}
