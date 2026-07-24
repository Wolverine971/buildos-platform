// packages/agent-orchestrator/src/contracts/workflow-state-digest.ts
import { z } from 'zod';

import { AcceptanceResultSchema } from './acceptance';
import {
	CONTRACT_SCHEMA_VERSION,
	MAX_ARRAY_ITEMS,
	MAX_DIGEST_TOKENS,
	MAX_OBJECTIVE_CHARS
} from './limits';
import { PermissionGrantSchema } from './permission-grant';
import {
	CanonicalIdSchema,
	DateTimeSchema,
	DescriptionSchema,
	NonEmptyStringSchema,
	SummarySchema,
	UuidSchema
} from './primitives';
import { ProjectScopeSchema } from './project-scope';
import { TransitionActionSchema } from './transition-action';

export const DigestStageSchema = z
	.object({
		stage_id: UuidSchema,
		client_stage_key: CanonicalIdSchema,
		label: NonEmptyStringSchema.max(200),
		purpose: DescriptionSchema,
		status: z.enum(['running', 'waiting_decision', 'completed', 'partial', 'failed'])
	})
	.strict();

export const DigestStepSchema = z
	.object({
		step_id: UuidSchema,
		client_step_key: CanonicalIdSchema,
		agent_id: CanonicalIdSchema,
		label: NonEmptyStringSchema.max(200),
		status: z.enum(['queued', 'running', 'completed', 'partial', 'failed', 'cancelled']),
		summary: SummarySchema.nullable(),
		artifact_ids: z.array(UuidSchema).max(MAX_ARRAY_ITEMS)
	})
	.strict();

export const DigestArtifactSchema = z
	.object({
		artifact_id: UuidSchema,
		artifact_type: NonEmptyStringSchema.max(100),
		summary: SummarySchema,
		producer_step_id: UuidSchema,
		content_trust: z.literal('untrusted')
	})
	.strict();

export const DigestUserSignalSchema = z
	.object({
		signal_id: UuidSchema,
		type: z.enum(['cancel', 'guidance']),
		summary: SummarySchema,
		created_at: DateTimeSchema
	})
	.strict();

export const WorkflowBudgetDigestSchema = z
	.object({
		max_usd: z.number().nonnegative(),
		reserved_usd: z.number().nonnegative(),
		spent_usd: z.number().nonnegative(),
		remaining_usd: z.number().nonnegative(),
		elapsed_ms: z.number().int().nonnegative(),
		remaining_wall_clock_ms: z.number().int().nonnegative()
	})
	.strict();

export const DigestOverflowSchema = z
	.object({
		truncated: z.boolean(),
		omitted_item_count: z.number().int().nonnegative(),
		omitted_sections: z.array(NonEmptyStringSchema.max(100)).max(MAX_ARRAY_ITEMS)
	})
	.strict();

export const WorkflowStateDigestSchema = z
	.object({
		schema_version: z.literal(CONTRACT_SCHEMA_VERSION),
		objective: NonEmptyStringSchema.max(MAX_OBJECTIVE_CHARS),
		current_stage: DigestStageSchema,
		wake_reason: z.enum([
			'stage_joined',
			'stage_failed',
			'user_signal',
			'terminal_synthesis',
			'budget_exhausted'
		]),
		steps: z.array(DigestStepSchema).max(MAX_ARRAY_ITEMS),
		artifacts: z.array(DigestArtifactSchema).max(MAX_ARRAY_ITEMS),
		acceptance_failures: z.array(AcceptanceResultSchema).max(MAX_ARRAY_ITEMS),
		contradictions: z.array(DescriptionSchema).max(MAX_ARRAY_ITEMS),
		open_questions: z.array(DescriptionSchema).max(MAX_ARRAY_ITEMS),
		user_signals: z.array(DigestUserSignalSchema).max(MAX_ARRAY_ITEMS),
		project_scope: z.array(ProjectScopeSchema).max(MAX_ARRAY_ITEMS),
		budget: WorkflowBudgetDigestSchema,
		permission_grant: PermissionGrantSchema,
		allowed_transitions: z.array(TransitionActionSchema).min(1).max(7),
		overflow: DigestOverflowSchema,
		estimated_tokens: z.number().int().nonnegative().max(MAX_DIGEST_TOKENS)
	})
	.strict();

export type DigestStage = z.infer<typeof DigestStageSchema>;
export type DigestStep = z.infer<typeof DigestStepSchema>;
export type DigestArtifact = z.infer<typeof DigestArtifactSchema>;
export type DigestUserSignal = z.infer<typeof DigestUserSignalSchema>;
export type WorkflowBudgetDigest = z.infer<typeof WorkflowBudgetDigestSchema>;
export type DigestOverflow = z.infer<typeof DigestOverflowSchema>;
export type WorkflowStateDigest = z.infer<typeof WorkflowStateDigestSchema>;
