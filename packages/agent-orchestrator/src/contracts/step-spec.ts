// packages/agent-orchestrator/src/contracts/step-spec.ts
import { z } from 'zod';

import { AcceptanceCriterionSchema } from './acceptance';
import { CONTRACT_SCHEMA_VERSION, MAX_ARRAY_ITEMS } from './limits';
import {
	CanonicalIdSchema,
	DescriptionSchema,
	NonEmptyStringSchema,
	UuidSchema
} from './primitives';

export const StepSpecSchema = z
	.object({
		schema_version: z.literal(CONTRACT_SCHEMA_VERSION),
		client_step_key: CanonicalIdSchema,
		agent_id: CanonicalIdSchema,
		goal: DescriptionSchema,
		non_goals: z.array(DescriptionSchema).max(MAX_ARRAY_ITEMS),
		input_artifact_ids: z.array(UuidSchema).max(MAX_ARRAY_ITEMS),
		depends_on_step_keys: z.array(CanonicalIdSchema).max(MAX_ARRAY_ITEMS),
		deliverable_type: NonEmptyStringSchema.max(100),
		acceptance_criteria: z.array(AcceptanceCriterionSchema).min(1).max(MAX_ARRAY_ITEMS),
		user_visible_label: NonEmptyStringSchema.max(200)
	})
	.strict()
	.superRefine((step, context) => {
		if (step.depends_on_step_keys.includes(step.client_step_key)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['depends_on_step_keys'],
				message: 'A step cannot depend on itself'
			});
		}

		if (new Set(step.depends_on_step_keys).size !== step.depends_on_step_keys.length) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['depends_on_step_keys'],
				message: 'Step dependency keys must be unique'
			});
		}
	});

export type StepSpec = z.infer<typeof StepSpecSchema>;
