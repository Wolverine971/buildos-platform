// packages/agent-orchestrator/src/contracts/context-packet.ts
import { z } from 'zod';

import {
	ArtifactReferenceSchema,
	ProvenancedExcerptSchema,
	ProvenancedFactSchema
} from './provenance';
import { CONTRACT_SCHEMA_VERSION, MAX_ARRAY_ITEMS, MAX_OBJECTIVE_CHARS } from './limits';
import { DateTimeSchema, DescriptionSchema, NonEmptyStringSchema } from './primitives';
import { ProjectScopeSchema } from './project-scope';
import { RetrievalOptionSchema } from './retrieval-option';

export const ContextPacketSchema = z
	.object({
		schema_version: z.literal(CONTRACT_SCHEMA_VERSION),
		objective: NonEmptyStringSchema.max(MAX_OBJECTIVE_CHARS),
		project_scope: z.array(ProjectScopeSchema).max(MAX_ARRAY_ITEMS),
		facts: z.array(ProvenancedFactSchema).max(MAX_ARRAY_ITEMS),
		excerpts: z.array(ProvenancedExcerptSchema).max(MAX_ARRAY_ITEMS),
		artifact_refs: z.array(ArtifactReferenceSchema).max(MAX_ARRAY_ITEMS),
		constraints: z.array(DescriptionSchema).max(MAX_ARRAY_ITEMS),
		intentionally_excluded: z.array(DescriptionSchema).max(MAX_ARRAY_ITEMS),
		retrieval_options: z.array(RetrievalOptionSchema).max(MAX_ARRAY_ITEMS),
		as_of: DateTimeSchema
	})
	.strict();

export type ContextPacket = z.infer<typeof ContextPacketSchema>;
