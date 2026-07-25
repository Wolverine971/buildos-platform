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

function acceptanceCriterion(id: string, description: string) {
	return {
		criterion_id: id,
		description,
		required: true,
		kind: 'judgment' as const,
		validator_id: null,
		validator_config: {}
	};
}

function researcherStep(key: string, goal: string) {
	return {
		schema_version: 1 as const,
		client_step_key: key,
		agent_id: 'researcher.v0',
		goal,
		non_goals: ['Do not mutate BuildOS data or perform actions on the user’s behalf.'],
		input_artifact_ids: [],
		depends_on_step_keys: [],
		deliverable_type: 'research_packet',
		acceptance_criteria: [
			acceptanceCriterion(
				`${key}.cited_findings`,
				'Return relevant findings with resolvable source citations.'
			)
		],
		user_visible_label: 'Researching relevant evidence'
	};
}

function compileWorkflowStage(proposal: RouteProposal) {
	if (proposal.reason_code === 'context_research_recommendation') {
		return {
			schema_version: 1 as const,
			client_stage_key: 'gather-project-context',
			label: 'Gather project context',
			purpose: 'Build the bounded project context needed before external research.',
			steps: [
				{
					schema_version: 1 as const,
					client_step_key: 'gather-context',
					agent_id: 'librarian.v0',
					goal: proposal.objective,
					non_goals: ['Do not perform external research or mutate project data.'],
					input_artifact_ids: [],
					depends_on_step_keys: [],
					deliverable_type: 'context_packet',
					acceptance_criteria: [
						acceptanceCriterion(
							'gather-context.relevant_project_context',
							'Return only project context relevant to the objective with provenance.'
						)
					],
					user_visible_label: 'Gathering relevant project context'
				}
			],
			join_policy: 'all' as const,
			decision_gate: true,
			failure_policy: 'replan' as const
		};
	}

	const steps =
		proposal.reason_code === 'multi_source_research' ||
		proposal.reason_code === 'multi_step_synthesis'
			? [
					researcherStep(
						'research-source-a',
						`${proposal.objective}\nResearch focus: domain workflow, operational constraints, deliverables, and validation.`
					),
					researcherStep(
						'research-source-b',
						`${proposal.objective}\nResearch focus: interface states, UI/UX risks, accessibility, usability, and user testing.`
					)
				]
			: [researcherStep('research-request', proposal.objective)];
	return {
		schema_version: 1 as const,
		client_stage_key: 'research',
		label: 'Research the request',
		purpose: 'Collect bounded cited evidence for the objective.',
		steps,
		join_policy: 'all' as const,
		decision_gate: true,
		failure_policy: 'complete_partial' as const
	};
}

function gapType(reasonCode: RouteProposal['reason_code']) {
	if (reasonCode === 'unavailable_agent') return 'agent' as const;
	if (reasonCode === 'unavailable_tool') return 'tool' as const;
	if (reasonCode === 'insufficient_permission') return 'permission' as const;
	return 'unsupported_operation' as const;
}

export function compileRouteDecision(
	proposal: RouteProposal,
	worldCard: PhaseAWorldCard
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
			initial_stage: compileWorkflowStage(proposal)
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

function validationIssues(value: unknown): string[] {
	const proposalResult = RouteProposalSchema.safeParse(value);
	if (!proposalResult.success) {
		return proposalResult.error.issues.map(
			(issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`
		);
	}
	try {
		compileRouteDecision(proposalResult.data, {
			current_project: { id: '00000000-0000-4000-8000-000000000000' }
		} as PhaseAWorldCard);
		return [];
	} catch (error) {
		return [error instanceof Error ? error.message : String(error)];
	}
}

function parseAndCompile(value: unknown, worldCard: PhaseAWorldCard) {
	const proposal = RouteProposalSchema.parse(value);
	return { proposal, decision: compileRouteDecision(proposal, worldCard) };
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
		const result = parseAndCompile(firstCandidate, params.worldCard);
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
				: validationIssues(firstCandidate);
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
		const result = parseAndCompile(repairCandidate, params.worldCard);
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
				: validationIssues(repairCandidate);
		throw new RouteModeFailure([...firstIssues, ...repairIssues]);
	}
}
