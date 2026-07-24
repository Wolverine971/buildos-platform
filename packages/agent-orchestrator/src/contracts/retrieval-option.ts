// packages/agent-orchestrator/src/contracts/retrieval-option.ts
import { z } from 'zod';

import {
	CanonicalIdSchema,
	DescriptionSchema,
	JsonObjectSchema,
	NonEmptyStringSchema
} from './primitives';

// A declarative retrieval option exposes the next bounded read without granting execution authority.
export const RetrievalOptionSchema = z
	.object({
		option_id: CanonicalIdSchema,
		kind: z.enum(['buildos_read', 'artifact_load', 'web_search', 'web_visit']),
		operation: CanonicalIdSchema,
		label: NonEmptyStringSchema.max(200),
		reason: DescriptionSchema,
		arguments: JsonObjectSchema
	})
	.strict();

export type RetrievalOption = z.infer<typeof RetrievalOptionSchema>;
