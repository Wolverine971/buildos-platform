// apps/web/src/lib/services/agentic-chat-v2/prompt-eval-comparison.ts
import { LITE_PROMPT_VARIANT } from '$lib/services/agentic-chat-lite/prompt/types';
import { FASTCHAT_PROMPT_VARIANT } from './prompt-variant';

export type PromptEvalAssertionCounts = {
	passed: number;
	failed: number;
	skipped: number;
};

export type PromptEvalVariantEvidence = {
	scenarioSlug: string;
	scenarioTitle?: string | null;
	scenarioVersion?: string | null;
	turnRunId: string;
	evalRunId?: string | null;
	promptVariant?: string | null;
	snapshotVersion?: string | null;
	status?: string | null;
	finishedReason?: string | null;
	firstLane?: string | null;
	firstCanonicalOp?: string | null;
	firstSkillPath?: string | null;
	validationFailureCount?: number | null;
	toolRoundCount?: number | null;
	toolCallCount?: number | null;
	llmPassCount?: number | null;
	promptTokens?: number | null;
	latencyMs?: number | null;
	evalStatus?: string | null;
	assertionCounts?: Partial<PromptEvalAssertionCounts> | null;
	startedAt?: string | null;
	completedAt?: string | null;
};

export type PromptEvalScenarioVerdict =
	| 'lite_better'
	| 'lite_worse'
	| 'mixed'
	| 'unchanged'
	| 'missing_evidence';

export type PromptEvalVariantMetricDeltas = {
	promptTokens: number | null;
	latencyMs: number | null;
	validationFailures: number | null;
	toolRounds: number | null;
	toolCalls: number | null;
	llmPasses: number | null;
	failedAssertions: number | null;
};

export type PromptEvalVariantScenarioComparison = {
	scenarioSlug: string;
	scenarioTitle: string | null;
	baseline: PromptEvalVariantEvidence | null;
	candidate: PromptEvalVariantEvidence | null;
	missingVariants: string[];
	verdict: PromptEvalScenarioVerdict;
	metricDeltas: PromptEvalVariantMetricDeltas;
	failureVariants: string[];
	reasons: string[];
};

export type PromptEvalVariantComparisonTotals = {
	scenarioCount: number;
	pairedScenarioCount: number;
	missingScenarioCount: number;
	failedScenarioCount: number;
	candidateBetterCount: number;
	candidateWorseCount: number;
	mixedCount: number;
	unchangedCount: number;
	baselinePromptTokensTotal: number | null;
	candidatePromptTokensTotal: number | null;
	promptTokenDeltaTotal: number | null;
	promptTokenDeltaPercent: number | null;
};

export type PromptEvalVariantComparisonReport = {
	baselineVariant: string;
	candidateVariant: string;
	scenarios: PromptEvalVariantScenarioComparison[];
	totals: PromptEvalVariantComparisonTotals;
};

export type PromptEvalVariantComparisonOptions = {
	baselineVariant?: string;
	candidateVariant?: string;
};

type IndexedEvidence = {
	evidence: PromptEvalVariantEvidence;
	index: number;
};

const UNKNOWN_VARIANT = 'unknown';

const normalizeText = (value: unknown): string | null => {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const normalizeNumber = (value: unknown): number | null => {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string') {
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value && typeof value === 'object' && !Array.isArray(value));

export function normalizePromptEvalEvidenceVariant(
	evidence: Pick<PromptEvalVariantEvidence, 'promptVariant' | 'snapshotVersion'>
): string {
	return (
		normalizeText(evidence.promptVariant) ??
		normalizeText(evidence.snapshotVersion) ??
		UNKNOWN_VARIANT
	);
}

export function formatPromptVariantLabel(variant: string | null | undefined): string {
	if (variant === FASTCHAT_PROMPT_VARIANT) return 'FastChat v2';
	if (variant === LITE_PROMPT_VARIANT) return 'Lite seed';
	return normalizeText(variant) ?? UNKNOWN_VARIANT;
}

export function readPromptEvalAssertionCounts(summary: unknown): PromptEvalAssertionCounts | null {
	if (!isRecord(summary) || !isRecord(summary.assertion_counts)) return null;
	const passed = normalizeNumber(summary.assertion_counts.passed);
	const failed = normalizeNumber(summary.assertion_counts.failed);
	const skipped = normalizeNumber(summary.assertion_counts.skipped);
	if (passed === null && failed === null && skipped === null) return null;
	return {
		passed: passed ?? 0,
		failed: failed ?? 0,
		skipped: skipped ?? 0
	};
}

const assertionFailedCount = (evidence: PromptEvalVariantEvidence | null): number | null => {
	if (!evidence?.assertionCounts) return null;
	const failed = normalizeNumber(evidence.assertionCounts.failed);
	return failed ?? 0;
};

const evidenceHasFailure = (evidence: PromptEvalVariantEvidence | null): boolean => {
	if (!evidence) return false;
	const evalStatus = normalizeText(evidence.evalStatus)?.toLowerCase() ?? null;
	if (evalStatus === 'failed' || evalStatus === 'error') return true;
	if ((assertionFailedCount(evidence) ?? 0) > 0) return true;
	const turnStatus = normalizeText(evidence.status)?.toLowerCase() ?? null;
	if (turnStatus === 'failed' || turnStatus === 'error' || turnStatus === 'cancelled') {
		return true;
	}
	return false;
};

const metricDelta = (candidate: unknown, baseline: unknown): number | null => {
	const candidateValue = normalizeNumber(candidate);
	const baselineValue = normalizeNumber(baseline);
	if (candidateValue === null || baselineValue === null) return null;
	return candidateValue - baselineValue;
};

const buildMetricDeltas = (
	baseline: PromptEvalVariantEvidence | null,
	candidate: PromptEvalVariantEvidence | null
): PromptEvalVariantMetricDeltas => ({
	promptTokens: metricDelta(candidate?.promptTokens, baseline?.promptTokens),
	latencyMs: metricDelta(candidate?.latencyMs, baseline?.latencyMs),
	validationFailures: metricDelta(
		candidate?.validationFailureCount,
		baseline?.validationFailureCount
	),
	toolRounds: metricDelta(candidate?.toolRoundCount, baseline?.toolRoundCount),
	toolCalls: metricDelta(candidate?.toolCallCount, baseline?.toolCallCount),
	llmPasses: metricDelta(candidate?.llmPassCount, baseline?.llmPassCount),
	failedAssertions: metricDelta(assertionFailedCount(candidate), assertionFailedCount(baseline))
});

const addMetricReason = (params: {
	reasons: string[];
	improvements: string[];
	regressions: string[];
	delta: number | null;
	label: string;
}): void => {
	if (params.delta === null || params.delta === 0) return;
	const formatted = params.delta > 0 ? `+${params.delta}` : String(params.delta);
	params.reasons.push(`${params.label} ${formatted}`);
	if (params.delta < 0) {
		params.improvements.push(params.label);
	} else {
		params.regressions.push(params.label);
	}
};

const compareScenario = (
	baseline: PromptEvalVariantEvidence | null,
	candidate: PromptEvalVariantEvidence | null,
	deltas: PromptEvalVariantMetricDeltas,
	baselineVariant: string,
	candidateVariant: string
): { verdict: PromptEvalScenarioVerdict; reasons: string[] } => {
	if (!baseline || !candidate) {
		return { verdict: 'missing_evidence', reasons: ['Missing paired variant evidence.'] };
	}

	const reasons: string[] = [];
	const improvements: string[] = [];
	const regressions: string[] = [];
	const baselineFailed = evidenceHasFailure(baseline);
	const candidateFailed = evidenceHasFailure(candidate);

	if (baselineFailed !== candidateFailed) {
		if (candidateFailed) {
			reasons.push(
				`${formatPromptVariantLabel(candidateVariant)} failed while ${formatPromptVariantLabel(
					baselineVariant
				)} did not.`
			);
			return { verdict: 'lite_worse', reasons };
		}
		reasons.push(
			`${formatPromptVariantLabel(candidateVariant)} avoided a failure seen in ${formatPromptVariantLabel(
				baselineVariant
			)}.`
		);
		return { verdict: 'lite_better', reasons };
	}

	addMetricReason({
		reasons,
		improvements,
		regressions,
		delta: deltas.failedAssertions,
		label: 'failed assertions'
	});
	addMetricReason({
		reasons,
		improvements,
		regressions,
		delta: deltas.validationFailures,
		label: 'validation failures'
	});
	addMetricReason({
		reasons,
		improvements,
		regressions,
		delta: deltas.toolRounds,
		label: 'tool rounds'
	});
	addMetricReason({
		reasons,
		improvements,
		regressions,
		delta: deltas.toolCalls,
		label: 'tool calls'
	});
	addMetricReason({
		reasons,
		improvements,
		regressions,
		delta: deltas.llmPasses,
		label: 'LLM passes'
	});
	addMetricReason({
		reasons,
		improvements,
		regressions,
		delta: deltas.latencyMs,
		label: 'latency ms'
	});
	addMetricReason({
		reasons,
		improvements,
		regressions,
		delta: deltas.promptTokens,
		label: 'prompt tokens'
	});

	if (improvements.length === 0 && regressions.length === 0) {
		return { verdict: 'unchanged', reasons: ['No measured deltas.'] };
	}
	if (improvements.length > 0 && regressions.length === 0) {
		return { verdict: 'lite_better', reasons };
	}
	if (regressions.length > 0 && improvements.length === 0) {
		return { verdict: 'lite_worse', reasons };
	}
	return { verdict: 'mixed', reasons };
};

const evidenceTimestamp = (evidence: PromptEvalVariantEvidence): string =>
	normalizeText(evidence.completedAt) ?? normalizeText(evidence.startedAt) ?? '';

const selectLatestEvidence = (items: IndexedEvidence[]): PromptEvalVariantEvidence | null => {
	if (items.length === 0) return null;
	return items.reduce((latest, item) => {
		const latestTime = evidenceTimestamp(latest.evidence);
		const itemTime = evidenceTimestamp(item.evidence);
		if (itemTime && (!latestTime || itemTime > latestTime)) return item;
		if (itemTime === latestTime && item.index > latest.index) return item;
		return latest;
	}).evidence;
};

const missingVariantList = (
	baseline: PromptEvalVariantEvidence | null,
	candidate: PromptEvalVariantEvidence | null,
	baselineVariant: string,
	candidateVariant: string
): string[] => {
	const missing: string[] = [];
	if (!baseline) missing.push(baselineVariant);
	if (!candidate) missing.push(candidateVariant);
	return missing;
};

export function buildPromptEvalVariantComparison(
	evidenceItems: PromptEvalVariantEvidence[],
	options: PromptEvalVariantComparisonOptions = {}
): PromptEvalVariantComparisonReport {
	const baselineVariant = options.baselineVariant ?? FASTCHAT_PROMPT_VARIANT;
	const candidateVariant = options.candidateVariant ?? LITE_PROMPT_VARIANT;
	const scenarioMap = new Map<
		string,
		{
			title: string | null;
			variants: Map<string, IndexedEvidence[]>;
		}
	>();

	evidenceItems.forEach((evidence, index) => {
		const scenarioSlug = normalizeText(evidence.scenarioSlug);
		if (!scenarioSlug) return;
		const existing = scenarioMap.get(scenarioSlug) ?? {
			title: normalizeText(evidence.scenarioTitle),
			variants: new Map<string, IndexedEvidence[]>()
		};
		if (!existing.title) existing.title = normalizeText(evidence.scenarioTitle);
		const variant = normalizePromptEvalEvidenceVariant(evidence);
		existing.variants.set(variant, [
			...(existing.variants.get(variant) ?? []),
			{ evidence, index }
		]);
		scenarioMap.set(scenarioSlug, existing);
	});

	const scenarios = [...scenarioMap.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([scenarioSlug, scenario]) => {
			const baseline = selectLatestEvidence(scenario.variants.get(baselineVariant) ?? []);
			const candidate = selectLatestEvidence(scenario.variants.get(candidateVariant) ?? []);
			const metricDeltas = buildMetricDeltas(baseline, candidate);
			const comparison = compareScenario(
				baseline,
				candidate,
				metricDeltas,
				baselineVariant,
				candidateVariant
			);
			const failureVariants: string[] = [];
			if (evidenceHasFailure(baseline)) failureVariants.push(baselineVariant);
			if (evidenceHasFailure(candidate)) failureVariants.push(candidateVariant);
			return {
				scenarioSlug,
				scenarioTitle: scenario.title,
				baseline,
				candidate,
				missingVariants: missingVariantList(
					baseline,
					candidate,
					baselineVariant,
					candidateVariant
				),
				verdict: comparison.verdict,
				metricDeltas,
				failureVariants,
				reasons: comparison.reasons
			};
		});

	const pairedTokenScenarios = scenarios.filter(
		(scenario) =>
			scenario.baseline &&
			scenario.candidate &&
			normalizeNumber(scenario.baseline.promptTokens) !== null &&
			normalizeNumber(scenario.candidate.promptTokens) !== null
	);
	const baselinePromptTokensTotal =
		pairedTokenScenarios.length > 0
			? pairedTokenScenarios.reduce(
					(sum, scenario) =>
						sum + (normalizeNumber(scenario.baseline?.promptTokens) ?? 0),
					0
				)
			: null;
	const candidatePromptTokensTotal =
		pairedTokenScenarios.length > 0
			? pairedTokenScenarios.reduce(
					(sum, scenario) =>
						sum + (normalizeNumber(scenario.candidate?.promptTokens) ?? 0),
					0
				)
			: null;
	const promptTokenDeltaTotal =
		baselinePromptTokensTotal !== null && candidatePromptTokensTotal !== null
			? candidatePromptTokensTotal - baselinePromptTokensTotal
			: null;
	const promptTokenDeltaPercent =
		promptTokenDeltaTotal !== null && baselinePromptTokensTotal
			? (promptTokenDeltaTotal / baselinePromptTokensTotal) * 100
			: null;

	return {
		baselineVariant,
		candidateVariant,
		scenarios,
		totals: {
			scenarioCount: scenarios.length,
			pairedScenarioCount: scenarios.filter(
				(scenario) => scenario.baseline && scenario.candidate
			).length,
			missingScenarioCount: scenarios.filter(
				(scenario) => scenario.missingVariants.length > 0
			).length,
			failedScenarioCount: scenarios.filter((scenario) => scenario.failureVariants.length > 0)
				.length,
			candidateBetterCount: scenarios.filter((scenario) => scenario.verdict === 'lite_better')
				.length,
			candidateWorseCount: scenarios.filter((scenario) => scenario.verdict === 'lite_worse')
				.length,
			mixedCount: scenarios.filter((scenario) => scenario.verdict === 'mixed').length,
			unchangedCount: scenarios.filter((scenario) => scenario.verdict === 'unchanged').length,
			baselinePromptTokensTotal,
			candidatePromptTokensTotal,
			promptTokenDeltaTotal,
			promptTokenDeltaPercent
		}
	};
}

const plural = (count: number, singular: string, pluralLabel = `${singular}s`): string =>
	`${count} ${count === 1 ? singular : pluralLabel}`;

const signedInteger = (value: number): string => (value > 0 ? `+${value}` : String(value));

const signedPercent = (value: number): string => {
	const rounded = Math.round(value * 10) / 10;
	return `${rounded > 0 ? '+' : ''}${rounded}%`;
};

export function formatPromptEvalVariantDecisionNote(
	report: PromptEvalVariantComparisonReport
): string {
	const candidateLabel = formatPromptVariantLabel(report.candidateVariant);
	const baselineLabel = formatPromptVariantLabel(report.baselineVariant);
	const lines = [
		`Prompt variant eval comparison: ${plural(
			report.totals.scenarioCount,
			'scenario'
		)}, ${plural(report.totals.pairedScenarioCount, 'paired scenario')}, ${plural(
			report.totals.missingScenarioCount,
			'scenario'
		)} missing evidence, ${plural(report.totals.failedScenarioCount, 'scenario')} with failures.`
	];

	lines.push(
		`${candidateLabel} vs ${baselineLabel}: better in ${report.totals.candidateBetterCount}, worse in ${report.totals.candidateWorseCount}, mixed in ${report.totals.mixedCount}, unchanged in ${report.totals.unchangedCount}.`
	);

	if (
		report.totals.promptTokenDeltaTotal !== null &&
		report.totals.promptTokenDeltaPercent !== null
	) {
		lines.push(
			`Paired prompt tokens: ${candidateLabel} ${signedInteger(
				report.totals.promptTokenDeltaTotal
			)} total (${signedPercent(report.totals.promptTokenDeltaPercent)}).`
		);
	}

	const missingScenarios = report.scenarios.filter(
		(scenario) => scenario.missingVariants.length > 0
	);
	if (missingScenarios.length > 0) {
		lines.push(
			`Missing evidence: ${missingScenarios
				.map(
					(scenario) =>
						`${scenario.scenarioSlug} missing ${scenario.missingVariants
							.map(formatPromptVariantLabel)
							.join(', ')}`
				)
				.join('; ')}.`
		);
	}

	const failedScenarios = report.scenarios.filter(
		(scenario) => scenario.failureVariants.length > 0
	);
	if (failedScenarios.length > 0) {
		lines.push(
			`Failures: ${failedScenarios
				.map(
					(scenario) =>
						`${scenario.scenarioSlug} (${scenario.failureVariants
							.map(formatPromptVariantLabel)
							.join(', ')})`
				)
				.join('; ')}.`
		);
	}

	return lines.join('\n');
}
