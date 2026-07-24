// packages/agent-orchestrator/src/contracts/provenance.ts
import { z } from 'zod';

import { MAX_EXCERPT_CHARS } from './limits';
import {
	ConfidenceSchema,
	DateTimeSchema,
	DescriptionSchema,
	NonEmptyStringSchema,
	SummarySchema,
	UuidSchema
} from './primitives';

export const ProvenanceSourceSchema = z
	.object({
		source_type: z.enum(['buildos_entity', 'artifact', 'web', 'user']),
		source_id: NonEmptyStringSchema.max(512),
		source_uri: z.string().url().max(2_048).nullable(),
		project_id: UuidSchema.nullable(),
		captured_at: DateTimeSchema
	})
	.strict();

// Facts keep source identity and freshness beside the claim rather than relying on transcript context.
export const ProvenancedFactSchema = z
	.object({
		fact_id: UuidSchema,
		statement: DescriptionSchema,
		source: ProvenanceSourceSchema,
		as_of: DateTimeSchema,
		confidence: ConfidenceSchema
	})
	.strict();

// Excerpts preserve a bounded verbatim fragment and a source locator for later verification.
export const ProvenancedExcerptSchema = z
	.object({
		excerpt_id: UuidSchema,
		text: NonEmptyStringSchema.max(MAX_EXCERPT_CHARS),
		source: ProvenanceSourceSchema,
		locator: NonEmptyStringSchema.max(500).nullable()
	})
	.strict();

// References let agents load full immutable artifacts selectively instead of expanding every digest.
export const ArtifactReferenceSchema = z
	.object({
		artifact_id: UuidSchema,
		artifact_type: NonEmptyStringSchema.max(100),
		artifact_version: z.number().int().positive(),
		summary: SummarySchema
	})
	.strict();

// Artifact provenance records the derivation relationship required to audit generated outputs.
export const ArtifactProvenanceSchema = z
	.object({
		relationship: z.enum(['derived_from', 'quoted_from', 'summarized_from', 'generated_from']),
		source: ProvenanceSourceSchema
	})
	.strict();

export type ProvenanceSource = z.infer<typeof ProvenanceSourceSchema>;
export type ProvenancedFact = z.infer<typeof ProvenancedFactSchema>;
export type ProvenancedExcerpt = z.infer<typeof ProvenancedExcerptSchema>;
export type ArtifactReference = z.infer<typeof ArtifactReferenceSchema>;
export type ArtifactProvenance = z.infer<typeof ArtifactProvenanceSchema>;
