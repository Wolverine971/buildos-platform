// scripts/agentic/continuation-reasoning-metrics.ts
//
// Pure aggregation for the AGENTIC_CHAT_CONTINUATION_REASONING experiment
// (audit 2026-10-17 S3). Turns `llm_usage_logs` rows into per-variant numbers:
// reasoning tokens on opening vs continuation acting passes, latency, prompt
// tokens, cost, and how much a continuation's prompt grew over the pass before
// it (replayed reasoning shows up there). No I/O; see
// continuation-reasoning-report.ts for the CLI.

/** One provider pass, normalized from a DB row or a battery evidence row. */
export type PassRow = {
	/** stream_run_id when present (it survives battery cleanup; turn_run_id does not). */
	turnKey: string;
	passRole: string | null;
	logicalProviderRound: number | null;
	providerAttempt: number | null;
	startedAtMs: number;
	completedAtMs: number;
	responseTimeMs: number;
	promptTokens: number;
	cachedPromptTokens: number;
	completionTokens: number;
	reasoningTokens: number;
	costUsd: number;
	status: string | null;
	modelUsed: string | null;
};

export type PassClass =
	| 'opening'
	| 'continuation'
	| 'repair'
	| 'final'
	| 'review'
	| 'tool_selection'
	| 'other';

export type Distribution = {
	n: number;
	mean: number | null;
	p50: number | null;
	p90: number | null;
};

export type PassClassReport = {
	passes: number;
	failures: number;
	reasoningTokens: Distribution;
	latencyMs: Distribution;
	promptTokens: Distribution;
	completionTokens: Distribution;
	/** Share of prompt tokens served from the provider cache. */
	cachedPromptShare: number | null;
	/** Successful passes that reported zero reasoning tokens (reasoning off or none used). */
	zeroReasoningPasses: number;
	/** Successful passes at or above HEAVY_REASONING_TOKENS, and their share of the class's reasoning. */
	heavyReasoningPasses: number;
	heavyReasoningShare: number | null;
	costUsd: number;
};

/** A pass that reasoned this much is in the tail the runaway cutoff (9k) and S3 both target. */
export const HEAVY_REASONING_TOKENS = 3_000;

export type VariantReport = {
	label: string;
	sources: string[];
	turns: number;
	rows: number;
	byClass: Record<PassClass, PassClassReport>;
	perTurn: {
		actingReasoningTokens: Distribution;
		actingLlmMs: Distribution;
		llmMs: Distribution;
		/** First request start to last completion; a wall-time proxy when no client timing. */
		llmSpanMs: Distribution;
		/** Client-observed send→done, from battery evidence only. */
		wallMs: Distribution;
		costUsd: Distribution;
	};
	/** Continuation acting passes vs the acting/repair pass right before them in the turn. */
	promptGrowth: { growthTokens: Distribution; priorReasoningTokens: Distribution };
	costUsd: { total: number; acting: number; perTurnMean: number | null };
	quality: { totalScore: number; maxScore: number; percent: number } | null;
};

const ACTING_CLASSES: ReadonlySet<PassClass> = new Set([
	'opening',
	'continuation',
	'repair',
	'final'
]);
const REVIEW_ROLES = new Set(['mutation_review', 'contract_review', 'research_review']);

export function classifyPass(row: Pick<PassRow, 'passRole' | 'logicalProviderRound'>): PassClass {
	switch (row.passRole) {
		case 'acting':
			return (row.logicalProviderRound ?? 1) <= 1 ? 'opening' : 'continuation';
		case 'repair':
			return 'repair';
		case 'final_response':
			return 'final';
		case 'tool_selection':
			return 'tool_selection';
		default:
			return row.passRole && REVIEW_ROLES.has(row.passRole) ? 'review' : 'other';
	}
}

/** Nearest-rank percentiles; null for an empty sample. */
export function distribution(values: readonly number[]): Distribution {
	const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
	if (sorted.length === 0) return { n: 0, mean: null, p50: null, p90: null };
	const rank = (p: number) =>
		sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]!;
	return {
		n: sorted.length,
		mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
		p50: rank(0.5),
		p90: rank(0.9)
	};
}

const isSuccess = (row: PassRow) => row.status === null || row.status === 'success';

function classReport(rows: readonly PassRow[]): PassClassReport {
	const ok = rows.filter(isSuccess);
	const prompt = ok.reduce((sum, row) => sum + row.promptTokens, 0);
	const cached = ok.reduce((sum, row) => sum + row.cachedPromptTokens, 0);
	const reasoning = ok.reduce((sum, row) => sum + row.reasoningTokens, 0);
	const heavy = ok.filter((row) => row.reasoningTokens >= HEAVY_REASONING_TOKENS);
	return {
		passes: rows.length,
		failures: rows.length - ok.length,
		reasoningTokens: distribution(ok.map((row) => row.reasoningTokens)),
		latencyMs: distribution(ok.map((row) => row.responseTimeMs)),
		promptTokens: distribution(ok.map((row) => row.promptTokens)),
		completionTokens: distribution(ok.map((row) => row.completionTokens)),
		cachedPromptShare: prompt > 0 ? cached / prompt : null,
		zeroReasoningPasses: ok.filter((row) => row.reasoningTokens === 0).length,
		heavyReasoningPasses: heavy.length,
		heavyReasoningShare:
			reasoning > 0
				? heavy.reduce((sum, row) => sum + row.reasoningTokens, 0) / reasoning
				: null,
		costUsd: rows.reduce((sum, row) => sum + row.costUsd, 0)
	};
}

export function buildVariantReport(input: {
	label: string;
	sources: string[];
	rows: readonly PassRow[];
	/** turnKey → client wall time, when battery evidence has it. */
	wallMsByTurn?: ReadonlyMap<string, number>;
	quality?: VariantReport['quality'];
}): VariantReport {
	const classes: PassClass[] = [
		'opening',
		'continuation',
		'repair',
		'final',
		'review',
		'tool_selection',
		'other'
	];
	const byClass = Object.fromEntries(
		classes.map((name) => [
			name,
			classReport(input.rows.filter((row) => classifyPass(row) === name))
		])
	) as Record<PassClass, PassClassReport>;

	const turns = new Map<string, PassRow[]>();
	for (const row of input.rows) {
		const list = turns.get(row.turnKey) ?? [];
		list.push(row);
		turns.set(row.turnKey, list);
	}
	const actingTurns = [...turns.entries()].filter(([, rows]) =>
		rows.some((row) => ACTING_CLASSES.has(classifyPass(row)))
	);
	const growth: number[] = [];
	const priorReasoning: number[] = [];
	const perTurn = actingTurns.map(([turnKey, rows]) => {
		const ordered = [...rows].sort((left, right) => left.startedAtMs - right.startedAtMs);
		const acting = ordered.filter((row) => ACTING_CLASSES.has(classifyPass(row)));
		let previous: PassRow | null = null;
		for (const row of acting) {
			const kind = classifyPass(row);
			if (kind === 'continuation' && previous && isSuccess(row) && isSuccess(previous)) {
				growth.push(row.promptTokens - previous.promptTokens);
				priorReasoning.push(previous.reasoningTokens);
			}
			if (
				(kind === 'opening' || kind === 'continuation' || kind === 'repair') &&
				isSuccess(row)
			) {
				previous = row;
			}
		}
		return {
			turnKey,
			actingReasoning: acting.reduce((sum, row) => sum + row.reasoningTokens, 0),
			actingLlmMs: acting.reduce((sum, row) => sum + row.responseTimeMs, 0),
			llmMs: ordered.reduce((sum, row) => sum + row.responseTimeMs, 0),
			llmSpanMs:
				Math.max(...ordered.map((row) => row.completedAtMs)) -
				Math.min(...ordered.map((row) => row.startedAtMs)),
			costUsd: ordered.reduce((sum, row) => sum + row.costUsd, 0)
		};
	});
	const total = input.rows.reduce((sum, row) => sum + row.costUsd, 0);
	const acting = input.rows
		.filter((row) => ACTING_CLASSES.has(classifyPass(row)))
		.reduce((sum, row) => sum + row.costUsd, 0);
	return {
		label: input.label,
		sources: input.sources,
		turns: actingTurns.length,
		rows: input.rows.length,
		byClass,
		perTurn: {
			actingReasoningTokens: distribution(perTurn.map((turn) => turn.actingReasoning)),
			actingLlmMs: distribution(perTurn.map((turn) => turn.actingLlmMs)),
			llmMs: distribution(perTurn.map((turn) => turn.llmMs)),
			llmSpanMs: distribution(perTurn.map((turn) => turn.llmSpanMs)),
			wallMs: distribution(
				perTurn
					.map((turn) => input.wallMsByTurn?.get(turn.turnKey))
					.filter((value): value is number => typeof value === 'number')
			),
			costUsd: distribution(perTurn.map((turn) => turn.costUsd))
		},
		promptGrowth: {
			growthTokens: distribution(growth),
			priorReasoningTokens: distribution(priorReasoning)
		},
		costUsd: {
			total,
			acting,
			perTurnMean: actingTurns.length > 0 ? total / actingTurns.length : null
		},
		quality: input.quality ?? null
	};
}

/**
 * How much of the previous pass's reasoning a continuation's prompt carries,
 * relative to a baseline run of the same cases: (growth − baseline growth) ÷
 * prior reasoning. ≈1 means the replayed reasoning reached the model's prompt;
 * ≈0 means something upstream dropped it. Directional only: tool results differ
 * run to run.
 */
export function replayUptake(variant: VariantReport, baseline: VariantReport): number | null {
	const growth = variant.promptGrowth.growthTokens.mean;
	const base = baseline.promptGrowth.growthTokens.mean;
	const prior = variant.promptGrowth.priorReasoningTokens.mean;
	if (growth === null || base === null || prior === null || prior <= 0) return null;
	return (growth - base) / prior;
}

const fmt = (value: number | null, digits = 0) =>
	value === null
		? '—'
		: value.toLocaleString('en-US', {
				maximumFractionDigits: digits,
				minimumFractionDigits: digits
			});
const dist = (value: Distribution, digits = 0) =>
	value.n === 0
		? '—'
		: `${fmt(value.mean, digits)} / ${fmt(value.p50, digits)} / ${fmt(value.p90, digits)}`;
const pct = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(0)}%`);
const delta = (value: number | null, base: number | null, digits = 0) =>
	value === null || base === null
		? '—'
		: `${value - base >= 0 ? '+' : ''}${fmt(value - base, digits)}${base !== 0 ? ` (${(((value - base) / Math.abs(base)) * 100).toFixed(0)}%)` : ''}`;

/** Plain-text report; the first variant is the baseline for the comparison block. */
export function renderReport(variants: readonly VariantReport[]): string {
	const lines: string[] = [];
	const row = (name: string, values: string[]) =>
		lines.push(`${name.padEnd(38)}${values.map((value) => value.padEnd(30)).join('')}`);
	lines.push('Continuation reasoning report (mean / p50 / p90 unless noted)');
	lines.push('');
	row(
		'',
		variants.map((variant) => variant.label)
	);
	row(
		'sources',
		variants.map((variant) => variant.sources.join(', ').slice(0, 28))
	);
	row(
		'turns · usage rows',
		variants.map((v) => `${v.turns} · ${v.rows}`)
	);
	row(
		'quality (battery score)',
		variants.map((v) =>
			v.quality
				? `${v.quality.totalScore}/${v.quality.maxScore} (${v.quality.percent}%)`
				: '—'
		)
	);
	lines.push('');
	for (const [name, key] of [
		['opening acting', 'opening'],
		['continuation acting', 'continuation'],
		['repair', 'repair'],
		['final response', 'final'],
		['reviewers', 'review']
	] as const) {
		row(
			`${name}: passes (failed)`,
			variants.map((v) => `${v.byClass[key].passes} (${v.byClass[key].failures})`)
		);
		row(
			'  reasoning tokens',
			variants.map((v) => dist(v.byClass[key].reasoningTokens))
		);
		row(
			'  zero-reasoning passes',
			variants.map((v) => String(v.byClass[key].zeroReasoningPasses))
		);
		row(
			`  passes ≥${HEAVY_REASONING_TOKENS} reasoning (share)`,
			variants.map(
				(v) =>
					`${v.byClass[key].heavyReasoningPasses} (${pct(v.byClass[key].heavyReasoningShare)})`
			)
		);
		row(
			'  latency ms',
			variants.map((v) => dist(v.byClass[key].latencyMs))
		);
		row(
			'  prompt tokens',
			variants.map((v) => dist(v.byClass[key].promptTokens))
		);
		row(
			'  cached prompt share',
			variants.map((v) => pct(v.byClass[key].cachedPromptShare))
		);
		row(
			'  completion tokens',
			variants.map((v) => dist(v.byClass[key].completionTokens))
		);
		row(
			'  cost $',
			variants.map((v) => fmt(v.byClass[key].costUsd, 4))
		);
	}
	lines.push('');
	row(
		'per turn: acting reasoning tokens',
		variants.map((v) => dist(v.perTurn.actingReasoningTokens))
	);
	row(
		'per turn: acting LLM ms',
		variants.map((v) => dist(v.perTurn.actingLlmMs))
	);
	row(
		'per turn: all LLM ms',
		variants.map((v) => dist(v.perTurn.llmMs))
	);
	row(
		'per turn: LLM span ms',
		variants.map((v) => dist(v.perTurn.llmSpanMs))
	);
	row(
		'per turn: client wall ms',
		variants.map((v) => dist(v.perTurn.wallMs))
	);
	row(
		'per turn: cost $',
		variants.map((v) => dist(v.perTurn.costUsd, 4))
	);
	row(
		'continuation prompt growth tokens',
		variants.map((v) => dist(v.promptGrowth.growthTokens))
	);
	row(
		'  prior pass reasoning tokens',
		variants.map((v) => dist(v.promptGrowth.priorReasoningTokens))
	);
	row(
		'cost $ total · acting',
		variants.map((v) => `${fmt(v.costUsd.total, 4)} · ${fmt(v.costUsd.acting, 4)}`)
	);
	const [baseline, ...others] = variants;
	if (baseline && others.length > 0) {
		lines.push('');
		lines.push(`Against ${baseline.label}:`);
		for (const variant of others) {
			lines.push(`  ${variant.label}`);
			lines.push(
				`    continuation reasoning mean   ${delta(variant.byClass.continuation.reasoningTokens.mean, baseline.byClass.continuation.reasoningTokens.mean)}`
			);
			lines.push(
				`    continuation reasoning p50    ${delta(variant.byClass.continuation.reasoningTokens.p50, baseline.byClass.continuation.reasoningTokens.p50)}`
			);
			lines.push(
				`    continuation latency p50 ms   ${delta(variant.byClass.continuation.latencyMs.p50, baseline.byClass.continuation.latencyMs.p50)}`
			);
			lines.push(
				`    per-turn acting LLM ms mean   ${delta(variant.perTurn.actingLlmMs.mean, baseline.perTurn.actingLlmMs.mean)}`
			);
			lines.push(
				`    per-turn wall ms p50 · p90    ${delta(variant.perTurn.wallMs.p50, baseline.perTurn.wallMs.p50)} · ${delta(variant.perTurn.wallMs.p90, baseline.perTurn.wallMs.p90)}`
			);
			lines.push(
				`    continuation prompt mean      ${delta(variant.byClass.continuation.promptTokens.mean, baseline.byClass.continuation.promptTokens.mean)}`
			);
			lines.push(
				`    cost per turn $               ${delta(variant.costUsd.perTurnMean, baseline.costUsd.perTurnMean, 5)}`
			);
			lines.push(
				`    replay uptake (≈1 = reasoning reached the prompt)  ${fmt(replayUptake(variant, baseline), 2)}`
			);
		}
	}
	return lines.join('\n');
}
