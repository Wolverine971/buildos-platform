// packages/agent-orchestrator/src/contracts/route-decision.ts
import { z } from 'zod';

import { CapabilityGapSchema } from './capability-gap';
import { DirectActionSpecSchema } from './direct-action';
import { CONTRACT_SCHEMA_VERSION, MAX_OBJECTIVE_CHARS, MAX_PROJECTS } from './limits';
import {
	ConfidenceSchema,
	DescriptionSchema,
	NonEmptyStringSchema,
	UuidSchema
} from './primitives';
import {
	CapabilityGapRouteReasonCodeSchema,
	ClarifyRouteReasonCodeSchema,
	DirectRouteReasonCodeSchema,
	WorkflowRouteReasonCodeSchema
} from './route-reason-code';
import { WorkflowStageSpecSchema } from './workflow-stage';

const RouteDecisionBaseSchema = z.object({
	schema_version: z.literal(CONTRACT_SCHEMA_VERSION),
	objective: NonEmptyStringSchema.max(MAX_OBJECTIVE_CHARS),
	project_ids: z.array(UuidSchema).max(MAX_PROJECTS),
	confidence: ConfidenceSchema
});

export const DirectRouteDecisionSchema = RouteDecisionBaseSchema.extend({
	route: z.literal('direct'),
	reason_code: DirectRouteReasonCodeSchema,
	risk: z.literal('low'),
	direct_action: DirectActionSpecSchema
}).strict();

export const WorkflowRouteDecisionSchema = RouteDecisionBaseSchema.extend({
	route: z.literal('workflow'),
	reason_code: WorkflowRouteReasonCodeSchema,
	risk: z.enum(['low', 'medium', 'high']),
	initial_stage: WorkflowStageSpecSchema
}).strict();

export const ClarifyRouteDecisionSchema = RouteDecisionBaseSchema.extend({
	route: z.literal('clarify'),
	reason_code: ClarifyRouteReasonCodeSchema,
	risk: z.enum(['low', 'medium', 'high']),
	questions: z.array(DescriptionSchema).min(1).max(5)
}).strict();

export const CapabilityGapRouteDecisionSchema = RouteDecisionBaseSchema.extend({
	route: z.literal('capability_gap'),
	reason_code: CapabilityGapRouteReasonCodeSchema,
	risk: z.enum(['low', 'medium', 'high']),
	gap: CapabilityGapSchema
}).strict();

export const RouteDecisionSchema = z.discriminatedUnion('route', [
	DirectRouteDecisionSchema,
	WorkflowRouteDecisionSchema,
	ClarifyRouteDecisionSchema,
	CapabilityGapRouteDecisionSchema
]);

export type RouteDecision = z.infer<typeof RouteDecisionSchema>;
