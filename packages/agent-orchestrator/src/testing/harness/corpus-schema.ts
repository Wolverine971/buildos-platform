// packages/agent-orchestrator/src/testing/harness/corpus-schema.ts
import { z } from 'zod';

import {
	CanonicalIdSchema,
	CapabilityGapRouteReasonCodeSchema,
	ClarifyRouteReasonCodeSchema,
	DateTimeSchema,
	DescriptionSchema,
	DirectRouteReasonCodeSchema,
	JsonObjectSchema,
	NonEmptyStringSchema,
	SummarySchema,
	UuidSchema,
	WorkflowRouteReasonCodeSchema
} from '../../contracts';

const RouteLabelSchema = z.enum(['direct', 'workflow', 'clarify', 'capability_gap']);

export const CandidateSourceSchema = z
	.object({
		kind: z.literal('production_chat_turn'),
		turn_ref_hash: z.string().regex(/^[a-f0-9]{12}$/),
		captured_on: z.string().date(),
		transformations: z.array(DescriptionSchema).max(10)
	})
	.strict();

export const AcceptanceCheckSchema = z
	.object({
		validator_id: CanonicalIdSchema,
		description: DescriptionSchema,
		required: z.boolean(),
		config: JsonObjectSchema
	})
	.strict();

export const CorpusCandidateSchema = z
	.object({
		candidate_id: CanonicalIdSchema,
		selection_status: z.literal('proposed'),
		class: z.enum([
			'simple_read',
			'status_summary',
			'single_source_lookup',
			'multi_source_research',
			'context_research_recommendation',
			'ambiguous',
			'unsupported_capability',
			'route_stress'
		]),
		source: CandidateSourceSchema,
		request_text: NonEmptyStringSchema.max(8_000),
		context_type: z.enum(['project', 'global']),
		snapshot_ref: NonEmptyStringSchema.max(300),
		proposed_route: RouteLabelSchema,
		proposed_reason_code: z.union([
			DirectRouteReasonCodeSchema,
			WorkflowRouteReasonCodeSchema,
			ClarifyRouteReasonCodeSchema,
			CapabilityGapRouteReasonCodeSchema
		]),
		acceptance_checks: z.array(AcceptanceCheckSchema).min(1).max(20),
		notes: DescriptionSchema
	})
	.strict()
	.superRefine((candidate, context) => {
		const reasonSchemas = {
			direct: DirectRouteReasonCodeSchema,
			workflow: WorkflowRouteReasonCodeSchema,
			clarify: ClarifyRouteReasonCodeSchema,
			capability_gap: CapabilityGapRouteReasonCodeSchema
		};
		if (
			!reasonSchemas[candidate.proposed_route].safeParse(candidate.proposed_reason_code)
				.success
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['proposed_reason_code'],
				message: 'Proposed reason code must be compatible with the proposed route'
			});
		}
	});

export const CandidateCorpusSchema = z
	.object({
		schema_version: z.literal(1),
		corpus_version: CanonicalIdSchema,
		status: z.literal('awaiting_dj_selection'),
		default_snapshot_ref: NonEmptyStringSchema.max(300),
		candidates: z.array(CorpusCandidateSchema).min(10).max(12)
	})
	.strict()
	.superRefine((corpus, context) => {
		const candidateIds = corpus.candidates.map((candidate) => candidate.candidate_id);
		const sourceRefs = corpus.candidates.map((candidate) => candidate.source.turn_ref_hash);
		if (new Set(candidateIds).size !== candidateIds.length) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Candidate IDs must be unique'
			});
		}
		if (new Set(sourceRefs).size !== sourceRefs.length) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Source turn refs must be unique'
			});
		}
	});

export const FrozenCorpusScenarioSchema = z
	.object({
		scenario_id: CanonicalIdSchema,
		selection_status: z.literal('frozen'),
		class: z.enum([
			'simple_read',
			'status_summary',
			'single_source_lookup',
			'multi_source_research',
			'context_research_recommendation',
			'ambiguous',
			'unsupported_capability'
		]),
		source: CandidateSourceSchema,
		request_text: NonEmptyStringSchema.max(8_000),
		context_type: z.enum(['project', 'global']),
		snapshot_ref: NonEmptyStringSchema.max(300),
		expected_route: RouteLabelSchema,
		expected_reason_code: z.union([
			DirectRouteReasonCodeSchema,
			WorkflowRouteReasonCodeSchema,
			ClarifyRouteReasonCodeSchema,
			CapabilityGapRouteReasonCodeSchema
		]),
		acceptance_checks: z.array(AcceptanceCheckSchema).min(1).max(20),
		notes: DescriptionSchema
	})
	.strict()
	.superRefine((scenario, context) => {
		const reasonSchemas = {
			direct: DirectRouteReasonCodeSchema,
			workflow: WorkflowRouteReasonCodeSchema,
			clarify: ClarifyRouteReasonCodeSchema,
			capability_gap: CapabilityGapRouteReasonCodeSchema
		};
		if (
			!reasonSchemas[scenario.expected_route].safeParse(scenario.expected_reason_code).success
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['expected_reason_code'],
				message: 'Expected reason code must be compatible with the expected route'
			});
		}
	});

export const FrozenCorpusSchema = z
	.object({
		schema_version: z.literal(1),
		corpus_version: z.literal('phase-a-frozen-v1'),
		status: z.literal('frozen'),
		approved_by: z.literal('DJ'),
		approved_at: DateTimeSchema,
		snapshot_ref: NonEmptyStringSchema.max(300),
		snapshot_sha256: z.string().regex(/^[a-f0-9]{64}$/),
		scenarios: z.array(FrozenCorpusScenarioSchema).length(8)
	})
	.strict()
	.superRefine((corpus, context) => {
		const scenarioIds = corpus.scenarios.map((scenario) => scenario.scenario_id);
		const sourceRefs = corpus.scenarios.map((scenario) => scenario.source.turn_ref_hash);
		if (new Set(scenarioIds).size !== scenarioIds.length) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Frozen scenario IDs must be unique'
			});
		}
		if (new Set(sourceRefs).size !== sourceRefs.length) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Frozen source turn refs must be unique'
			});
		}
		if (!corpus.scenarios.every((scenario) => scenario.snapshot_ref === corpus.snapshot_ref)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['snapshot_ref'],
				message: 'Every frozen scenario must use the corpus snapshot'
			});
		}
	});

const SnapshotTaskSchema = z
	.object({
		id: UuidSchema,
		title: NonEmptyStringSchema.max(300),
		description: DescriptionSchema,
		state: z.enum(['todo', 'in_progress', 'blocked', 'done']),
		priority: z.number().int().min(1).max(5),
		start_at: DateTimeSchema.nullable(),
		due_at: DateTimeSchema.nullable(),
		pillar: CanonicalIdSchema
	})
	.strict();

const SnapshotDocumentSchema = z
	.object({
		id: UuidSchema,
		title: NonEmptyStringSchema.max(300),
		state: z.enum(['draft', 'ready']),
		content: NonEmptyStringSchema.max(20_000)
	})
	.strict();

const SnapshotGoalSchema = z
	.object({
		id: UuidSchema,
		name: NonEmptyStringSchema.max(300),
		description: DescriptionSchema,
		state: z.enum(['draft', 'active', 'done']),
		target_date: DateTimeSchema.nullable()
	})
	.strict();

const SnapshotPlanSchema = z
	.object({
		id: UuidSchema,
		name: NonEmptyStringSchema.max(300),
		description: DescriptionSchema,
		state: z.enum(['draft', 'active', 'done'])
	})
	.strict();

const SnapshotEdgeSchema = z
	.object({
		id: UuidSchema,
		source_id: UuidSchema,
		source_kind: z.enum(['goal', 'plan', 'task', 'document']),
		target_id: UuidSchema,
		target_kind: z.enum(['goal', 'plan', 'task', 'document']),
		relationship: CanonicalIdSchema
	})
	.strict();

export const ProjectSnapshotSchema = z
	.object({
		schema_version: z.literal(1),
		snapshot_id: CanonicalIdSchema,
		source: z
			.object({
				kind: z.literal('anonymized_production_project'),
				project_ref_hash: z.string().regex(/^[a-f0-9]{64}$/),
				captured_at: DateTimeSchema,
				anonymization_notes: z.array(DescriptionSchema).min(1).max(20)
			})
			.strict(),
		as_of: DateTimeSchema,
		project: z
			.object({
				id: UuidSchema,
				name: NonEmptyStringSchema.max(300),
				description: DescriptionSchema,
				state: z.enum(['draft', 'active', 'paused', 'done']),
				stage: CanonicalIdSchema,
				next_step: SummarySchema
			})
			.strict(),
		tasks: z.array(SnapshotTaskSchema).min(1).max(100),
		documents: z.array(SnapshotDocumentSchema).min(1).max(50),
		goals: z.array(SnapshotGoalSchema).max(20),
		plans: z.array(SnapshotPlanSchema).max(20),
		edges: z.array(SnapshotEdgeSchema).max(200)
	})
	.strict()
	.superRefine((snapshot, context) => {
		const entityIds = new Set([
			...snapshot.tasks.map((item) => item.id),
			...snapshot.documents.map((item) => item.id),
			...snapshot.goals.map((item) => item.id),
			...snapshot.plans.map((item) => item.id)
		]);
		for (const [edgeIndex, edge] of snapshot.edges.entries()) {
			if (!entityIds.has(edge.source_id) || !entityIds.has(edge.target_id)) {
				context.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['edges', edgeIndex],
					message: 'Snapshot edges must reference included entities'
				});
			}
		}
	});

export type CorpusCandidate = z.infer<typeof CorpusCandidateSchema>;
export type CandidateCorpus = z.infer<typeof CandidateCorpusSchema>;
export type FrozenCorpusScenario = z.infer<typeof FrozenCorpusScenarioSchema>;
export type FrozenCorpus = z.infer<typeof FrozenCorpusSchema>;
export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;
