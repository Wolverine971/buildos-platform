// packages/agent-orchestrator/src/application/route-mode/route-mode.ts
import { RouteDecisionSchema, type RouteDecision } from '../../contracts';
import type { RouteModelPort } from '../../ports';
import {
	buildRouteRepairPrompt,
	buildRouteUserPrompt,
	ROUTE_MODEL_MAX_TOKENS,
	ROUTE_MODEL_TEMPERATURE,
	ROUTE_PROMPT_VERSION,
	ROUTE_SYSTEM_PROMPT
} from './prompts';
import { RouteProposalSchema, type RouteProposal } from './route-proposal';
import { compileWorkflowStage } from './workflow-plan';
import type { PhaseAWorldCard } from './world-card';

export interface RouteModeResult {
	decision: RouteDecision;
	proposal: RouteProposal;
	attempts: 1 | 2;
	repaired: boolean;
	durationMs: number;
}

export class RouteModeFailure extends Error {
	readonly attempts: 2;
	readonly issues: string[];

	constructor(issues: string[]) {
		super(`Route mode failed after one bounded repair: ${issues.join('; ')}`);
		this.name = 'RouteModeFailure';
		this.attempts = 2;
		this.issues = issues;
	}
}

function gapType(reasonCode: RouteProposal['reason_code']) {
	if (reasonCode === 'unavailable_agent') return 'agent' as const;
	if (reasonCode === 'unavailable_tool') return 'tool' as const;
	if (reasonCode === 'insufficient_permission') return 'permission' as const;
	return 'unsupported_operation' as const;
}

export function compileRouteDecision(
	proposal: RouteProposal,
	worldCard: PhaseAWorldCard,
	request: string
): RouteDecision {
	const base = {
		schema_version: 1 as const,
		objective: proposal.objective,
		project_ids: [worldCard.current_project.id],
		confidence: proposal.confidence
	};

	let decision: unknown;
	if (proposal.route === 'direct') {
		decision = {
			...base,
			route: 'direct',
			reason_code: proposal.reason_code,
			risk: 'low',
			direct_action: {
				schema_version: 1,
				operations: [
					{
						operation_id:
							proposal.reason_code === 'status_summary'
								? 'project.status_summary'
								: 'project.read',
						project_id: worldCard.current_project.id,
						arguments: { objective: proposal.objective },
						expected_result:
							'A bounded read-only answer grounded in current project data.',
						risk: 'low'
					}
				],
				user_visible_label: 'Reading project information'
			}
		};
	} else if (proposal.route === 'workflow') {
		decision = {
			...base,
			route: 'workflow',
			reason_code: proposal.reason_code,
			risk: 'medium',
			initial_stage: compileWorkflowStage(proposal, request)
		};
	} else if (proposal.route === 'clarify') {
		decision = {
			...base,
			route: 'clarify',
			reason_code: proposal.reason_code,
			risk: 'low',
			questions: proposal.questions
		};
	} else {
		decision = {
			...base,
			route: 'capability_gap',
			reason_code: proposal.reason_code,
			risk:
				proposal.reason_code === 'unsafe_operation'
					? 'high'
					: proposal.reason_code === 'insufficient_permission'
						? 'medium'
						: 'low',
			gap: {
				gap_type: gapType(proposal.reason_code),
				capability: proposal.gap?.capability ?? 'Unspecified capability',
				description:
					proposal.gap?.description ?? 'The requested capability is unavailable.',
				blocking: true,
				suggested_resolution: proposal.gap?.suggested_resolution ?? null
			}
		};
	}

	return RouteDecisionSchema.parse(decision);
}

function validationIssues(value: unknown, request: string): string[] {
	const proposalResult = RouteProposalSchema.safeParse(value);
	if (!proposalResult.success) {
		return proposalResult.error.issues.map(
			(issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`
		);
	}
	try {
		compileRouteDecision(
			proposalResult.data,
			{
				current_project: { id: '00000000-0000-4000-8000-000000000000' }
			} as PhaseAWorldCard,
			request
		);
		return [];
	} catch (error) {
		return [error instanceof Error ? error.message : String(error)];
	}
}

function parseAndCompile(value: unknown, worldCard: PhaseAWorldCard, request: string) {
	const proposal = RouteProposalSchema.parse(value);
	return { proposal, decision: compileRouteDecision(proposal, worldCard, request) };
}

export async function routeRequest(params: {
	worldCard: PhaseAWorldCard;
	request: string;
	model: RouteModelPort;
}): Promise<RouteModeResult> {
	const startedAt = Date.now();
	let firstCandidate: unknown = null;
	let firstIssues: string[] = [];

	try {
		firstCandidate = await params.model.generateJson({
			promptVersion: ROUTE_PROMPT_VERSION,
			attempt: 1,
			systemPrompt: ROUTE_SYSTEM_PROMPT,
			userPrompt: buildRouteUserPrompt(params.worldCard, params.request),
			temperature: ROUTE_MODEL_TEMPERATURE,
			maxTokens: ROUTE_MODEL_MAX_TOKENS
		});
		const result = parseAndCompile(firstCandidate, params.worldCard, params.request);
		return {
			...result,
			attempts: 1,
			repaired: false,
			durationMs: Date.now() - startedAt
		};
	} catch (error) {
		firstIssues =
			firstCandidate === null
				? [error instanceof Error ? error.message : String(error)]
				: validationIssues(firstCandidate, params.request);
		if (firstIssues.length === 0) {
			firstIssues = [error instanceof Error ? error.message : String(error)];
		}
	}

	let repairCandidate: unknown = null;
	try {
		repairCandidate = await params.model.generateJson({
			promptVersion: ROUTE_PROMPT_VERSION,
			attempt: 2,
			systemPrompt: ROUTE_SYSTEM_PROMPT,
			userPrompt: buildRouteRepairPrompt({
				worldCard: params.worldCard,
				request: params.request,
				invalidCandidate: firstCandidate,
				issues: firstIssues
			}),
			temperature: ROUTE_MODEL_TEMPERATURE,
			maxTokens: ROUTE_MODEL_MAX_TOKENS
		});
		const result = parseAndCompile(repairCandidate, params.worldCard, params.request);
		return {
			...result,
			attempts: 2,
			repaired: true,
			durationMs: Date.now() - startedAt
		};
	} catch (error) {
		const repairIssues =
			repairCandidate === null
				? [error instanceof Error ? error.message : String(error)]
				: validationIssues(repairCandidate, params.request);
		throw new RouteModeFailure([...firstIssues, ...repairIssues]);
	}
}
