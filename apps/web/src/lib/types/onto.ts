// apps/web/src/lib/types/onto.ts
/**
 * BuildOS Ontology Type Definitions with Zod Validation
 * Generated from v1-migration.sql and endpoint stubs
 */

import { z } from 'zod';

// ============================================
// FACETS
// ============================================

export const FacetsSchema = z
	.object({
		context: z
			.enum([
				'personal',
				'client',
				'commercial',
				'internal',
				'open_source',
				'community',
				'academic',
				'nonprofit',
				'startup'
			])
			.optional(),
		scale: z.enum(['micro', 'small', 'medium', 'large', 'epic']).optional(),
		stage: z
			.enum(['discovery', 'planning', 'execution', 'launch', 'maintenance', 'complete'])
			.optional()
	})
	.strict();

export type Facets = z.infer<typeof FacetsSchema>;

export const FacetDefaultsSchema = FacetsSchema;
export type FacetDefaults = z.infer<typeof FacetDefaultsSchema>;

// ============================================
// METADATA & TEMPLATE
// ============================================

export const TemplateMetadataSchema = z.object({
	realm: z.string().optional(),
	output_type: z.string().optional(),
	typical_scale: z.string().optional(),
	keywords: z.array(z.string()).optional(),
	description: z.string().optional()
});

export type TemplateMetadata = z.infer<typeof TemplateMetadataSchema>;

// ============================================
// FSM DEFINITIONS
// ============================================

export const FSMGuardSchema = z.object({
	type: z.enum(['has_property', 'has_facet', 'facet_in', 'all_facets_set', 'type_key_matches']),
	path: z.string().optional(),
	key: z.string().optional(),
	value: z.string().optional(),
	values: z.array(z.string()).optional(),
	keys: z.array(z.string()).optional(),
	pattern: z.string().optional()
});

export type FSMGuard = z.infer<typeof FSMGuardSchema>;

export const FSMActionSchema = z.object({
	type: z.enum([
		'update_facets',
		'spawn_tasks',
		'create_output',
		'create_doc_from_template',
		'create_research_doc',
		'schedule_rrule',
		'notify',
		'email_user',
		'email_admin',
		'run_llm_critique'
	]),
	// Action-specific fields (vary by type)
	facets: FacetsSchema.optional(),
	titles: z.array(z.string()).optional(),
	plan_id: z.string().uuid().optional(),
	props_template: z.record(z.unknown()).optional(),
	name: z.string().optional(),
	kind: z.string().optional(),
	props: z.record(z.unknown()).optional(),
	template_key: z.string().optional(),
	variables: z.record(z.unknown()).optional(),
	topic: z.string().optional(),
	sources: z.array(z.string()).optional(),
	rrule: z.string().optional(),
	task_template: z.record(z.unknown()).optional(),
	to_actor_ids: z.array(z.string().uuid()).optional(),
	message: z.string().optional(),
	to: z.string().email().optional(),
	subject: z.string().optional(),
	body_template: z.string().optional(),
	body: z.string().optional(),
	output_id: z.string().uuid().optional(),
	rubric_key: z.string().optional(),
	type_key: z.string().optional()
});

export type FSMAction = z.infer<typeof FSMActionSchema>;

export const FSMTransitionSchema = z.object({
	from: z.string(),
	to: z.string(),
	event: z.string(),
	guards: z.array(FSMGuardSchema).optional(),
	actions: z.array(FSMActionSchema).optional()
});

export type FSMTransition = z.infer<typeof FSMTransitionSchema>;

export const FSMDefSchema = z.object({
	type_key: z.string().regex(/^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$/),
	states: z.array(z.string()).min(3).max(6),
	transitions: z.array(FSMTransitionSchema)
});

export type FSMDef = z.infer<typeof FSMDefSchema>;

// ============================================
// TEMPLATE
// ============================================

export const TemplateSchema = z.object({
	id: z.string().uuid().optional(),
	scope: z.enum([
		'project',
		'plan',
		'task',
		'output',
		'document',
		'goal',
		'requirement',
		'risk',
		'milestone',
		'metric'
	]),
	type_key: z.string().regex(/^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$/),
	name: z.string(),
	status: z.enum(['draft', 'active', 'deprecated']),
	parent_template_id: z.string().uuid().nullable().optional(),
	is_abstract: z.boolean().optional(),
	schema: z.record(z.unknown()), // JSON Schema
	fsm: FSMDefSchema,
	default_props: z.record(z.unknown()),
	default_views: z.array(z.record(z.unknown())),
	metadata: TemplateMetadataSchema.optional(),
	facet_defaults: FacetDefaultsSchema.optional(),
	created_by: z.string().uuid().optional(),
	created_at: z.string().datetime().optional(),
	updated_at: z.string().datetime().optional()
});

export type Template = z.infer<typeof TemplateSchema>;

// ============================================
// PROJECT SPEC (for instantiation)
// ============================================

const ProjectSpecProjectSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	type_key: z.string().regex(/^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$/),
	also_types: z.array(z.string()).optional(),
	state_key: z.string().optional(),
	props: z
		.object({
			facets: FacetsSchema.optional()
		})
		.passthrough()
		.optional(),
	start_at: z.string().datetime().optional(),
	end_at: z.string().datetime().optional()
});

export const ProjectSpecSchema = z.object({
	project: ProjectSpecProjectSchema,
	goals: z
		.array(
			z.object({
				name: z.string(),
				type_key: z.string().optional(),
				props: z.record(z.unknown()).optional()
			})
		)
		.optional(),
	requirements: z
		.array(
			z.object({
				text: z.string(),
				type_key: z.string().optional(),
				props: z.record(z.unknown()).optional()
			})
		)
		.optional(),
	plans: z
		.array(
			z.object({
				name: z.string(),
				type_key: z.string(),
				state_key: z.string().optional(),
				props: z
					.object({
						facets: FacetsSchema.optional()
					})
					.passthrough()
					.optional()
			})
		)
		.optional(),
	tasks: z
		.array(
			z.object({
				title: z.string(),
				plan_name: z.string().optional(),
				state_key: z.string().optional(),
				priority: z.number().int().min(1).max(5).optional(),
				due_at: z.string().datetime().optional(),
				props: z
					.object({
						facets: z
							.object({
								scale: z
									.enum(['micro', 'small', 'medium', 'large', 'epic'])
									.optional()
							})
							.optional()
					})
					.passthrough()
					.optional()
			})
		)
		.optional(),
	outputs: z
		.array(
			z.object({
				name: z.string(),
				type_key: z.string(),
				state_key: z.string().optional(),
				props: z
					.object({
						facets: z
							.object({
								stage: z
									.enum([
										'discovery',
										'planning',
										'execution',
										'launch',
										'maintenance',
										'complete'
									])
									.optional()
							})
							.optional()
					})
					.passthrough()
					.optional()
			})
		)
		.optional(),
	documents: z
		.array(
			z.object({
				title: z.string(),
				type_key: z.string(),
				props: z.record(z.unknown()).optional()
			})
		)
		.optional(),
	sources: z
		.array(
			z.object({
				uri: z.string().url(),
				snapshot_uri: z.string().url().optional(),
				props: z.record(z.unknown()).optional()
			})
		)
		.optional(),
	metrics: z
		.array(
			z.object({
				name: z.string(),
				unit: z.string(),
				type_key: z.string().optional(),
				definition: z.string().optional(),
				props: z.record(z.unknown()).optional()
			})
		)
		.optional(),
	milestones: z
		.array(
			z.object({
				title: z.string(),
				due_at: z.string().datetime(),
				type_key: z.string().optional(),
				props: z.record(z.unknown()).optional()
			})
		)
		.optional(),
	risks: z
		.array(
			z.object({
				title: z.string(),
				type_key: z.string().optional(),
				probability: z.number().min(0).max(1).optional(),
				impact: z.enum(['low', 'medium', 'high', 'critical']).optional(),
				props: z.record(z.unknown()).optional()
			})
		)
		.optional(),
	decisions: z
		.array(
			z.object({
				title: z.string(),
				decision_at: z.string().datetime(),
				rationale: z.string().optional(),
				props: z.record(z.unknown()).optional()
			})
		)
		.optional(),
	edges: z
		.array(
			z.object({
				src_kind: z.string(),
				src_id: z.string().uuid(),
				rel: z.string(),
				dst_kind: z.string(),
				dst_id: z.string().uuid(),
				props: z.record(z.unknown()).optional()
			})
		)
		.optional(),
	clarifications: z
		.array(
			z.object({
				key: z.string(),
				question: z.string(),
				required: z.boolean(),
				choices: z.array(z.string()).optional(),
				help_text: z.string().optional()
			})
		)
		.optional(),
	meta: z
		.object({
			model: z.string().optional(),
			template_keys: z.array(z.string()).optional(),
			confidence: z.number().min(0).max(1).optional(),
			suggested_facets: FacetsSchema.optional()
		})
		.optional()
});

export type ProjectSpec = z.infer<typeof ProjectSpecSchema>;

// ============================================
// FSM TRANSITION REQUEST
// ============================================

export const FSMTransitionRequestSchema = z.object({
	object_kind: z.enum(['task', 'output', 'plan', 'project', 'document']),
	object_id: z.string().uuid(),
	event: z.string()
});

export type FSMTransitionRequest = z.infer<typeof FSMTransitionRequestSchema>;

// ============================================
// ENTITY TYPES (database records)
// ============================================

export const ProjectSchema = z.object({
	id: z.string().uuid(),
	org_id: z.string().uuid().nullable().optional(),
	name: z.string(),
	description: z.string().nullable().optional(),
	type_key: z.string(),
	also_types: z.array(z.string()).optional(),
	state_key: z.string(),
	props: z.record(z.unknown()),
	facet_context: z.string().nullable().optional(),
	facet_scale: z.string().nullable().optional(),
	facet_stage: z.string().nullable().optional(),
	start_at: z.string().datetime().nullable().optional(),
	end_at: z.string().datetime().nullable().optional(),
	context_document_id: z.string().uuid().nullable().optional(),
	created_by: z.string().uuid(),
	created_at: z.string().datetime(),
	updated_at: z.string().datetime()
});

export type Project = z.infer<typeof ProjectSchema>;

export const PlanSchema = z.object({
	id: z.string().uuid(),
	project_id: z.string().uuid(),
	name: z.string(),
	type_key: z.string(),
	state_key: z.string(),
	props: z.record(z.unknown()),
	facet_context: z.string().nullable().optional(),
	facet_scale: z.string().nullable().optional(),
	facet_stage: z.string().nullable().optional(),
	created_by: z.string().uuid(),
	created_at: z.string().datetime(),
	updated_at: z.string().datetime()
});

export type Plan = z.infer<typeof PlanSchema>;

export const TaskSchema = z.object({
	id: z.string().uuid(),
	project_id: z.string().uuid(),
	plan_id: z.string().uuid().nullable().optional(),
	title: z.string(),
	state_key: z.string(),
	priority: z.number().int().nullable().optional(),
	due_at: z.string().datetime().nullable().optional(),
	props: z.record(z.unknown()),
	facet_scale: z.string().nullable().optional(),
	created_by: z.string().uuid(),
	created_at: z.string().datetime(),
	updated_at: z.string().datetime()
});

export type Task = z.infer<typeof TaskSchema>;

export const OutputSchema = z.object({
	id: z.string().uuid(),
	project_id: z.string().uuid(),
	name: z.string(),
	type_key: z.string(),
	state_key: z.string(),
	props: z.record(z.unknown()),
	facet_stage: z.string().nullable().optional(),
	created_by: z.string().uuid(),
	created_at: z.string().datetime(),
	updated_at: z.string().datetime()
});

export type Output = z.infer<typeof OutputSchema>;

export const DocumentSchema = z.object({
	id: z.string().uuid(),
	project_id: z.string().uuid(),
	title: z.string(),
	type_key: z.string(),
	state_key: z.string().default('draft'),
	props: z.record(z.unknown()),
	created_by: z.string().uuid(),
	created_at: z.string().datetime(),
	updated_at: z.string().datetime()
});

export type Document = z.infer<typeof DocumentSchema>;

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate type_key format (lowercase dot-separated, 2-3 segments)
 */
export function isValidTypeKey(typeKey: string): boolean {
	return /^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$/.test(typeKey);
}

/**
 * Validate FSM definition structure
 * Returns { valid: boolean, errors: string[] }
 */
export function validateFSMDef(fsm: unknown): { valid: boolean; errors: string[] } {
	const result = FSMDefSchema.safeParse(fsm);

	if (result.success) {
		// Additional validation: check for duplicate (from, event) pairs
		const fsmDef = result.data;
		const seen = new Set<string>();
		const duplicates: string[] = [];

		for (const t of fsmDef.transitions) {
			const key = `${t.from}:${t.event}`;
			if (seen.has(key)) {
				duplicates.push(key);
			}
			seen.add(key);
		}

		if (duplicates.length > 0) {
			return {
				valid: false,
				errors: [`Duplicate transitions found: ${duplicates.join(', ')}`]
			};
		}

		return { valid: true, errors: [] };
	}

	return {
		valid: false,
		errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
	};
}

/**
 * Validate ProjectSpec before instantiation
 */
export function validateProjectSpec(spec: unknown): { valid: boolean; errors: string[] } {
	const result = ProjectSpecSchema.safeParse(spec);

	if (result.success) {
		return { valid: true, errors: [] };
	}

	return {
		valid: false,
		errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
	};
}
