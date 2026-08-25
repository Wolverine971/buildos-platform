// apps/worker/src/workers/agentic-chat/mutationToolCatalog.ts
import {
	BUILDOS_AGENT_SUPPORTED_OPS,
	type BuildosAgentAllowedOp,
	type JsonObject
} from '@buildos/shared-types';
import { TOOL_METADATA } from '@buildos/agentic-chat-runtime/loop';

export type AgenticChatMutationCapabilityNameV1 =
	| 'createOntoDocument'
	| 'updateOntoDocument'
	| 'moveDocumentInTree'
	| 'createTaskDocument'
	| 'linkOntoEntities'
	| 'unlinkOntoEdge'
	| 'createOntoTask'
	| 'updateOntoTask'
	| 'moveOntoTask'
	| 'tagOntoEntity'
	| 'createOntoGoal'
	| 'updateOntoGoal'
	| 'createOntoPlan'
	| 'updateOntoPlan'
	| 'createOntoMilestone'
	| 'updateOntoMilestone'
	| 'createOntoRisk'
	| 'updateOntoRisk'
	| 'createOntoProject'
	| 'updateOntoProject';

export type AgenticChatProviderMutationCapabilitiesV1 = Record<
	AgenticChatMutationCapabilityNameV1,
	boolean
>;

export type AgenticChatMutationOperationNameV1 =
	| BuildosAgentAllowedOp
	| 'onto.task.move'
	| 'x.misc.tag_onto_entity';

const BUILDOS_AGENT_ALLOWED_OP_SET = new Set<string>(BUILDOS_AGENT_SUPPORTED_OPS);

export type AgenticChatReviewedMutationSpecV1 = {
	capability: AgenticChatMutationCapabilityNameV1;
	operationName: AgenticChatMutationOperationNameV1;
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
					"How to apply content: 'replace' (default) or 'append'. This tool does not support merge_llm."
			}
		}
	},
	move_document_in_tree: {
		capability: 'moveDocumentInTree',
		operationName: 'onto.document.tree.move',
		downstreamIdempotencySupported: false,
		descriptionOverride:
			'Move an existing document in the current project document tree. To group documents under a parent, prefer new_parent_title with a short category name (e.g. "Pricing", "Meeting notes"): the server reuses the existing document with that title or creates the parent, so grouping is one call per document with no parent UUID needed. Reuse the exact same new_parent_title for every document in a category. Pass new_parent_id only for a parent UUID returned by a tree/document read; never invent a UUID. Omit both for root placement.',
		requiredNames: ['project_id', 'document_id'],
		reviewedArgumentNames: [
			'project_id',
			'document_id',
			'new_parent_id',
			'new_parent_title',
			'new_position'
		]
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
	move_onto_task: {
		capability: 'moveOntoTask',
		operationName: 'onto.task.move',
		downstreamIdempotencySupported: false,
		descriptionOverride:
			'Move one standalone task from the focused source project to another writable project while preserving its ID, comments, and eligible assignees. Clean moves execute immediately. If relationships, project-local links, or incompatible assignees must be removed, the tool returns an exact impact preview and confirmation_token. Ask the user to confirm those effects, then call this tool in a later turn with that token. Never confirm or retry with the token in the same turn. Scheduled, recurring, asset-linked, and archived-destination moves are blocked.',
		requiredNames: ['task_id', 'expected_source_project_id', 'destination_project_id'],
		reviewedArgumentNames: [
			'task_id',
			'expected_source_project_id',
			'destination_project_id',
			'confirmation_token'
		],
		propertyOverrides: {
			confirmation_token: {
				type: 'string',
				minLength: 1,
				maxLength: 128,
				description:
					'Supply only after the user explicitly confirms the exact impact preview in a later turn.'
			}
		}
	},
	tag_onto_entity: {
		capability: 'tagOntoEntity',
		operationName: 'x.misc.tag_onto_entity',
		downstreamIdempotencySupported: false,
		descriptionOverride:
			'Send one explicit notification-only tag to active members of the focused project. Use exact user UUIDs returned by project-member reads and always pass mode "ping". This worker tool never edits entity content and does not resolve @handles.',
		requiredNames: ['project_id', 'entity_type', 'entity_id', 'mode', 'mentioned_user_ids'],
		reviewedArgumentNames: [
			'project_id',
			'entity_type',
			'entity_id',
			'mode',
			'mentioned_user_ids',
			'message'
		],
		propertyOverrides: {
			project_id: {
				type: 'string',
				pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
			},
			entity_type: { type: 'string', enum: ['task', 'goal', 'document'] },
			entity_id: {
				type: 'string',
				pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
			},
			mode: {
				type: 'string',
				enum: ['ping'],
				default: 'ping',
				description:
					'Must be "ping". This tool notifies mentioned users without editing content.'
			},
			mentioned_user_ids: {
				type: 'array',
				minItems: 1,
				maxItems: 25,
				uniqueItems: true,
				items: {
					type: 'string',
					pattern:
						'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
				}
			},
			message: { type: 'string', maxLength: 280 }
		}
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
	},
	create_onto_project: {
		capability: 'createOntoProject',
		operationName: 'onto.project.create',
		downstreamIdempotencySupported: false,
		descriptionOverride:
			'Create one standard project and its generated Context document. Pass empty entities and relationships arrays. After it returns project_id, create requested goals or tasks only with the available tools. This tool does not support fiction/living-reference projects, custom Context documents, clarifications, embedded child records, or relationships.',
		requiredNames: ['project', 'entities', 'relationships'],
		reviewedArgumentNames: ['project', 'entities', 'relationships'],
		propertyOverrides: {
			project: {
				type: 'object',
				additionalProperties: false,
				description: 'Project fields.',
				properties: {
					name: { type: 'string', minLength: 1, description: 'Project name.' },
					type_key: {
						type: 'string',
						pattern: '^project\\.[a-z_]+\\.[a-z_]+(?:\\.[a-z_]+)?$',
						description:
							'Use project.{realm}.{domain}[.{variant}]. This tool does not support fiction/living-reference projects.'
					},
					description: { type: 'string', description: 'Optional project description.' },
					state_key: {
						type: 'string',
						enum: ['planning', 'active', 'paused', 'completed', 'cancelled'],
						description: 'Initial project status.'
					},
					props: {
						type: 'object',
						additionalProperties: false,
						properties: {
							facets: {
								type: 'object',
								additionalProperties: false,
								properties: {
									context: {
										type: 'string',
										enum: [
											'personal',
											'client',
											'commercial',
											'internal',
											'open_source',
											'community',
											'academic',
											'nonprofit',
											'startup'
										]
									},
									scale: {
										type: 'string',
										enum: ['micro', 'small', 'medium', 'large', 'epic']
									},
									stage: {
										type: 'string',
										enum: [
											'discovery',
											'planning',
											'execution',
											'launch',
											'maintenance',
											'complete'
										]
									}
								}
							}
						}
					},
					start_at: { type: 'string', description: 'Optional ISO start date.' },
					end_at: { type: 'string', description: 'Optional ISO end date.' }
				},
				required: ['name', 'type_key']
			},
			entities: {
				type: 'array',
				maxItems: 0,
				description:
					'Must be empty. After create_onto_project returns project_id, create requested goals or tasks only when their tools are available.'
			},
			relationships: {
				type: 'array',
				maxItems: 0,
				// Replace any item schema captured in an older immutable web artifact.
				// The reviewed worker path admits no relationship items, so retaining a
				// historical union only adds misleading provider guidance.
				items: {
					type: 'object',
					additionalProperties: false
				},
				description:
					'Must be empty. This project-creation tool does not create relationships.'
			}
		}
	},
	update_onto_project: {
		capability: 'updateOntoProject',
		operationName: 'onto.project.update',
		downstreamIdempotencySupported: false,
		requiredNames: ['project_id'],
		reviewedArgumentNames: [
			'project_id',
			'name',
			'description',
			'state_key',
			'start_at',
			'end_at',
			'props'
		]
	}
} as const satisfies Record<string, AgenticChatReviewedMutationSpecV1>;

export type AgenticChatReviewedMutationToolNameV1 =
	keyof typeof AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1;

export type AgenticChatDeferredMutationReasonV1 =
	| 'browser_user_action_handoff'
	| 'calendar_provider_reconciliation'
	| 'compound_partial_commit'
	| 'control_plane_effect_mapping'
	| 'irreversible_delete_without_tombstone'
	| 'opaque_external_mutation'
	| 'sensitive_contact_reconciliation';

/**
 * Explicit P2 boundary for signed writes that are not worker-admitted. Keeping
 * this beside the reviewed catalog turns the 39/20/19 inventory into a
 * fail-closed executable contract: a newly signed write must be reviewed or
 * deliberately deferred before the worker can start.
 */
export const AGENTIC_CHAT_DEFERRED_MUTATION_TOOLS_V1 = Object.freeze({
	call_corsair_mcp_tool: 'opaque_external_mutation',
	commit_change_set: 'compound_partial_commit',
	create_calendar_event: 'calendar_provider_reconciliation',
	delegate_task: 'control_plane_effect_mapping',
	delete_calendar_event: 'irreversible_delete_without_tombstone',
	delete_onto_document: 'irreversible_delete_without_tombstone',
	delete_onto_goal: 'irreversible_delete_without_tombstone',
	delete_onto_milestone: 'irreversible_delete_without_tombstone',
	delete_onto_plan: 'irreversible_delete_without_tombstone',
	delete_onto_project: 'irreversible_delete_without_tombstone',
	delete_onto_risk: 'irreversible_delete_without_tombstone',
	delete_onto_task: 'irreversible_delete_without_tombstone',
	link_user_contact: 'sensitive_contact_reconciliation',
	reorganize_onto_project_graph: 'compound_partial_commit',
	request_email_account_connection: 'browser_user_action_handoff',
	resolve_user_contact_candidate: 'sensitive_contact_reconciliation',
	set_project_calendar: 'calendar_provider_reconciliation',
	update_calendar_event: 'calendar_provider_reconciliation',
	upsert_user_contact: 'sensitive_contact_reconciliation'
} as const satisfies Record<string, AgenticChatDeferredMutationReasonV1>);

export type AgenticChatMutationSurfaceAuditV1 = {
	signedToolNames: readonly string[];
	reviewedToolNames: readonly AgenticChatReviewedMutationToolNameV1[];
	deferredToolNames: readonly string[];
};

export function auditAgenticChatMutationSurfaceV1(): AgenticChatMutationSurfaceAuditV1 {
	const signedToolNames = Object.entries(TOOL_METADATA)
		.filter(([, metadata]) => metadata.category === 'write')
		.map(([toolName]) => toolName)
		.sort();
	const reviewedToolNames = (
		Object.keys(
			AGENTIC_CHAT_REVIEWED_MUTATION_SPECS_V1
		) as AgenticChatReviewedMutationToolNameV1[]
	).sort();
	const deferredToolNames = Object.keys(AGENTIC_CHAT_DEFERRED_MUTATION_TOOLS_V1).sort();
	const deferred = new Set<string>(deferredToolNames);
	const overlap = reviewedToolNames.filter((toolName) => deferred.has(toolName));
	const declaredToolNames = [...reviewedToolNames, ...deferredToolNames].sort();
	const signed = new Set(signedToolNames);
	const declared = new Set(declaredToolNames);
	const missingPolicy = signedToolNames.filter((toolName) => !declared.has(toolName));
	const noLongerSigned = declaredToolNames.filter((toolName) => !signed.has(toolName));

	if (overlap.length > 0 || missingPolicy.length > 0 || noLongerSigned.length > 0) {
		throw new Error(
			`Agentic Chat mutation surface policy drift: overlap=${overlap.join(',') || 'none'}; missing_policy=${missingPolicy.join(',') || 'none'}; no_longer_signed=${noLongerSigned.join(',') || 'none'}`
		);
	}

	return Object.freeze({
		signedToolNames: Object.freeze(signedToolNames),
		reviewedToolNames: Object.freeze(reviewedToolNames),
		deferredToolNames: Object.freeze(deferredToolNames)
	});
}

export const AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1 = auditAgenticChatMutationSurfaceV1();

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

export type AgenticChatGatewayMutationSpecV1 = Omit<
	AgenticChatReviewedMutationSpecV1,
	'operationName'
> & { operationName: BuildosAgentAllowedOp };

/**
 * Return only specs implemented by the shared external-op gateway. Worker-only
 * extracted operations must not leak into an external caller's allowed-op set.
 */
export function reviewedAgenticChatGatewayMutationSpecV1(
	toolName: string
): AgenticChatGatewayMutationSpecV1 | null {
	const spec = reviewedAgenticChatMutationSpecV1(toolName);
	if (!spec || !isBuildosAgentAllowedOp(spec.operationName)) return null;
	return { ...spec, operationName: spec.operationName };
}

function isBuildosAgentAllowedOp(value: string): value is BuildosAgentAllowedOp {
	return BUILDOS_AGENT_ALLOWED_OP_SET.has(value);
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
