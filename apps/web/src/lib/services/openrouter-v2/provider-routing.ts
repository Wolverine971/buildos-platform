// apps/web/src/lib/services/openrouter-v2/provider-routing.ts
import type { OpenRouterProviderConfig } from './types';

export type OpenRouterRequestProviderRouting = {
	/** Exact provider slugs to exclude for this request. */
	ignore?: string[];
};

const PROVIDER_DISPLAY_NAME_ALIASES: Readonly<Record<string, string>> = Object.freeze({
	'baidu qianfan': 'baidu',
	'digital ocean': 'digitalocean',
	'google vertex': 'google-vertex',
	'moonshot ai': 'moonshotai',
	nvidia: 'nvidia',
	'weights & biases': 'wandb',
	'z.ai': 'z-ai'
});

const PROVIDER_SLUG_PATTERN = /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/;

/**
 * Converts OpenRouter's common display names to API routing slugs while
 * leaving already-valid slugs intact. Unknown display names are omitted so
 * telemetry never claims an inferred value is an exact provider slug.
 */
export function normalizeOpenRouterProviderSlug(
	value: string | null | undefined
): string | undefined {
	const normalized = value?.trim().toLowerCase();
	if (!normalized) return undefined;
	const alias = PROVIDER_DISPLAY_NAME_ALIASES[normalized];
	if (alias) return alias;
	return PROVIDER_SLUG_PATTERN.test(normalized) ? normalized : undefined;
}

export function normalizeOpenRouterProviderSlugList(
	values: readonly string[] | null | undefined
): string[] {
	return Array.from(
		new Set(
			(values ?? [])
				.map((value) => normalizeOpenRouterProviderSlug(value))
				.filter((value): value is string => Boolean(value))
		)
	);
}

export function mergeOpenRouterRequestProviderRouting(
	base: OpenRouterProviderConfig,
	routing: OpenRouterRequestProviderRouting | null | undefined
): OpenRouterProviderConfig {
	const next: OpenRouterProviderConfig = { ...base };
	const normalizedOrder = normalizeOpenRouterProviderSlugList(base.order);
	const ignoredProviderSlugs = Array.from(
		new Set([
			...normalizeOpenRouterProviderSlugList(base.ignore),
			...normalizeOpenRouterProviderSlugList(routing?.ignore)
		])
	);

	if (ignoredProviderSlugs.length > 0) {
		next.ignore = ignoredProviderSlugs;
	} else {
		delete next.ignore;
	}

	if (normalizedOrder.length > 0) {
		const ignored = new Set(ignoredProviderSlugs);
		const filteredOrder = normalizedOrder.filter((provider) => !ignored.has(provider));
		if (filteredOrder.length > 0) {
			next.order = filteredOrder;
		} else {
			delete next.order;
		}
	} else {
		delete next.order;
	}

	return next;
}
