// apps/web/src/lib/types/onto.ts
/**
 * BuildOS Ontology Type Definitions with Zod Validation
 * Generated from v1-migration.sql and endpoint stubs
 *
 * Updated: Dec 2025 - Simplified FSM to enum-based states
 */

import { z } from 'zod';

// ============================================
// STATE ENUMS (New: Dec 2025)
// These match PostgreSQL enums in the database
// ============================================

/** Task states: todo → in_progress → done, or blocked */
export const TASK_STATES = ['todo', 'in_progress', 'blocked', 'done'] as const;
export type TaskState = (typeof TASK_STATES)[number];
export const TaskStateSchema = z.enum(TASK_STATES);

/** Project states: planning → active → completed, or cancelled */
export const PROJECT_STATES = ['planning', 'active', 'completed', 'cancelled'] as const;
export type ProjectState = (typeof PROJECT_STATES)[number];
export const ProjectStateSchema = z.enum(PROJECT_STATES);

/** Plan states: draft → active → completed */
export const PLAN_STATES = ['draft', 'active', 'completed'] as const;
export type PlanState = (typeof PLAN_STATES)[number];
export const PlanStateSchema = z.enum(PLAN_STATES);

/** Output states: draft → in_progress → review → published */
export const OUTPUT_STATES = ['draft', 'in_progress', 'review', 'published'] as const;
export type OutputState = (typeof OUTPUT_STATES)[number];
export const OutputStateSchema = z.enum(OUTPUT_STATES);

/** Document states: draft → review → published */
export const DOCUMENT_STATES = ['draft', 'review', 'published'] as const;
export type DocumentState = (typeof DOCUMENT_STATES)[number];
export const DocumentStateSchema = z.enum(DOCUMENT_STATES);

/** Goal states: draft → active → achieved, or abandoned */
export const GOAL_STATES = ['draft', 'active', 'achieved', 'abandoned'] as const;
export type GoalState = (typeof GOAL_STATES)[number];
export const GoalStateSchema = z.enum(GOAL_STATES);

/** Milestone states: pending → in_progress → completed, or missed */
export const MILESTONE_STATES = ['pending', 'in_progress', 'completed', 'missed'] as const;
export type MilestoneState = (typeof MILESTONE_STATES)[number];
export const MilestoneStateSchema = z.enum(MILESTONE_STATES);

/** Risk states: identified → mitigated/occurred → closed */
export const RISK_STATES = ['identified', 'mitigated', 'occurred', 'closed'] as const;
export type RiskState = (typeof RISK_STATES)[number];
export const RiskStateSchema = z.enum(RISK_STATES);

/**
 * Get valid states for an entity kind
 */
export function getStatesForKind(kind: string): readonly string[] {
	switch (kind) {
		case 'task':
			return TASK_STATES;
		case 'project':
			return PROJECT_STATES;
		case 'plan':
			return PLAN_STATES;
		case 'output':
			return OUTPUT_STATES;
		case 'document':
			return DOCUMENT_STATES;
		case 'goal':
			return GOAL_STATES;
		case 'milestone':
			return MILESTONE_STATES;
		case 'risk':
			return RISK_STATES;
		default:
			return [];
	}
}

/**
 * Validate if a state is valid for a given entity kind
 */
export function isValidState(kind: string, state: string): boolean {
	const validStates = getStatesForKind(kind);
	return validStates.includes(state);
}

/**
 * Get the default state for an entity kind
 */
export function getDefaultState(kind: string): string {
	switch (kind) {
		case 'task':
			return 'todo';
		case 'project':
			return 'planning';
		case 'plan':
			return 'draft';
		case 'output':
			return 'draft';
		case 'document':
			return 'draft';
		case 'goal':
			return 'draft';
		case 'milestone':
			return 'pending';
		case 'risk':
			return 'identified';
		default:
			return 'draft';
	}
}

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
// FSM DEFINITIONS (DEPRECATED - Dec 2025)
// These types are kept for backward compatibility during migration.
// FSM has been replaced with simple enum-based states.
// See STATE ENUMS section above for the new approach.
// ============================================

/**
 * @deprecated FSM guards are no longer used. States are now simple enums.
 */
export const FSMGuardSchema = z.object({
	type: z.enum(['has_property', 'has_facet', 'facet_in', 'all_facets_set', 'type_key_matches']),
	path: z.string().optional(),
	key: z.string().optional(),
	value: z.string().optional(),
	values: z.array(z.string()).optional(),
	keys: z.array(z.string()).optional(),
	pattern: z.string().optional()
});

/** @deprecated Use simple state enums instead */
export type FSMGuard = z.infer<typeof FSMGuardSchema>;

/**
 * @deprecated FSM actions are no longer used. Use direct API calls instead.
 */
export const FSMActionSchema = z.object({
	type: z.enum([
		'update_facets',
		'spawn_tasks',
		'create_output',
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

/** @deprecated Use simple state enums instead */
export type FSMAction = z.infer<typeof FSMActionSchema>;

/**
 * @deprecated FSM transitions are no longer used. Change state_key directly.
 */
export const FSMTransitionSchema = z.object({
	from: z.string(),
	to: z.string(),
	event: z.string(),
	guards: z.array(FSMGuardSchema).optional(),
	actions: z.array(FSMActionSchema).optional()
});

/** @deprecated Use simple state enums instead */
export type FSMTransition = z.infer<typeof FSMTransitionSchema>;

/**
 * @deprecated FSM definitions are no longer used. States are now simple enums.
 */
export const FSMDefSchema = z.object({
	type_key: z.string().regex(/^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$/),
	initial: z.string().optional(),
	states: z.array(z.string()).min(3).max(6),
	transitions: z.array(FSMTransitionSchema)
});

/** @deprecated Use simple state enums instead */
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
		'event',
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
	type_key: z
		.string()
		.regex(
			/^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$/,
			'type_key must be 2-3 lowercase dot-separated segments (e.g., "project.creative.book", "project.technical.app"). Use only lowercase letters and underscores.'
		),
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

const ProjectSpecDocumentSchema = z.object({
	title: z.string(),
	type_key: z.string(),
	state_key: z.string().optional(),
	body_markdown: z.string().optional(),
	props: z.record(z.unknown()).optional()
});

const ContextDocumentSchema = z.object({
	title: z.string().min(1),
	body_markdown: z.string().min(1),
	type_key: z.string().optional(),
	state_key: z.string().optional(),
	props: z.record(z.unknown()).optional()
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
				type_key: z
					.string()
					.regex(
						/^task\.[a-z_]+(\.[a-z_]+)?$/,
						'task type_key must start with "task." followed by 1-2 lowercase segments (e.g., "task.execute", "task.coordinate.meeting")'
					)
					.optional()
					.default('task.execute'),
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
	documents: z.array(ProjectSpecDocumentSchema).optional(),
	context_document: ContextDocumentSchema.optional(),
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
// FSM TRANSITION REQUEST (DEPRECATED)
// ============================================

/**
 * @deprecated FSM transitions are no longer used. Update state_key directly via PATCH.
 */
export const FSMTransitionRequestSchema = z.object({
	object_kind: z.enum(['task', 'output', 'plan', 'project', 'document']),
	object_id: z.string().uuid(),
	event: z.string()
});

/** @deprecated Use direct state_key updates via PATCH instead */
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
	state_key: ProjectStateSchema,
	props: z.record(z.unknown()),
	facet_context: z.string().nullable().optional(),
	facet_scale: z.string().nullable().optional(),
	facet_stage: z.string().nullable().optional(),
	start_at: z.string().datetime().nullable().optional(),
	end_at: z.string().datetime().nullable().optional(),
	// Next step fields for "BuildOS surfaces next moves" feature
	next_step_short: z.string().nullable().optional(),
	next_step_long: z.string().nullable().optional(),
	next_step_updated_at: z.string().datetime().nullable().optional(),
	next_step_source: z.enum(['ai', 'user']).nullable().optional(),
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
	state_key: PlanStateSchema,
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
	title: z.string(),
	type_key: z.string().regex(/^task\.[a-z_]+(\.[a-z_]+)?$/),
	state_key: TaskStateSchema,
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
	state_key: OutputStateSchema,
	props: z.record(z.unknown()),
	facet_stage: z.string().nullable().optional(),
	// Promotion source references
	source_document_id: z.string().uuid().nullable().optional(),
	source_event_id: z.string().uuid().nullable().optional(),
	created_by: z.string().uuid(),
	created_at: z.string().datetime(),
	updated_at: z.string().datetime()
});

export type Output = z.infer<typeof OutputSchema>;

/**
 * Deliverable/Output with enriched data for UI display
 */
export interface EnrichedOutput extends Output {
	/** The primitive type derived from type_key */
	primitive: DeliverablePrimitive;
	/** Display label for the deliverable type */
	type_label: string;
	/** Related tasks count */
	task_count?: number;
	/** Related documents count (for collections) */
	child_count?: number;
	/** Source document if promoted from document */
	source_document?: Document;
	/** Source event if promoted from event */
	source_event?: OntoEvent;
}

export const DocumentSchema = z.object({
	id: z.string().uuid(),
	project_id: z.string().uuid(),
	title: z.string(),
	type_key: z.string(),
	state_key: DocumentStateSchema.default('draft'),
	props: z.record(z.unknown()),
	created_by: z.string().uuid(),
	created_at: z.string().datetime(),
	updated_at: z.string().datetime()
});

export type Document = z.infer<typeof DocumentSchema>;

// ============================================
// ONTO_EVENTS (Calendar Events)
// ============================================

export const OntoEventSchema = z.object({
	id: z.string().uuid(),
	org_id: z.string().uuid().nullable().optional(),
	project_id: z.string().uuid().nullable().optional(),
	owner_entity_type: z.enum(['project', 'plan', 'task', 'goal', 'output', 'actor', 'standalone']),
	owner_entity_id: z.string().uuid().nullable().optional(),
	type_key: z.string(),
	state_key: z.string(),
	template_id: z.string().uuid().nullable().optional(),
	template_snapshot: z.record(z.unknown()),
	title: z.string(),
	description: z.string().nullable().optional(),
	location: z.string().nullable().optional(),
	start_at: z.string().datetime(),
	end_at: z.string().datetime().nullable().optional(),
	all_day: z.boolean(),
	timezone: z.string().nullable().optional(),
	recurrence: z.record(z.unknown()),
	external_link: z.string().nullable().optional(),
	props: z.record(z.unknown()),
	last_synced_at: z.string().datetime().nullable().optional(),
	sync_status: z.string(),
	sync_error: z.string().nullable().optional(),
	deleted_at: z.string().datetime().nullable().optional(),
	facet_context: z.string().nullable().optional(),
	facet_scale: z.string().nullable().optional(),
	facet_stage: z.string().nullable().optional(),
	created_by: z.string().uuid(),
	created_at: z.string().datetime(),
	updated_at: z.string().datetime()
});

export type OntoEvent = z.infer<typeof OntoEventSchema>;

// ============================================
// VALIDATION HELPERS
// ============================================

// ============================================
// TYPE KEY VALIDATION PATTERNS
// ============================================

/**
 * Scope-specific type_key regex patterns
 * Based on the family-based taxonomy defined in TYPE_KEY_TAXONOMY.md
 */
export const TYPE_KEY_PATTERNS: Record<string, RegExp> = {
	project: /^project\.[a-z_]+\.[a-z_]+(\.[a-z_]+)?$/,
	task: /^task\.[a-z_]+(\.[a-z_]+)?$/,
	plan: /^plan\.[a-z_]+(\.[a-z_]+)?$/,
	goal: /^goal\.[a-z_]+(\.[a-z_]+)?$/,
	// Output supports both legacy output.* and new deliverable.* patterns
	output: /^(output|deliverable)\.[a-z_]+(\.[a-z_]+)?$/,
	// Deliverable-specific pattern: deliverable.{primitive}.{variant}
	deliverable: /^deliverable\.(document|event|collection|external)\.[a-z_]+$/,
	document: /^document\.[a-z_]+(\.[a-z_]+)?$/,
	risk: /^risk\.[a-z_]+(\.[a-z_]+)?$/,
	event: /^event\.[a-z_]+(\.[a-z_]+)?$/,
	requirement: /^requirement\.[a-z_]+(\.[a-z_]+)?$/
};

// ============================================
// DELIVERABLE PRIMITIVES
// ============================================

/**
 * Deliverable primitives - the fundamental types of outputs
 * - document: Text-based content editable in BuildOS (chapters, articles, etc.)
 * - event: Time-bound experiences (workshops, webinars, keynotes)
 * - collection: Multi-document containers (books, courses, email sequences)
 * - external: External artifacts tracked but not edited in BuildOS (Figma, GitHub, etc.)
 */
export const DELIVERABLE_PRIMITIVES = ['document', 'event', 'collection', 'external'] as const;
export type DeliverablePrimitive = (typeof DELIVERABLE_PRIMITIVES)[number];

/**
 * Extract the primitive from a deliverable type_key
 * @param typeKey - e.g., 'deliverable.document.chapter' → 'document'
 */
export function getDeliverablePrimitive(typeKey: string): DeliverablePrimitive | null {
	if (!typeKey.startsWith('deliverable.')) {
		// Handle legacy output.* patterns
		if (typeKey.startsWith('output.written.') || typeKey.startsWith('output.chapter')) {
			return 'document';
		}
		if (typeKey.startsWith('output.media.') || typeKey.startsWith('output.software.')) {
			return 'external';
		}
		return 'document'; // Default for legacy
	}

	const parts = typeKey.split('.');
	const primitive = parts[1] as DeliverablePrimitive;
	return DELIVERABLE_PRIMITIVES.includes(primitive) ? primitive : null;
}

/**
 * Check if a type_key represents a collection deliverable
 */
export function isCollectionDeliverable(typeKey: string): boolean {
	return getDeliverablePrimitive(typeKey) === 'collection';
}

/**
 * Check if a type_key represents an external deliverable
 */
export function isExternalDeliverable(typeKey: string): boolean {
	return getDeliverablePrimitive(typeKey) === 'external';
}

/**
 * Check if a type_key represents an event deliverable
 */
export function isEventDeliverable(typeKey: string): boolean {
	return getDeliverablePrimitive(typeKey) === 'event';
}

/**
 * Check if a type_key represents a document deliverable
 */
export function isDocumentDeliverable(typeKey: string): boolean {
	return getDeliverablePrimitive(typeKey) === 'document';
}

/** General type_key pattern (2-3 dot-separated lowercase segments) */
export const GENERAL_TYPE_KEY_PATTERN = /^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$/;

/**
 * Validate type_key format (lowercase dot-separated, 2-3 segments)
 * @param typeKey - The type_key to validate
 * @param scope - Optional scope for scope-specific validation
 */
export function isValidTypeKey(typeKey: string, scope?: string): boolean {
	if (scope && TYPE_KEY_PATTERNS[scope]) {
		return TYPE_KEY_PATTERNS[scope].test(typeKey);
	}
	return GENERAL_TYPE_KEY_PATTERN.test(typeKey);
}

/**
 * Extract family and variant from a type_key
 * Used for indexing and search faceting
 */
export function extractTypeKeyParts(typeKey: string): {
	scope: string;
	family: string;
	variant?: string;
} {
	const parts = typeKey.split('.');
	return {
		scope: parts[0],
		family: parts[1],
		variant: parts[2]
	};
}

/**
 * Validate FSM definition structure
 * Returns { valid: boolean, errors: string[] }
 * @deprecated FSM is no longer used. Use isValidState() instead.
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
