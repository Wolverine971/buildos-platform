// packages/agent-orchestrator/src/application/route-mode/route-mode-with-review.ts
import type { RouteModelPort } from '../../ports';
import { compileRouteDecision, routeRequest, type RouteModeResult } from './route-mode';
import { RouteProposalSchema, type RouteProposal } from './route-proposal';
import {
	classifyWorkflowScope,
	type WorkflowScopeFact,
	type WorkflowScopeResult
} from './workflow-scope';
import type { PhaseAWorldCard } from './world-card';

export const ROUTE_REVIEW_POLICY_VERSION = 'phase-a-route-review-v2' as const;

export type RouteReviewReason = 'primary_failure' | 'workflow_scope_resolution';

export interface ReviewedRouteModeResult {
	decision: RouteModeResult['decision'];
	proposal: RouteModeResult['proposal'];
	durationMs: number;
	reviewed: boolean;
	reviewReason: RouteReviewReason | null;
	repaired: boolean;
	primaryResult: RouteModeResult | null;
	reviewResult: RouteModeResult | null;
	scopeResult: WorkflowScopeResult | null;
	primaryError: string | null;
}

const EXPLICIT_RESEARCH_INTENT =
	/\b(research|researching|look\s+up|lookup|investigat\w*|recommend\w*|external\s+source|web)\b/i;
const SUPPLIED_URL = /https?:\/\/[^\s<>{}\[\]"']+/i;

export function routeNeedsReview(request: string, primary: RouteModeResult): boolean {
	if (primary.decision.route === 'capability_gap') return false;
	const hasResearchIntent = EXPLICIT_RESEARCH_INTENT.test(request);
	if (primary.decision.route === 'workflow') {
		return primary.decision.reason_code !== 'multi_step_synthesis' || hasResearchIntent;
	}
	return hasResearchIntent;
}

function proposalForScope(primary: RouteProposal, fact: WorkflowScopeFact): RouteProposal {
	const base = {
		schema_version: 1 as const,
		objective: primary.objective,
		confidence: Math.min(primary.confidence, fact.confidence),
		questions: [] as string[],
		gap: null
	};

	const proposal = (() => {
		switch (fact.classification) {
			case 'bounded_project_read':
				return { ...base, route: 'direct', reason_code: 'simple_read' };
			case 'project_status_or_priority_read':
				return { ...base, route: 'direct', reason_code: 'status_summary' };
			case 'self_contained_research':
				return { ...base, route: 'workflow', reason_code: 'multi_source_research' };
			case 'current_project_then_research':
				return {
					...base,
					route: 'workflow',
					reason_code: 'context_research_recommendation'
				};
			case 'missing_required_scope':
				return {
					...base,
					route: 'clarify',
					reason_code: 'missing_required_context',
					questions: [
						'Which project, subject, or source should I use as the scope for this request?'
					]
				};
		}
	})();

	return RouteProposalSchema.parse(proposal);
}

function suppliedSourceProposal(primary: RouteProposal): RouteProposal {
	return RouteProposalSchema.parse({
		...primary,
		route: 'workflow',
		reason_code: 'single_source_research',
		questions: [],
		gap: null
	});
}

function resultFromPrimary(params: {
	startedAt: number;
	primaryResult: RouteModeResult;
}): ReviewedRouteModeResult {
	return {
		decision: params.primaryResult.decision,
		proposal: params.primaryResult.proposal,
		durationMs: Date.now() - params.startedAt,
		reviewed: false,
		reviewReason: null,
		repaired: params.primaryResult.repaired,
		primaryResult: params.primaryResult,
		reviewResult: null,
		scopeResult: null,
		primaryError: null
	};
}

/**
 * Fast-first Phase A route strategy. Observable request facts are compiled in code. When a model
 * is needed to resolve workflow scope, it emits only a narrow semantic classification; code owns
 * the route, reason, clarification question, and workflow topology.
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

	if (!primaryResult) {
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
			reviewReason: 'primary_failure',
			repaired: true,
			primaryResult: null,
			reviewResult,
			scopeResult: null,
			primaryError
		};
	}

	if (primaryResult.decision.route === 'capability_gap') {
		return resultFromPrimary({ startedAt, primaryResult });
	}

	if (SUPPLIED_URL.test(params.request)) {
		const proposal = suppliedSourceProposal(primaryResult.proposal);
		return {
			decision: compileRouteDecision(proposal, params.worldCard, params.request),
			proposal,
			durationMs: Date.now() - startedAt,
			reviewed: false,
			reviewReason: null,
			repaired: primaryResult.repaired,
			primaryResult,
			reviewResult: null,
			scopeResult: null,
			primaryError: null
		};
	}

	if (!routeNeedsReview(params.request, primaryResult)) {
		return resultFromPrimary({ startedAt, primaryResult });
	}

	const scopeResult = await classifyWorkflowScope({
		worldCard: params.worldCard,
		request: params.request,
		model: params.reviewModel
	});
	const proposal = proposalForScope(primaryResult.proposal, scopeResult.fact);
	return {
		decision: compileRouteDecision(proposal, params.worldCard, params.request),
		proposal,
		durationMs: Date.now() - startedAt,
		reviewed: true,
		reviewReason: 'workflow_scope_resolution',
		repaired: primaryResult.repaired || scopeResult.repaired,
		primaryResult,
		reviewResult: null,
		scopeResult,
		primaryError: null
	};
}
