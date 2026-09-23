// apps/worker/src/workers/agentic-chat/provider/openrouter/route-health.ts
// Per-turn routing memory: which models/endpoints failed, which warm endpoint
// is pinned, and how that reshapes the next request's model list and
// `provider` preferences.
import type { AgenticChatOpenAiCompatibleRouteV1, ClientInput } from './types';

const TURN_ROUTE_HEALTH_TTL_MS = 10 * 60_000;
const MAX_TURN_ROUTE_HEALTH_ENTRIES = 256;

export type TurnRouteHealth = {
	failedModels: Set<string>;
	failedProviderSlugs: Set<string>;
	preferredModels: string[];
	/** First successful route in this turn; released as soon as that route fails. */
	pin: {
		model: string;
		providerSlug: string | null;
	} | null;
	/** Exact completed response eligible for delayed semantic-validation feedback. */
	lastResponse: { identity: string; model: string; providerSlug: string | null } | null;
	updatedAtMs: number;
};

export class TurnRouteHealthTracker {
	private readonly turnRouteHealth = new Map<string, TurnRouteHealth>();

	constructor(
		/** Every model id a request can name; the only ids a turn's routing state pins. */
		private readonly configuredModels: ReadonlySet<string>
	) {}

	apply(
		route: AgenticChatOpenAiCompatibleRouteV1,
		turnRunId: string
	): AgenticChatOpenAiCompatibleRouteV1 {
		const health = this.get(turnRunId, false);
		if (!health || route.kind !== 'openrouter') return route;
		const models = [route.model, ...(route.fallbackModels ?? [])];
		const preferred = models.filter((model) => health.preferredModels.includes(model));
		const healthy = models.filter(
			(model) => !health.preferredModels.includes(model) && !health.failedModels.has(model)
		);
		const failed = models.filter((model) => health.failedModels.has(model));
		const reordered = [...preferred, ...healthy, ...failed];
		const configuredIgnore = route.providerRouting?.ignore ?? [];
		const orderedPool = route.providerRouting?.order ?? [];
		const failedSlugs = Array.from(health.failedProviderSlugs);
		const inPool = (slug: string) =>
			orderedPool.some((member) => slug === member || slug.startsWith(`${member}/`));
		// Remembered failures must never exclude the whole configured pool. For a
		// single-provider model that turns one slow endpoint into a guaranteed
		// 404 "All providers have been ignored" (2026-09-22 gate, case 5). When
		// every ordered endpoint has failed, retry the pool instead of nothing.
		const poolExhausted =
			orderedPool.length > 0 &&
			orderedPool.every(
				(member) =>
					configuredIgnore.includes(member) ||
					failedSlugs.some((slug) => slug === member || slug.startsWith(`${member}/`))
			);
		const ignoredProviders = Array.from(
			new Set([
				...configuredIgnore,
				...(poolExhausted ? failedSlugs.filter((slug) => !inPool(slug)) : failedSlugs)
			])
		);
		const pin =
			health.pin &&
			!health.failedModels.has(health.pin.model) &&
			(!health.pin.providerSlug || !ignoredProviders.includes(health.pin.providerSlug))
				? health.pin
				: null;
		const modelPin =
			pin ??
			(health.pin && !health.failedModels.has(health.pin.model)
				? { model: health.pin.model, providerSlug: null }
				: null);
		const preferredOrder = route.providerRouting?.order;
		// A successful fallback is not automatically a preferred endpoint.
		// Slow Wafer continuations in QA had no cache hits despite the pin.
		// Respect explicit dynamic sorting, and keep unlisted fallbacks behind
		// the configured pool instead of promoting them for the whole turn.
		const providerPin =
			pin?.providerSlug &&
			!route.providerRouting?.sort &&
			(!preferredOrder?.length ||
				preferredOrder.some(
					(slug) => pin.providerSlug === slug || pin.providerSlug!.startsWith(`${slug}/`)
				))
				? pin.providerSlug
				: null;
		return {
			...route,
			model: modelPin?.model ?? reordered[0] ?? route.model,
			// Every pass resends the full accumulated prompt. Once a route succeeds,
			// keep subsequent passes on the model/provider that owns that warm prefix.
			// A real failure clears the pin below and restores this fallback list.
			fallbackModels: modelPin ? [] : reordered.slice(1),
			// The pin is a preference, not a constraint: `order` puts the warm
			// endpoint first and the route's own `allow_fallbacks` stays in force.
			// A hard pin (`allow_fallbacks: false`) turned every pass the pinned
			// endpoint could not serve into a 404 round trip, a failed receipt,
			// and a cold retry — 26 of 55 production turns in the audit window
			// (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F76).
			providerRouting: {
				...(route.providerRouting ?? {}),
				...(ignoredProviders.length > 0 ? { ignore: ignoredProviders } : {}),
				// Keep the measured fallback order behind the warm endpoint. A
				// singleton order discarded it and allowed slow unpreferred routes
				// to serve continuations whenever the warm endpoint was unavailable.
				...(providerPin
					? {
							order: [
								providerPin,
								...(route.providerRouting?.order ?? []).filter(
									(slug) =>
										slug !== providerPin && !ignoredProviders.includes(slug)
								)
							].slice(0, 16)
						}
					: {})
			}
		};
	}

	/**
	 * The model identity a turn's routing state keys on. Providers answer a
	 * canonical request id with a weight snapshot (`deepseek/deepseek-v4-flash`
	 * came back as `deepseek/deepseek-v4-flash-20260423`); re-requesting the
	 * snapshot resolved to a different, slower endpoint set, so the pin holds a
	 * configured id and receipts keep the reported one
	 * (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F77).
	 */
	routingModel(reportedModel: string | null, route: AgenticChatOpenAiCompatibleRouteV1): string {
		return reportedModel && this.configuredModels.has(reportedModel)
			? reportedModel
			: route.model;
	}

	observeFailure(
		turnRunId: string,
		model: string | null,
		providerSlug: string | null,
		options: { releasePin?: boolean } = {}
	): void {
		const health = this.get(turnRunId, true)!;
		health.lastResponse = null;
		if (model) {
			health.failedModels.add(model);
			health.preferredModels = health.preferredModels.filter(
				(candidate) => candidate !== model
			);
		}
		if (providerSlug) health.failedProviderSlugs.add(providerSlug);
		if (
			health.pin &&
			(options.releasePin === true ||
				(model && health.pin.model === model) ||
				(providerSlug && health.pin.providerSlug === providerSlug))
		) {
			// A caller that names the pin itself as the cause also retires the
			// pinned endpoint, so `order: [slug]` cannot be rebuilt onto the same
			// provider on the next pass.
			if (options.releasePin === true && health.pin.providerSlug) {
				health.failedProviderSlugs.add(health.pin.providerSlug);
			}
			health.pin = null;
		}
		health.updatedAtMs = Date.now();
	}

	observeSuccess(
		turnRunId: string,
		model: string,
		requestedModel: string,
		providerSlug: string | null,
		pinEligible: boolean
	): void {
		const health = this.get(turnRunId, true)!;
		health.updatedAtMs = Date.now();
		if (pinEligible && !health.pin) health.pin = { model, providerSlug };
		const recoveredFromFailure =
			health.failedModels.size > 0 || health.failedProviderSlugs.size > 0;
		const resolvedFallback = model !== requestedModel;
		health.failedModels.delete(model);
		if (!recoveredFromFailure && !resolvedFallback) return;
		health.preferredModels = [
			model,
			...health.preferredModels.filter((candidate) => candidate !== model)
		];
	}

	get(turnRunId: string, create: boolean): TurnRouteHealth | null {
		const now = Date.now();
		for (const [candidateTurnRunId, health] of this.turnRouteHealth) {
			if (now - health.updatedAtMs > TURN_ROUTE_HEALTH_TTL_MS) {
				this.turnRouteHealth.delete(candidateTurnRunId);
			}
		}
		const existing = this.turnRouteHealth.get(turnRunId);
		if (existing || !create) return existing ?? null;
		while (this.turnRouteHealth.size >= MAX_TURN_ROUTE_HEALTH_ENTRIES) {
			const oldestTurnRunId = this.turnRouteHealth.keys().next().value as string | undefined;
			if (!oldestTurnRunId) break;
			this.turnRouteHealth.delete(oldestTurnRunId);
		}
		const health: TurnRouteHealth = {
			failedModels: new Set(),
			failedProviderSlugs: new Set(),
			preferredModels: [],
			pin: null,
			lastResponse: null,
			updatedAtMs: now
		};
		this.turnRouteHealth.set(turnRunId, health);
		return health;
	}
}

export function responseIdentity(input: ClientInput): string {
	// Physical retries belong to the same logical pass. The completed retry's
	// actual route is retained, without retaining its prompt or tool arguments.
	return JSON.stringify([
		input.streamRunId,
		input.processingToken,
		input.executionGeneration,
		input.logicalProviderRound,
		input.providerRound,
		input.passRole ?? 'acting'
	]);
}
