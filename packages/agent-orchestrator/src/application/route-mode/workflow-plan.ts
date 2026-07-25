// packages/agent-orchestrator/src/application/route-mode/workflow-plan.ts

import type { RouteProposal } from './route-proposal';

export const WORKFLOW_PLAN_SELECTION_POLICY = 'observable-request-features-v1' as const;

export type WorkflowPlanShape =
	| 'supplied_source_research'
	| 'context_then_research'
	| 'parallel_research';

const SUPPLIED_URL = /https?:\/\/[^\s<>{}\[\]"']+/i;

const PROJECT_REFERENT_PATTERNS = [
	/\b(?:this|that|the current)\s+(?:project|goal|plan|task|document|record|score|metric|app|tool|setup|workflow)\b/i,
	/\b(?:for|about|from|within|inside|using|against)\s+(?:this|that|it)\b/i,
	/\b(?:my|our)\s+(?:current\s+)?project\b/i
] as const;

/**
 * Selects the initial workflow topology from request facts that code can observe. The model's
 * reason code remains useful telemetry, but cannot change the plan executed for repeated runs.
 */
export function selectWorkflowPlanShape(request: string): WorkflowPlanShape {
	if (SUPPLIED_URL.test(request)) return 'supplied_source_research';
	if (PROJECT_REFERENT_PATTERNS.some((pattern) => pattern.test(request))) {
		return 'context_then_research';
	}
	return 'parallel_research';
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

export function compileWorkflowStage(proposal: RouteProposal, request: string) {
	const planShape = selectWorkflowPlanShape(request);
	if (planShape === 'context_then_research') {
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

	// The fan-out decomposition is deliberately domain-neutral. An earlier revision named the
	// specific dimensions of one corpus scenario, which gave the workflow lane the acceptance
	// checks' answer key; see PHASE_A_AUDIT_2026-07-25.md S2.
	const steps =
		planShape === 'parallel_research'
			? [
					researcherStep(
						'research-source-a',
						`${proposal.objective}\nResearch focus: the core subject — current practice, constraints, and the concrete deliverables the objective asks for.`
					),
					researcherStep(
						'research-source-b',
						`${proposal.objective}\nResearch focus: an independent second line of evidence — alternatives, risks, failure modes, and how the result should be validated.`
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
