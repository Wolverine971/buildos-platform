// packages/agent-orchestrator/src/contracts/transition-decision.ts
import { z } from 'zod';

import { CapabilityGapSchema } from './capability-gap';
import { CONTRACT_SCHEMA_VERSION, MAX_ARRAY_ITEMS } from './limits';
import { DescriptionSchema, UuidSchema } from './primitives';
import { WorkflowStageSpecSchema } from './workflow-stage';

export const TransitionReasonCodeSchema = z.enum([
	'stage_ready',
	'stage_completed',
	'stage_partial',
	'stage_failed',
	'acceptance_failed',
	'conflicting_evidence',
	'more_research_required',
	'user_input_required',
	'objective_satisfied',
	'partial_objective_satisfied',
	'unsupported_capability',
	'budget_exhausted',
	'policy_limit_reached',
	'unrecoverable_failure'
]);

const TransitionDecisionBaseSchema = z.object({
	schema_version: z.literal(CONTRACT_SCHEMA_VERSION),
	reason_code: TransitionReasonCodeSchema
});

export const TransitionDecisionSchema = z.discriminatedUnion('action', [
	TransitionDecisionBaseSchema.extend({ action: z.literal('continue_existing_graph') }).strict(),
	TransitionDecisionBaseSchema.extend({
		action: z.literal('append_stage'),
		next_stage: WorkflowStageSpecSchema
	}).strict(),
	TransitionDecisionBaseSchema.extend({
		action: z.literal('request_user_input'),
		questions: z.array(DescriptionSchema).min(1).max(5)
	}).strict(),
	TransitionDecisionBaseSchema.extend({
		action: z.literal('complete'),
		final_artifact_ids: z.array(UuidSchema).min(1).max(MAX_ARRAY_ITEMS)
	}).strict(),
	TransitionDecisionBaseSchema.extend({
		action: z.literal('complete_partial'),
		final_artifact_ids: z.array(UuidSchema).max(MAX_ARRAY_ITEMS)
	}).strict(),
	TransitionDecisionBaseSchema.extend({
		action: z.literal('capability_gap'),
		gap: CapabilityGapSchema
	}).strict(),
	TransitionDecisionBaseSchema.extend({ action: z.literal('fail') }).strict()
]);

export type TransitionReasonCode = z.infer<typeof TransitionReasonCodeSchema>;
export type TransitionDecision = z.infer<typeof TransitionDecisionSchema>;
