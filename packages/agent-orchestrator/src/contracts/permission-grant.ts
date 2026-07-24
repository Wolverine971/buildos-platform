// packages/agent-orchestrator/src/contracts/permission-grant.ts
import { z } from 'zod';

import { MAX_ARRAY_ITEMS, MAX_PROJECTS } from './limits';
import { CanonicalIdSchema, DateTimeSchema, NonEmptyStringSchema, UuidSchema } from './primitives';

// Exact scopes encode the server-computed least-privilege intersection described in §10.
export const PermissionGrantSchema = z
	.object({
		mode: z.enum(['read_only', 'propose', 'stage', 'commit']),
		project_ids: z.array(UuidSchema).max(MAX_PROJECTS),
		operations: z.array(CanonicalIdSchema).max(MAX_ARRAY_ITEMS),
		network: z.enum(['none', 'web_read']),
		artifact_types_read: z.array(NonEmptyStringSchema.max(100)).max(MAX_ARRAY_ITEMS),
		artifact_types_write: z.array(NonEmptyStringSchema.max(100)).max(MAX_ARRAY_ITEMS),
		expires_at: DateTimeSchema
	})
	.strict();

export type PermissionGrant = z.infer<typeof PermissionGrantSchema>;
