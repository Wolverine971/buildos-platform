// apps/worker/src/config/projectLoops.ts

/**
 * Project Loops graduated from its rollout flag in July 2026. Keep the shared
 * symbol as an always-on compatibility shim until the guarded call sites are
 * simplified; worker execution must no longer depend on deployment env drift.
 */
export const PROJECT_LOOPS_ENABLED = true;

/**
 * Fast, JSON-compatible, ZDR-capable DeepSeek V4 Flash hosts verified during
 * the 2026-08-22 Project Loop timeout review. OpenRouter may still fall back to
 * its normal ZDR routing when none of these hosts is available.
 */
export const PROJECT_LOOP_JSON_PROVIDER_ORDER = [
	'novita',
	'parasail',
	'siliconflow',
	'coreweave'
] as const;

const PROVIDER_ORDER_DISABLED_VALUES = new Set(['off', 'none', 'default', 'disabled']);

export function resolveProjectLoopJsonProviderOrder(value: string | undefined): string[] {
	const trimmedValue = value?.trim();
	if (!trimmedValue) return [...PROJECT_LOOP_JSON_PROVIDER_ORDER];
	if (PROVIDER_ORDER_DISABLED_VALUES.has(trimmedValue.toLowerCase())) return [];

	return [
		...new Set(
			trimmedValue
				.split(',')
				.map((provider) => provider.trim().toLowerCase())
				.filter(Boolean)
		)
	].slice(0, 8);
}

export const PROJECT_LOOP_JSON_PROVIDER_ORDER_RESOLVED = resolveProjectLoopJsonProviderOrder(
	process.env.PRIVATE_PROJECT_LOOP_PROVIDER_ORDER
);

export function logProjectLoopProviderConfiguration(): void {
	console.log('🔀 Project Loop JSON provider order:');
	console.log(
		PROJECT_LOOP_JSON_PROVIDER_ORDER_RESOLVED.length
			? `   → ${PROJECT_LOOP_JSON_PROVIDER_ORDER_RESOLVED.join(', ')} (OpenRouter fallback enabled)`
			: '   → default OpenRouter ZDR routing (steering disabled)'
	);
}
