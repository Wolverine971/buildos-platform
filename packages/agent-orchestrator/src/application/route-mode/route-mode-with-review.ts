import type { RouteModelPort } from '../../ports';
import { routeRequest, type RouteModeResult } from './route-mode';
import type { PhaseAWorldCard } from './world-card';

export const ROUTE_REVIEW_POLICY_VERSION = 'phase-a-route-review-v1' as const;

export type RouteReviewReason = 'primary_failure' | 'research_intent_conflict';

export interface ReviewedRouteModeResult {
	decision: RouteModeResult['decision'];
	proposal: RouteModeResult['proposal'];
	durationMs: number;
	reviewed: boolean;
	reviewReason: RouteReviewReason | null;
	repaired: boolean;
	primaryResult: RouteModeResult | null;
	reviewResult: RouteModeResult | null;
	primaryError: string | null;
}

const EXPLICIT_RESEARCH_INTENT =
	/\b(research|researching|look\s+up|lookup|investigat\w*|recommend\w*|external\s+source|web)\b/i;

export function routeNeedsReview(request: string, primary: RouteModeResult): boolean {
	if (!EXPLICIT_RESEARCH_INTENT.test(request)) return false;
	return primary.decision.route === 'direct' || primary.decision.route === 'clarify';
}

/**
 * Fast-first Phase A route strategy. The reviewer is bounded to one normal route invocation and
 * runs only when the primary fails or its route conflicts with explicit research intent.
 */
export async function routeRequestWithReview(params: {
	worldCard: PhaseAWorldCard;
	request: string;
	primaryModel: RouteModelPort;
	reviewModel: RouteModelPort;
}): Promise<ReviewedRouteModeResult> {
	const startedAt = Date.now();
	let primaryResult: RouteModeResult | null = null;
	let primaryError: string | null = null;

	try {
		primaryResult = await routeRequest({
			worldCard: params.worldCard,
			request: params.request,
			model: params.primaryModel
		});
	} catch (error) {
		primaryError = error instanceof Error ? error.message : String(error);
	}

	const reviewReason: RouteReviewReason | null = primaryResult
		? routeNeedsReview(params.request, primaryResult)
			? 'research_intent_conflict'
			: null
		: 'primary_failure';

	if (primaryResult && reviewReason === null) {
		return {
			decision: primaryResult.decision,
			proposal: primaryResult.proposal,
			durationMs: Date.now() - startedAt,
			reviewed: false,
			reviewReason: null,
			repaired: primaryResult.repaired,
			primaryResult,
			reviewResult: null,
			primaryError: null
		};
	}

	const reviewResult = await routeRequest({
		worldCard: params.worldCard,
		request: params.request,
		model: params.reviewModel
	});
	return {
		decision: reviewResult.decision,
		proposal: reviewResult.proposal,
		durationMs: Date.now() - startedAt,
		reviewed: true,
		reviewReason,
		repaired: Boolean(primaryResult?.repaired || reviewResult.repaired || primaryError),
		primaryResult,
		reviewResult,
		primaryError
	};
}
