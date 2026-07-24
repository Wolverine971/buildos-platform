// packages/agent-orchestrator/src/contracts/artifact.ts
import { z } from 'zod';

import { MAX_ARRAY_ITEMS, CONTRACT_SCHEMA_VERSION } from './limits';
import {
	BoundedJsonValueSchema,
	DateTimeSchema,
	NonEmptyStringSchema,
	SummarySchema,
	UuidSchema
} from './primitives';
import { ArtifactProvenanceSchema } from './provenance';

// Drafts are validated before persistence and intentionally omit storage-assigned identity and lineage.
export const ArtifactDraftSchema = z
	.object({
		schema_version: z.literal(CONTRACT_SCHEMA_VERSION),
		artifact_type: NonEmptyStringSchema.max(100),
		summary: SummarySchema,
		payload: BoundedJsonValueSchema,
		provenance: z.array(ArtifactProvenanceSchema).max(MAX_ARRAY_ITEMS)
	})
	.strict();

export const ArtifactEnvelopeSchema = z
	.object({
		schema_version: z.literal(CONTRACT_SCHEMA_VERSION),
		artifact_type: NonEmptyStringSchema.max(100),
		artifact_version: z.number().int().positive(),
		run_id: UuidSchema,
		producer_step_id: UuidSchema,
		supersedes_artifact_id: UuidSchema.nullable(),
		summary: SummarySchema,
		payload: BoundedJsonValueSchema,
		provenance: z.array(ArtifactProvenanceSchema).max(MAX_ARRAY_ITEMS),
		created_at: DateTimeSchema
	})
	.strict();

export type ArtifactDraft = z.infer<typeof ArtifactDraftSchema>;
export type ArtifactEnvelope = z.infer<typeof ArtifactEnvelopeSchema>;
