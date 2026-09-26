// scripts/agentic/preflight.ts
// Acting-model cost allowlist shared by the production battery (the QA gate it served was
// retired on 2026-09-24 with its isolated database).

/**
 * Known per-run spend of a complete three-repetition gate by acting model, measured from
 * OpenRouter usage counters. The gate refuses any model outside the allowlist so a stale
 * cost estimate for one model can never authorize a run on a dearer one (2026-09-22:
 * $1.70 on unbiased/pareto against a $0.50 approval).
 */
export const GATE_MODEL_RUN_COST_USD: Record<string, number> = {
	// Full 13-case x3 prod battery, model + judge, from the OpenRouter credits
	// delta on 2026-09-25 (the old 0.29 predated the judge double-count fix).
	'deepseek/deepseek-v4.1-flash': 0.24,
	'unbiased/pareto': 1.66
};
export const DEFAULT_GATE_ALLOWED_MODELS = ['deepseek/deepseek-v4.1-flash'];

export function assertGateModelAllowed(env: Record<string, string | undefined>): {
	model: string;
	knownRunCostUsd: number | null;
} {
	const model = env.AGENTIC_CHAT_OPENROUTER_MODEL?.trim() ?? '';
	if (!model) throw new Error('Gate env file must set AGENTIC_CHAT_OPENROUTER_MODEL explicitly.');
	const allowed = (env.AGENTIC_GATE_ALLOWED_MODELS ?? DEFAULT_GATE_ALLOWED_MODELS.join(','))
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
	const knownRunCostUsd = GATE_MODEL_RUN_COST_USD[model] ?? null;
	if (!allowed.includes(model)) {
		const cost = knownRunCostUsd === null ? 'unknown' : `about $${knownRunCostUsd.toFixed(2)}`;
		throw new Error(
			`Gate refused acting model "${model}" (known three-repetition spend: ${cost}). Allowed: ${allowed.join(', ')}. To run it anyway with the user's explicit approval for that cost, set AGENTIC_GATE_ALLOWED_MODELS to include it.`
		);
	}
	return { model, knownRunCostUsd };
}
