// packages/agent-orchestrator/src/testing/fixtures/digest.ts
import type { TransitionDecision, WorkflowStateDigest } from '../../contracts';
import { agentResultFixture, artifactEnvelopeFixture } from './artifacts';
import {
	directRouteDecisionFixture,
	FIXTURE_IDS,
	permissionGrantFixture,
	projectScopeFixture,
	stepSpecFixture,
	workflowStageFixture
} from './base';

export const workflowStateDigestFixture = {
	schema_version: 1,
	objective: directRouteDecisionFixture.objective,
	current_stage: {
		stage_id: FIXTURE_IDS.stage,
		client_stage_key: workflowStageFixture.client_stage_key,
		label: workflowStageFixture.label,
		purpose: workflowStageFixture.purpose,
		status: 'waiting_decision'
	},
	wake_reason: 'stage_joined',
	steps: [
		{
			step_id: FIXTURE_IDS.step,
			client_step_key: stepSpecFixture.client_step_key,
			agent_id: stepSpecFixture.agent_id,
			label: stepSpecFixture.user_visible_label,
			status: 'completed',
			summary: agentResultFixture.summary,
			artifact_ids: [FIXTURE_IDS.artifact]
		}
	],
	artifacts: [
		{
			artifact_id: FIXTURE_IDS.artifact,
			artifact_type: artifactEnvelopeFixture.artifact_type,
			summary: artifactEnvelopeFixture.summary,
			producer_step_id: FIXTURE_IDS.step,
			content_trust: 'untrusted'
		}
	],
	acceptance_failures: [],
	contradictions: [],
	open_questions: [],
	user_signals: [],
	project_scope: [projectScopeFixture],
	budget: {
		max_usd: 5,
		reserved_usd: 0,
		spent_usd: 0.42,
		remaining_usd: 4.58,
		elapsed_ms: 8_000,
		remaining_wall_clock_ms: 292_000
	},
	permission_grant: permissionGrantFixture,
	allowed_transitions: ['append_stage', 'complete', 'complete_partial', 'fail'],
	overflow: {
		truncated: false,
		omitted_item_count: 0,
		omitted_sections: []
	},
	estimated_tokens: 620
} satisfies WorkflowStateDigest;

export const transitionDecisionFixture = {
	schema_version: 1,
	action: 'complete',
	reason_code: 'objective_satisfied',
	final_artifact_ids: [FIXTURE_IDS.artifact]
} satisfies TransitionDecision;
