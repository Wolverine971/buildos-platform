// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/turn-route-health.ts
import type { FastChatPassModelRouting } from '../model-tiering';

export type TurnRouteHealthObservation = {
	status: 'success' | 'failure';
	model?: string;
	requestedModel?: string;
	providerSlug?: string;
};

export type TurnRouteHealth = {
	failedModels: Set<string>;
	failedProviderSlugs: Set<string>;
	preferredModels: string[];
};

export function createTurnRouteHealth(): TurnRouteHealth {
	return {
		failedModels: new Set<string>(),
		failedProviderSlugs: new Set<string>(),
		preferredModels: []
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
		return;
	}

	if (!model) return;
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

	return {
		...routing,
		...(models ? { models } : {}),
		...(ignoredProviderSlugs.length > 0 ? { ignoredProviderSlugs } : {})
	};
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
