// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/turn-route-health.ts
import type { FastChatPassModelRouting } from '../model-tiering';

export type TurnRouteHealthObservation = {
	status: 'success' | 'failure';
	model?: string;
	requestedModel?: string;
	providerSlug?: string;
};

/**
 * The (model, provider) pair that answered successfully earlier in this turn.
 *
 * Prompt/cache audit 2026-08-27 (F3): OpenRouter prefix caches are per-provider,
 * so the same model served by two upstreams keeps two separate caches. In the
 * sampled traffic `deepseek-v4-flash` hit 71% cached on one provider and 18% on
 * another, and one turn switched models outright between pass 1 and pass 2 —
 * which cold-starts the prefix for every remaining pass of that turn. Passes
 * 2..N of a turn re-send the entire seed prompt plus accumulated tool results,
 * so a cold prefix there is the single most expensive routing mistake available.
 */
export type TurnRoutePin = {
	model: string;
	providerSlug?: string;
};

export type TurnRouteHealth = {
	failedModels: Set<string>;
	failedProviderSlugs: Set<string>;
	preferredModels: string[];
	/** Set by the first success of the turn; cleared when that route fails. */
	pin: TurnRoutePin | null;
};

export function createTurnRouteHealth(): TurnRouteHealth {
	return {
		failedModels: new Set<string>(),
		failedProviderSlugs: new Set<string>(),
		preferredModels: [],
		pin: null
	};
}

/**
 * Keep transport health for the lifetime of one chat turn. A retry that works
 * becomes sticky for later logical passes, while a failed route is cooled down
 * without changing the global OpenRouter provider policy.
 */
export function observeTurnRouteHealth(
	health: TurnRouteHealth,
	observation: TurnRouteHealthObservation
): void {
	const model = canonicalRoutePart(observation.model);
	const providerSlug = canonicalRoutePart(observation.providerSlug);

	if (observation.status === 'failure') {
		if (model) {
			health.failedModels.add(model);
			health.preferredModels = health.preferredModels.filter((entry) => entry !== model);
		}
		if (providerSlug) health.failedProviderSlugs.add(providerSlug);
		// Release the pin as soon as the route it names stops working. Pinning is
		// a cache optimization, never a availability constraint — the next pass
		// goes back to the full candidate list with fallbacks re-enabled.
		if (
			health.pin &&
			((model && health.pin.model === model) ||
				(providerSlug && health.pin.providerSlug === providerSlug))
		) {
			health.pin = null;
		}
		return;
	}

	if (!model) return;
	// First success of the turn owns the cache prefix; keep later passes on it.
	// A provider that does not report its slug still pins the model, which at
	// least prevents the mid-turn model swap.
	if (!health.pin) {
		health.pin = providerSlug ? { model, providerSlug } : { model };
	}
	const requestedModel = canonicalRoutePart(observation.requestedModel);
	const recoveredFromFailure =
		health.failedModels.size > 0 || health.failedProviderSlugs.size > 0;
	const resolvedFallback = Boolean(requestedModel && requestedModel !== model);
	health.failedModels.delete(model);
	if (!recoveredFromFailure && !resolvedFallback) return;
	health.preferredModels = [
		model,
		...health.preferredModels.filter((entry) => entry !== model)
	].slice(0, 4);
}

export function applyTurnRouteHealth(
	routing: FastChatPassModelRouting,
	health: TurnRouteHealth,
	options: { preserveModelOrder?: boolean } = {}
): FastChatPassModelRouting {
	const models = routing.models?.length
		? options.preserveModelOrder
			? [...routing.models]
			: reorderModels(routing.models, health)
		: undefined;
	const ignoredProviderSlugs = Array.from(
		new Set([
			...(routing.ignoredProviderSlugs ?? []).map(canonicalRoutePart).filter(Boolean),
			...health.failedProviderSlugs
		])
	) as string[];

	const pin = resolveUsablePin(health, models ?? routing.models, ignoredProviderSlugs);
	// A live pin promotes the cache-warm model to the front of the candidate list
	// but keeps every fallback behind it, and expresses the provider as
	// `provider.order` — a preference, not a constraint.
	//
	// Deliberately NOT setting `allow_fallbacks: false` here. That would convert a
	// momentary blip on the pinned provider into a hard error on a user-facing
	// stream, trading availability for cache on the one surface where latency is
	// most visible. `order` alone already makes OpenRouter try the warm provider
	// first, which captures the benefit. The field is plumbed if we later decide a
	// batch/worker lane should harden the pin.
	const pinnedModels = pin ? promoteModel(models ?? routing.models, pin.model) : models;

	return {
		...routing,
		...(pinnedModels ? { models: pinnedModels } : {}),
		...(ignoredProviderSlugs.length > 0 ? { ignoredProviderSlugs } : {}),
		...(pin?.providerSlug ? { providerOrder: [pin.providerSlug] } : {})
	};
}

function promoteModel(models: readonly string[] | undefined, model: string): string[] | undefined {
	if (!models?.length) return models ? [...models] : undefined;
	if (!models.includes(model)) return [...models];
	return [model, ...models.filter((entry) => entry !== model)];
}

/**
 * A pin is only usable when the route it names is still on the table: the model
 * must survive the candidate list, and the provider must not have been ignored
 * (either by policy or by an in-turn failure). Anything else and we route
 * normally rather than pinning ourselves onto a dead provider with
 * `allow_fallbacks: false`.
 */
function resolveUsablePin(
	health: TurnRouteHealth,
	models: readonly string[] | undefined,
	ignoredProviderSlugs: readonly string[]
): TurnRoutePin | null {
	const pin = health.pin;
	if (!pin) return null;
	if (health.failedModels.has(pin.model)) return null;
	if (models?.length && !models.includes(pin.model)) return null;
	if (pin.providerSlug && ignoredProviderSlugs.includes(pin.providerSlug)) {
		// Keep the model pin, drop the provider pin — half a cache is better than
		// a request aimed at a provider we have already ruled out.
		return { model: pin.model };
	}
	return pin;
}

function reorderModels(models: readonly string[], health: TurnRouteHealth): string[] {
	const available = new Set(models);
	const preferred = health.preferredModels.filter((model) => available.has(model));
	const preferredSet = new Set(preferred);
	const healthy = models.filter(
		(model) => !preferredSet.has(model) && !health.failedModels.has(model)
	);
	const failed = models.filter(
		(model) => !preferredSet.has(model) && health.failedModels.has(model)
	);
	return [...preferred, ...healthy, ...failed];
}

function canonicalRoutePart(value: string | null | undefined): string | undefined {
	const normalized = value?.trim().toLowerCase();
	return normalized || undefined;
}
