// packages/agent-orchestrator/src/contracts/project-scope.ts
import { z } from 'zod';

import { DescriptionSchema, NonEmptyStringSchema, UuidSchema } from './primitives';

// The role and rationale make cross-project context deliberate and reviewable.
export const ProjectScopeSchema = z
	.object({
		project_id: UuidSchema,
		project_name: NonEmptyStringSchema.max(200),
		role: z.enum(['primary', 'related']),
		reason: DescriptionSchema
	})
	.strict();

export type ProjectScope = z.infer<typeof ProjectScopeSchema>;
