// packages/agent-orchestrator/src/testing/fixtures/base.ts
import type {
	AcceptanceCriterion,
	AcceptanceResult,
	CapabilityGap,
	DirectActionSpec,
	PermissionGrant,
	ProjectScope,
	RouteDecision,
	StepAssignment,
	StepSpec,
	WorkflowStageSpec
} from '../../contracts';

export const FIXTURE_IDS = {
	project: '11111111-1111-4111-8111-111111111111',
	run: '22222222-2222-4222-8222-222222222222',
	step: '33333333-3333-4333-8333-333333333333',
	dependentStep: '44444444-4444-4444-8444-444444444444',
	artifact: '55555555-5555-4555-8555-555555555555',
	previousArtifact: '66666666-6666-4666-8666-666666666666',
	fact: '77777777-7777-4777-8777-777777777777',
	excerpt: '88888888-8888-4888-8888-888888888888',
	signal: '99999999-9999-4999-8999-999999999999',
	stage: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
} as const;

export const FIXTURE_NOW = '2026-07-24T16:00:00.000Z';

export const acceptanceCriterionFixture = {
	criterion_id: 'required.fact.present',
	description: 'The answer identifies the current launch blocker.',
	required: true,
	kind: 'machine_checkable',
	validator_id: 'answer.contains_required_fact',
	validator_config: { required_fact_id: 'launch-blocker' }
} satisfies AcceptanceCriterion;

export const acceptanceResultFixture = {
	criterion_id: acceptanceCriterionFixture.criterion_id,
	status: 'passed',
	evaluation_source: 'runtime',
	validator_id: acceptanceCriterionFixture.validator_id,
	details: 'The required blocker is present.',
	evidence_artifact_ids: [FIXTURE_IDS.artifact]
} satisfies AcceptanceResult;

export const permissionGrantFixture = {
	mode: 'read_only',
	project_ids: [FIXTURE_IDS.project],
	operations: ['ontology.project.read', 'ontology.entity.read'],
	network: 'none',
	artifact_types_read: ['context_packet'],
	artifact_types_write: ['status_summary'],
	expires_at: '2026-07-24T17:00:00.000Z'
} satisfies PermissionGrant;

export const projectScopeFixture = {
	project_id: FIXTURE_IDS.project,
	project_name: 'Anonymized Launch',
	role: 'primary',
	reason: 'The request is explicitly scoped to this project.'
} satisfies ProjectScope;

export const stepSpecFixture = {
	schema_version: 1,
	client_step_key: 'read.project.status',
	agent_id: 'librarian.v0',
	goal: 'Gather the current project status and blocking work.',
	non_goals: ['Do not modify project data.'],
	input_artifact_ids: [],
	depends_on_step_keys: [],
	deliverable_type: 'context_packet',
	acceptance_criteria: [acceptanceCriterionFixture],
	user_visible_label: 'Reading project status'
} satisfies StepSpec;

export const dependentStepSpecFixture = {
	...stepSpecFixture,
	client_step_key: 'synthesize.status',
	agent_id: 'ceo.v0',
	goal: 'Synthesize the collected status evidence.',
	depends_on_step_keys: [stepSpecFixture.client_step_key],
	deliverable_type: 'status_summary',
	user_visible_label: 'Summarizing status'
} satisfies StepSpec;

export const workflowStageFixture = {
	schema_version: 1,
	client_stage_key: 'gather.and.summarize',
	label: 'Gather and summarize',
	purpose: 'Collect bounded project context and summarize the current state.',
	steps: [stepSpecFixture, dependentStepSpecFixture],
	join_policy: 'all',
	decision_gate: true,
	failure_policy: 'replan'
} satisfies WorkflowStageSpec;

export const directActionFixture = {
	schema_version: 1,
	operations: [
		{
			operation_id: 'ontology.project.read',
			project_id: FIXTURE_IDS.project,
			arguments: { include: ['status', 'blockers'] },
			expected_result: 'A bounded current project status view.',
			risk: 'low'
		}
	],
	user_visible_label: 'Reading project status'
} satisfies DirectActionSpec;

export const directRouteDecisionFixture = {
	schema_version: 1,
	route: 'direct',
	objective: 'What is blocking the launch?',
	reason_code: 'status_summary',
	project_ids: [FIXTURE_IDS.project],
	risk: 'low',
	confidence: 0.91,
	direct_action: directActionFixture
} satisfies RouteDecision;

export const workflowRouteDecisionFixture = {
	schema_version: 1,
	route: 'workflow',
	objective: 'Research three competitors and recommend a positioning change.',
	reason_code: 'multi_source_research',
	project_ids: [FIXTURE_IDS.project],
	risk: 'medium',
	confidence: 0.88,
	initial_stage: workflowStageFixture
} satisfies RouteDecision;

export const capabilityGapFixture = {
	gap_type: 'unsupported_operation',
	capability: 'external.email.send',
	description: 'No Phase A agent can send external email.',
	blocking: true,
	suggested_resolution: 'Draft the message for the user to send manually.'
} satisfies CapabilityGap;

export const clarifyRouteDecisionFixture = {
	schema_version: 1,
	route: 'clarify',
	objective: 'Fix the project.',
	reason_code: 'ambiguous_scope',
	project_ids: [],
	risk: 'medium',
	confidence: 0.72,
	questions: ['Which project and outcome should this request target?']
} satisfies RouteDecision;

export const capabilityGapRouteDecisionFixture = {
	schema_version: 1,
	route: 'capability_gap',
	objective: 'Send the launch email.',
	reason_code: 'unsupported_capability',
	project_ids: [FIXTURE_IDS.project],
	risk: 'high',
	confidence: 0.99,
	gap: capabilityGapFixture
} satisfies RouteDecision;

export const stepAssignmentFixture = {
	schema_version: 1,
	step_id: FIXTURE_IDS.step,
	agent_id: stepSpecFixture.agent_id,
	goal: stepSpecFixture.goal,
	non_goals: stepSpecFixture.non_goals,
	input_artifact_ids: stepSpecFixture.input_artifact_ids,
	deliverable_type: stepSpecFixture.deliverable_type,
	acceptance_criteria: stepSpecFixture.acceptance_criteria,
	permission_grant: permissionGrantFixture,
	budget: {
		max_usd: 1.5,
		max_tool_calls: 10,
		max_wall_clock_ms: 120_000
	},
	timeout_ms: 120_000,
	user_visible_label: stepSpecFixture.user_visible_label
} satisfies StepAssignment;
