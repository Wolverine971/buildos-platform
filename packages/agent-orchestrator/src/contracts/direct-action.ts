// packages/agent-orchestrator/src/contracts/direct-action.ts
import { z } from 'zod';

import { CONTRACT_SCHEMA_VERSION } from './limits';
import {
	CanonicalIdSchema,
	DescriptionSchema,
	JsonObjectSchema,
	NonEmptyStringSchema,
	UuidSchema
} from './primitives';

// Direct operations are low-risk canonical calls, not an open-ended miniature agent loop.
export const DirectOperationSchema = z
	.object({
		operation_id: CanonicalIdSchema,
		project_id: UuidSchema.nullable(),
		arguments: JsonObjectSchema,
		expected_result: DescriptionSchema,
		risk: z.literal('low')
	})
	.strict();

export const DirectActionSpecSchema = z
	.object({
		schema_version: z.literal(CONTRACT_SCHEMA_VERSION),
		operations: z.array(DirectOperationSchema).min(1).max(10),
		user_visible_label: NonEmptyStringSchema.max(200)
	})
	.strict();

export type DirectOperation = z.infer<typeof DirectOperationSchema>;
export type DirectActionSpec = z.infer<typeof DirectActionSpecSchema>;
