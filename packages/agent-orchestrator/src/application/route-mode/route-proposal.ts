// packages/agent-orchestrator/src/application/route-mode/route-proposal.ts
import { z } from 'zod';

import {
	CapabilityGapRouteReasonCodeSchema,
	ClarifyRouteReasonCodeSchema,
	ConfidenceSchema,
	DirectRouteReasonCodeSchema,
	NonEmptyStringSchema,
	WorkflowRouteReasonCodeSchema
} from '../../contracts';

const RouteProposalReasonCodeSchema = z.union([
	DirectRouteReasonCodeSchema,
	WorkflowRouteReasonCodeSchema,
	ClarifyRouteReasonCodeSchema,
	CapabilityGapRouteReasonCodeSchema
]);

export const RouteProposalSchema = z
	.object({
		schema_version: z.literal(1),
		route: z.enum(['direct', 'workflow', 'clarify', 'capability_gap']),
		reason_code: RouteProposalReasonCodeSchema,
		objective: NonEmptyStringSchema.max(4_000),
		confidence: ConfidenceSchema,
		questions: z.array(NonEmptyStringSchema.max(1_000)).max(5),
		gap: z
			.object({
				capability: NonEmptyStringSchema.max(200),
				description: NonEmptyStringSchema.max(4_000),
				suggested_resolution: NonEmptyStringSchema.max(4_000).nullable()
			})
			.strict()
			.nullable()
	})
	.strict()
	.superRefine((proposal, context) => {
		const reasonSchemas = {
			direct: DirectRouteReasonCodeSchema,
			workflow: WorkflowRouteReasonCodeSchema,
			clarify: ClarifyRouteReasonCodeSchema,
			capability_gap: CapabilityGapRouteReasonCodeSchema
		};
		if (!reasonSchemas[proposal.route].safeParse(proposal.reason_code).success) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['reason_code'],
				message: 'Reason code must belong to the selected route'
			});
		}
		if (proposal.route === 'clarify' && proposal.questions.length === 0) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['questions'],
				message: 'Clarify route requires at least one question'
			});
		}
		if (proposal.route !== 'clarify' && proposal.questions.length > 0) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['questions'],
				message: 'Only clarify route may include questions'
			});
		}
		if (proposal.route === 'capability_gap' && proposal.gap === null) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['gap'],
				message: 'Capability-gap route requires gap details'
			});
		}
		if (proposal.route !== 'capability_gap' && proposal.gap !== null) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['gap'],
				message: 'Only capability-gap route may include gap details'
			});
		}
	});

export type RouteProposal = z.infer<typeof RouteProposalSchema>;
