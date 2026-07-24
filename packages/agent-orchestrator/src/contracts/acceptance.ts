// packages/agent-orchestrator/src/contracts/acceptance.ts
import { z } from 'zod';

import { MAX_ARRAY_ITEMS, MAX_SUMMARY_CHARS } from './limits';
import {
	CanonicalIdSchema,
	DescriptionSchema,
	JsonObjectSchema,
	NonEmptyStringSchema,
	UuidSchema
} from './primitives';

const AcceptanceCriterionBaseSchema = z.object({
	criterion_id: CanonicalIdSchema,
	description: DescriptionSchema,
	required: z.boolean()
});

// The discriminant makes omission of a runtime validator explicit instead of silently self-grading.
export const AcceptanceCriterionSchema = z.discriminatedUnion('kind', [
	AcceptanceCriterionBaseSchema.extend({
		kind: z.literal('machine_checkable'),
		validator_id: CanonicalIdSchema,
		validator_config: JsonObjectSchema
	}).strict(),
	AcceptanceCriterionBaseSchema.extend({
		kind: z.literal('judgment'),
		validator_id: z.null(),
		validator_config: z.record(z.never()).default({})
	}).strict()
]);

// Results retain the authority that produced the verdict so runtime validation stays distinguishable.
export const AcceptanceResultSchema = z
	.object({
		criterion_id: CanonicalIdSchema,
		status: z.enum(['passed', 'failed', 'not_evaluated']),
		evaluation_source: z.enum(['runtime', 'agent']),
		validator_id: CanonicalIdSchema.nullable(),
		details: NonEmptyStringSchema.max(MAX_SUMMARY_CHARS),
		evidence_artifact_ids: z.array(UuidSchema).max(MAX_ARRAY_ITEMS)
	})
	.strict();

export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;
export type AcceptanceResult = z.infer<typeof AcceptanceResultSchema>;
