// apps/worker/src/workers/agentic-chat/mutationToolCatalog.ts
import type { BuildosAgentAllowedOp, JsonObject } from '@buildos/shared-types';

export type AgenticChatMutationCapabilityNameV1 =
	| 'createOntoDocument'
	| 'updateOntoDocument'
	| 'moveDocumentInTree'
	| 'createTaskDocument'
	| 'linkOntoEntities'
	| 'unlinkOntoEdge'
	| 'createOntoTask'
	| 'updateOntoTask'
	| 'createOntoGoal'
	| 'updateOntoGoal'
	| 'createOntoPlan'
	| 'updateOntoPlan'
	| 'createOntoMilestone'
	| 'updateOntoMilestone'
	| 'createOntoRisk'
	| 'updateOntoRisk';

export type AgenticChatProviderMutationCapabilitiesV1 = Record<
	AgenticChatMutationCapabilityNameV1,
	boolean
>;

export type AgenticChatReviewedMutationSpecV1 = {
	capability: AgenticChatMutationCapabilityNameV1;
	operationName: BuildosAgentAllowedOp;
	downstreamIdempotencySupported: boolean;
	requiredNames: readonly string[];
	reviewedArgumentNames: readonly string[];
	descriptionOverride?: string;
	propertyOverrides?: Readonly<Record<string, JsonObject>>;
};

/**
 * Single reviewed mutation catalog shared by provider projection, assembly
 * gating, and adapter boundaries. Entries are deliberately narrower than the
 * signed web tools when a legacy field crosses a compound relationship or
 * model-owned execution path.
 */
export const AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1 = {
	create_onto_document: {
		capability: 'createOntoDocument',
		operationName: 'onto.document.create',
		downstreamIdempotencySupported: false,
		requiredNames: ['project_id', 'title', 'description'],
		reviewedArgumentNames: [
			'project_id',
			'title',
			'description',
			'type_key',
			'state_key',
			'content',
			'parent_id',
			'position'
		]
	},
	update_onto_document: {
		capability: 'updateOntoDocument',
		operationName: 'onto.document.update',
		downstreamIdempotencySupported: false,
		requiredNames: ['document_id'],
		reviewedArgumentNames: [
			'document_id',
			'title',
			'type_key',
			'state_key',
			'content',
			'description',
			'update_strategy',
			'merge_instructions',
			'props'
		],
		propertyOverrides: {
			update_strategy: {
				type: 'string',
				enum: ['replace', 'append'],
				default: 'replace',
				description:
					"How to apply content: 'replace' (default) or 'append'. The web-owned merge_llm strategy is not available in the worker."
			}
		}
	},
	move_document_in_tree: {
		capability: 'moveDocumentInTree',
		operationName: 'onto.document.tree.move',
		downstreamIdempotencySupported: false,
		descriptionOverride:
			'Move an existing document to an exact location in the current project document tree. Use only document and parent UUIDs returned by tree/document reads. Omit or set new_parent_id to null for root placement. Parent-by-title creation is not available in the worker.',
		requiredNames: ['project_id', 'document_id'],
		reviewedArgumentNames: ['project_id', 'document_id', 'new_parent_id', 'new_position']
	},
	create_task_document: {
		capability: 'createTaskDocument',
		operationName: 'onto.task.docs.create_or_attach',
		downstreamIdempotencySupported: true,
		descriptionOverride:
			'Attach an existing document to a task workspace using exact task and document UUIDs from reads. This worker tool does not create a new document.',
		requiredNames: ['task_id', 'document_id'],
		reviewedArgumentNames: ['task_id', 'document_id', 'role']
	},
	link_onto_entities: {
		capability: 'linkOntoEntities',
		operationName: 'onto.edge.link',
		downstreamIdempotencySupported: false,
		descriptionOverride:
			'Create one relationship between two existing non-project ontology entities using exact UUIDs from reads. Project endpoints are not available in the worker. Relationship aliases are normalized to their canonical direction.',
		requiredNames: ['src_kind', 'src_id', 'dst_kind', 'dst_id', 'rel'],
		reviewedArgumentNames: ['src_kind', 'src_id', 'dst_kind', 'dst_id', 'rel', 'props'],
		propertyOverrides: {
			src_kind: {
				type: 'string',
				enum: ['plan', 'goal', 'milestone', 'task', 'document', 'risk', 'metric', 'source']
			},
			dst_kind: {
				type: 'string',
				enum: ['plan', 'goal', 'milestone', 'task', 'document', 'risk', 'metric', 'source']
			}
		}
	},
	unlink_onto_edge: {
		capability: 'unlinkOntoEdge',
		operationName: 'onto.edge.unlink',
		downstreamIdempotencySupported: false,
		descriptionOverride:
			'Remove one existing ontology relationship by the exact edge UUID returned by a project graph or relationship read.',
		requiredNames: ['edge_id'],
		reviewedArgumentNames: ['edge_id']
	},
	create_onto_task: {
		capability: 'createOntoTask',
		operationName: 'onto.task.create',
		downstreamIdempotencySupported: true,
		requiredNames: ['project_id', 'title'],
		reviewedArgumentNames: [
			'project_id',
			'title',
			'description',
			'type_key',
			'state_key',
			'priority',
			'assignee_actor_ids',
			'assignee_handles',
			'plan_id',
			'goal_id',
			'supporting_milestone_id',
			'parent',
			'start_at',
			'due_at',
			'props'
		]
	},
	update_onto_task: {
		capability: 'updateOntoTask',
		operationName: 'onto.task.update',
		downstreamIdempotencySupported: false,
		requiredNames: ['task_id'],
		reviewedArgumentNames: [
			'task_id',
			'project_id',
			'title',
			'description',
			'type_key',
			'state_key',
			'priority',
			'assignee_actor_ids',
			'assignee_handles',
			'goal_id',
			'supporting_milestone_id',
			'start_at',
			'due_at',
			'props'
		]
	},
	create_onto_goal: {
		capability: 'createOntoGoal',
		operationName: 'onto.goal.create',
		downstreamIdempotencySupported: false,
		requiredNames: ['project_id', 'name'],
		reviewedArgumentNames: [
			'project_id',
			'name',
			'description',
			'type_key',
			'state_key',
			'target_date',
			'measurement_criteria',
			'priority',
			'props'
		]
	},
	update_onto_goal: {
		capability: 'updateOntoGoal',
		operationName: 'onto.goal.update',
		downstreamIdempotencySupported: false,
		requiredNames: ['goal_id'],
		reviewedArgumentNames: [
			'goal_id',
			'name',
			'description',
			'type_key',
			'state_key',
			'priority',
			'target_date',
			'measurement_criteria',
			'props'
		]
	},
	create_onto_plan: {
		capability: 'createOntoPlan',
		operationName: 'onto.plan.create',
		downstreamIdempotencySupported: false,
		requiredNames: ['project_id', 'name'],
		reviewedArgumentNames: [
			'project_id',
			'name',
			'description',
			'plan',
			'type_key',
			'state_key',
			'start_date',
			'end_date',
			'props'
		]
	},
	update_onto_plan: {
		capability: 'updateOntoPlan',
		operationName: 'onto.plan.update',
		downstreamIdempotencySupported: false,
		requiredNames: ['plan_id'],
		reviewedArgumentNames: [
			'plan_id',
			'name',
			'description',
			'plan',
			'type_key',
			'start_date',
			'end_date',
			'state_key',
			'props'
		]
	},
	create_onto_milestone: {
		capability: 'createOntoMilestone',
		operationName: 'onto.milestone.create',
		downstreamIdempotencySupported: false,
		requiredNames: ['project_id', 'title', 'goal_id'],
		reviewedArgumentNames: [
			'project_id',
			'title',
			'goal_id',
			'due_at',
			'state_key',
			'description',
			'milestone'
		]
	},
	update_onto_milestone: {
		capability: 'updateOntoMilestone',
		operationName: 'onto.milestone.update',
		downstreamIdempotencySupported: false,
		requiredNames: ['milestone_id'],
		reviewedArgumentNames: [
			'milestone_id',
			'title',
			'due_at',
			'state_key',
			'description',
			'props'
		]
	},
	create_onto_risk: {
		capability: 'createOntoRisk',
		operationName: 'onto.risk.create',
		downstreamIdempotencySupported: false,
		requiredNames: ['project_id', 'title', 'impact'],
		reviewedArgumentNames: [
			'project_id',
			'title',
			'impact',
			'probability',
			'state_key',
			'content',
			'description',
			'mitigation_strategy'
		]
	},
	update_onto_risk: {
		capability: 'updateOntoRisk',
		operationName: 'onto.risk.update',
		downstreamIdempotencySupported: false,
		requiredNames: ['risk_id'],
		reviewedArgumentNames: [
			'risk_id',
			'title',
			'impact',
			'probability',
			'state_key',
			'content',
			'description',
			'mitigation_strategy',
			'owner',
			'props'
		]
	}
} as const satisfies Record<string, AgenticChatReviewedMutationSpecV1>;

export type AgenticChatReviewedMutationToolNameV1 =
	keyof typeof AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1;

export const AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1 = Object.freeze(
	Object.entries(AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1).map(
		([toolName, spec]) =>
			[spec.capability, toolName] as const satisfies readonly [
				AgenticChatMutationCapabilityNameV1,
				string
			]
	)
);

export function reviewedAgenticChatMutationSpecV1(
	toolName: string
): AgenticChatReviewedMutationSpecV1 | null {
	if (!Object.hasOwn(AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1, toolName)) return null;
	return AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1[
		toolName as AgenticChatReviewedMutationToolNameV1
	];
}

export function normalizeAgenticChatMutationCapabilitiesV1(
	input: Readonly<Partial<AgenticChatProviderMutationCapabilitiesV1>> | undefined
): AgenticChatProviderMutationCapabilitiesV1 {
	return Object.fromEntries(
		AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1.map(([capability]) => [
			capability,
			input?.[capability] === true
		])
	) as AgenticChatProviderMutationCapabilitiesV1;
}
