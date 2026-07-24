// packages/agent-orchestrator/src/contracts/route-reason-code.ts
import { z } from 'zod';

export const DirectRouteReasonCodeSchema = z.enum([
	'simple_read',
	'status_summary',
	'low_risk_direct_operation'
]);

export const WorkflowRouteReasonCodeSchema = z.enum([
	'single_source_research',
	'multi_source_research',
	'context_research_recommendation',
	'multi_step_synthesis'
]);

export const ClarifyRouteReasonCodeSchema = z.enum([
	'ambiguous_request',
	'ambiguous_scope',
	'missing_required_context'
]);

export const CapabilityGapRouteReasonCodeSchema = z.enum([
	'unsupported_capability',
	'unavailable_agent',
	'unavailable_tool',
	'insufficient_permission',
	'unsafe_operation'
]);

export const RouteReasonCodeSchema = z.union([
	DirectRouteReasonCodeSchema,
	WorkflowRouteReasonCodeSchema,
	ClarifyRouteReasonCodeSchema,
	CapabilityGapRouteReasonCodeSchema
]);

export type RouteReasonCode = z.infer<typeof RouteReasonCodeSchema>;
