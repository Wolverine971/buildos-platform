// packages/agent-orchestrator/src/contracts/step-assignment.ts
import { z } from 'zod';

import { AcceptanceCriterionSchema } from './acceptance';
import { CONTRACT_SCHEMA_VERSION, MAX_ARRAY_ITEMS } from './limits';
import { PermissionGrantSchema } from './permission-grant';
import {
	CanonicalIdSchema,
	DescriptionSchema,
	NonEmptyStringSchema,
	UuidSchema
} from './primitives';

export const StepBudgetSchema = z
	.object({
		max_usd: z.number().positive().max(100),
		max_tool_calls: z.number().int().nonnegative().max(100),
		max_wall_clock_ms: z.number().int().min(1_000).max(3_600_000)
	})
	.strict();

export const StepAssignmentSchema = z
	.object({
		schema_version: z.literal(CONTRACT_SCHEMA_VERSION),
		step_id: UuidSchema,
		agent_id: CanonicalIdSchema,
		goal: DescriptionSchema,
		non_goals: z.array(DescriptionSchema).max(MAX_ARRAY_ITEMS),
		input_artifact_ids: z.array(UuidSchema).max(MAX_ARRAY_ITEMS),
		deliverable_type: NonEmptyStringSchema.max(100),
		acceptance_criteria: z.array(AcceptanceCriterionSchema).min(1).max(MAX_ARRAY_ITEMS),
		permission_grant: PermissionGrantSchema,
		budget: StepBudgetSchema,
		timeout_ms: z.number().int().min(1_000).max(3_600_000),
		user_visible_label: NonEmptyStringSchema.max(200)
	})
	.strict();

export type StepBudget = z.infer<typeof StepBudgetSchema>;
export type StepAssignment = z.infer<typeof StepAssignmentSchema>;
