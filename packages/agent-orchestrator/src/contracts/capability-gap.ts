// packages/agent-orchestrator/src/contracts/capability-gap.ts
import { z } from 'zod';

import { DescriptionSchema, NonEmptyStringSchema } from './primitives';

// A structured category makes unsupported work measurable and prevents vague fallback improvisation.
export const CapabilityGapSchema = z
	.object({
		gap_type: z.enum(['agent', 'tool', 'knowledge', 'permission', 'unsupported_operation']),
		capability: NonEmptyStringSchema.max(200),
		description: DescriptionSchema,
		blocking: z.boolean(),
		suggested_resolution: DescriptionSchema.nullable()
	})
	.strict();

export type CapabilityGap = z.infer<typeof CapabilityGapSchema>;
