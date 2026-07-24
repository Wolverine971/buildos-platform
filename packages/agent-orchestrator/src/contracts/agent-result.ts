// packages/agent-orchestrator/src/contracts/agent-result.ts
import { z } from 'zod';

import { AcceptanceResultSchema } from './acceptance';
import { ArtifactDraftSchema } from './artifact';
import { CapabilityGapSchema } from './capability-gap';
import { CONTRACT_SCHEMA_VERSION, MAX_ARRAY_ITEMS } from './limits';
import { ConfidenceSchema, DescriptionSchema, SummarySchema } from './primitives';

export const AgentResultSchema = z
	.object({
		schema_version: z.literal(CONTRACT_SCHEMA_VERSION),
		status: z.enum(['completed', 'partial', 'failed']),
		summary: SummarySchema,
		artifact_drafts: z.array(ArtifactDraftSchema).max(20),
		acceptance_results: z.array(AcceptanceResultSchema).max(MAX_ARRAY_ITEMS),
		open_questions: z.array(DescriptionSchema).max(MAX_ARRAY_ITEMS),
		assumptions: z.array(DescriptionSchema).max(MAX_ARRAY_ITEMS),
		residual_risks: z.array(DescriptionSchema).max(MAX_ARRAY_ITEMS),
		confidence: ConfidenceSchema.nullable(),
		capability_gaps: z.array(CapabilityGapSchema).max(MAX_ARRAY_ITEMS)
	})
	.strict();

export type AgentResult = z.infer<typeof AgentResultSchema>;
