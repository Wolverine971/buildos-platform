// apps/web/src/lib/services/ontology/instantiation.service.ts
import {
	ProjectSpecSchema,
	validateProjectSpec as validateProjectSpecStruct,
	type FacetDefaults,
	type Facets,
	type FSMDef,
	type GoalState,
	type MilestoneState,
	type TaskState,
	type RiskState,
	type DecisionState,
	type ProjectState,
	type DocumentState,
	type PlanState,
	type OutputState,
	type ProjectSpec,
	GOAL_STATES,
	MILESTONE_STATES,
	TASK_STATES,
	RISK_STATES,
	DECISION_STATES
} from '$lib/types/onto';
import type { Json, ProjectLogEntityType } from '@buildos/shared-types';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { logActivitiesAsync } from '$lib/services/async-activity-logger';
import { autoOrganizeConnections } from '$lib/services/ontology/auto-organizer.service';
import {
	DEPRECATED_RELATIONSHIPS,
	RELATIONSHIP_DIRECTIONS,
	type EntityKind,
	type RelationshipType
} from '$lib/services/ontology/edge-direction';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';
import {
	getAllowedParents,
	isContainmentRel,
	TASK_DISALLOWS_PROJECT_FALLBACK_KINDS
} from '$lib/services/ontology/relationship-policy';

type InstantiationCounts = {
	goals: number;
	requirements: number;
	plans: number;
	tasks: number;
	outputs: number;
	documents: number;
	sources: number;
	metrics: number;
	milestones: number;
	risks: number;
	decisions: number;
	edges: number;
};

type EdgeInsert = {
	project_id: string;
	src_kind: string;
	src_id: string;
	rel: string;
	dst_kind: string;
	dst_id: string;
	props?: Json;
};

type InsertedEntities = {
	projectId?: string;
	goals: string[];
	requirements: string[];
	plans: string[];
	tasks: string[];
	outputs: string[];
	documents: string[];
	sources: string[];
	metrics: string[];
	milestones: string[];
	risks: string[];
	decisions: string[];
	edges: string[];
};

const PROJECT_STATE_MAP: Record<string, ProjectState> = {
	planning: 'planning',
	active: 'active',
	completed: 'completed',
	cancelled: 'cancelled',
	draft: 'planning',
	complete: 'completed',
	archived: 'cancelled',
	paused: 'active'
};

const DOCUMENT_STATE_MAP: Record<string, DocumentState> = {
	draft: 'draft',
	review: 'in_review',
	in_review: 'in_review',
	ready: 'ready',
	published: 'published',
	archived: 'archived',
	active: 'draft',
	complete: 'published',
	completed: 'published'
};

const PLAN_STATE_MAP: Record<string, PlanState> = {
	draft: 'draft',
	planning: 'draft',
	active: 'active',
	execution: 'active',
	blocked: 'active',
	completed: 'completed',
	complete: 'completed',
	done: 'completed'
};

const OUTPUT_STATE_MAP: Record<string, OutputState> = {
	draft: 'draft',
	in_progress: 'in_progress',
	active: 'in_progress',
	review: 'review',
	published: 'published',
	complete: 'published',
	completed: 'published',
	approved: 'published'
};

const DEFAULT_GOAL_STATE: GoalState = 'draft';
const DEFAULT_MILESTONE_STATE: MilestoneState = 'pending';
const DEFAULT_TASK_STATE: TaskState = 'todo';
const DEFAULT_RISK_STATE: RiskState = 'identified';
const DEFAULT_DECISION_STATE: DecisionState = 'pending';

const INITIAL_COUNTS: InstantiationCounts = {
	goals: 0,
	requirements: 0,
	plans: 0,
	tasks: 0,
	outputs: 0,
	documents: 0,
	sources: 0,
	metrics: 0,
	milestones: 0,
	risks: 0,
	decisions: 0,
	edges: 0
};

function normalizeStateKey<T extends string>(
	raw: string | undefined,
	allowed: readonly T[],
	fallback: T
): T {
	if (!raw) return fallback;
	const normalized = raw.trim().toLowerCase();
	return allowed.includes(normalized as T) ? (normalized as T) : fallback;
}

function normalizeRelationshipType(rel?: string): RelationshipType | undefined {
	if (!rel) return undefined;
	if (rel in RELATIONSHIP_DIRECTIONS) {
		return rel as RelationshipType;
	}
	const deprecated = DEPRECATED_RELATIONSHIPS[rel];
	return deprecated?.canonical;
}

function getEntityKey(entity: { kind: EntityKind; id: string }): string {
	return `${entity.kind}:${entity.id}`;
}

function shouldSkipContainmentForEntity(kind: EntityKind, connections: ConnectionRef[]): boolean {
	if (kind === 'document') {
		return !connections.some((connection) => connection.kind === 'document');
	}
	if (kind === 'output') {
		return true;
	}
	return false;
}

type DocumentInsertSpec = {
	title: string;
	type_key: string;
	state_key?: string;
	props?: Record<string, unknown>;
	body_markdown?: string;
	description?: string | null;
};

async function insertDocument(
	client: TypedSupabaseClient,
	projectId: string,
	actorId: string,
	spec: DocumentInsertSpec
): Promise<string> {
	const normalizedState: DocumentState =
		DOCUMENT_STATE_MAP[spec.state_key?.trim().toLowerCase() ?? 'draft'] ?? 'draft';

	const props: Record<string, unknown> = {
		...(spec.props ?? {})
	};

	// Store body_markdown in props for backwards compatibility during migration
	if (spec.body_markdown) {
		props.body_markdown = spec.body_markdown;
	}

	const { data, error } = await client
		.from('onto_documents')
		.insert({
			project_id: projectId,
			title: spec.title,
			type_key: spec.type_key,
			state_key: normalizedState,
			description: spec.description ?? null,
			// Use new content column
			content: spec.body_markdown ?? null,
			props: props as Json,
			created_by: actorId
		})
		.select('id')
		.single();

	if (error || !data) {
		throw new OntologyInstantiationError(
			`Failed to insert document "${spec.title}": ${error?.message ?? 'Unknown error'}`
		);
	}

	return data.id;
}

export class OntologyInstantiationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'OntologyInstantiationError';
	}
}

/**
 * Instantiate a project graph from a ProjectSpec
 */
export async function instantiateProject(
	client: TypedSupabaseClient,
	spec: ProjectSpec,
	userId: string
): Promise<{ project_id: string; counts: InstantiationCounts }> {
	// Double-validate to ensure service can be called directly (tests, scripts)
	const validation = validateProjectSpecStruct(spec);
	if (!validation.valid) {
		throw new OntologyInstantiationError(
			`ProjectSpec failed validation: ${validation.errors.join(', ')}`
		);
	}

	const parsed = ProjectSpecSchema.parse(spec);

	const inserted: InsertedEntities = {
		goals: [],
		requirements: [],
		plans: [],
		tasks: [],
		outputs: [],
		documents: [],
		sources: [],
		metrics: [],
		milestones: [],
		risks: [],
		decisions: [],
		edges: []
	};

	const counts: InstantiationCounts = { ...INITIAL_COUNTS };

	const actorId = await ensureActorExists(client, userId);

	const resolvedProjectFacets = resolveFacets(
		undefined,
		(parsed.project.props?.facets as Facets | undefined) ?? undefined
	);

	await assertValidFacets(client, resolvedProjectFacets, 'project', 'project');

	const mergedProjectProps = mergeProps(parsed.project.props ?? {});

	if (hasFacetValues(resolvedProjectFacets)) {
		mergedProjectProps.facets = resolvedProjectFacets;
	} else {
		delete mergedProjectProps.facets;
	}

	const projectState: ProjectState =
		PROJECT_STATE_MAP[parsed.project.state_key?.trim().toLowerCase() ?? 'planning'] ??
		'planning';

	const edgesToInsert: EdgeInsert[] = [];

	let projectId: string | undefined;
	try {
		// Insert project first
		const { data: projectRows, error: projectError } = await client
			.from('onto_projects')
			.insert({
				name: parsed.project.name,
				description: parsed.project.description ?? null,
				type_key: parsed.project.type_key,
				state_key: projectState,
				props: mergedProjectProps as Json,
				start_at: parsed.project.start_at ?? null,
				end_at: parsed.project.end_at ?? null,
				created_by: actorId
			})
			.select('id')
			.single();

		if (projectError || !projectRows) {
			throw new OntologyInstantiationError(
				`Failed to create project: ${projectError?.message ?? 'Unknown error'}`
			);
		}

		projectId = projectRows.id;
		inserted.projectId = projectId;

		// Type guard: Ensure projectId is string for all subsequent operations
		if (!projectId) {
			throw new OntologyInstantiationError('Project ID is required but was not set');
		}

		// Create typed constant for type-safe operations (TypeScript narrowing doesn't flow into closures)
		const typedProjectId: string = projectId;

		if (parsed.context_document) {
			const contextDocId = await insertDocument(client, typedProjectId, actorId, {
				title: parsed.context_document.title,
				type_key: parsed.context_document.type_key ?? 'document.context.project',
				state_key: parsed.context_document.state_key ?? 'active',
				body_markdown: parsed.context_document.body_markdown,
				props: parsed.context_document.props ?? {}
			});

			inserted.documents.push(contextDocId);
			counts.documents += 1;

			// Use has_context_document edge to link the context document
			edgesToInsert.push({
				project_id: typedProjectId,
				src_kind: 'project',
				src_id: projectId,
				rel: 'has_context_document',
				dst_kind: 'document',
				dst_id: contextDocId
			});
		}

		const entityIdByTempId = new Map<string, { kind: EntityKind; id: string }>();

		for (const entity of parsed.entities) {
			if (entityIdByTempId.has(entity.temp_id)) {
				throw new OntologyInstantiationError(
					`Duplicate temp_id "${entity.temp_id}" in entities list`
				);
			}

			switch (entity.kind) {
				case 'goal': {
					const normalizedState = normalizeStateKey(
						entity.state_key,
						GOAL_STATES,
						DEFAULT_GOAL_STATE
					);

					const goalProps = mergeProps(entity.props ?? {}, {
						description: entity.description ?? null,
						target_date: entity.target_date ?? null,
						measurement_criteria: entity.measurement_criteria ?? null,
						priority: entity.priority ?? null
					});

					const { data, error } = await client
						.from('onto_goals')
						.insert({
							project_id: typedProjectId,
							name: entity.name,
							type_key: entity.type_key ?? 'goal.default',
							description: entity.description ?? null,
							target_date: entity.target_date ?? null,
							state_key: normalizedState,
							props: goalProps as Json,
							created_by: actorId
						})
						.select('id')
						.single();

					if (error || !data) {
						throw new OntologyInstantiationError(
							`Failed to insert goal "${entity.name}": ${error?.message ?? 'Unknown error'}`
						);
					}

					entityIdByTempId.set(entity.temp_id, { kind: 'goal', id: data.id });
					inserted.goals.push(data.id);
					counts.goals += 1;
					break;
				}
				case 'milestone': {
					const normalizedState = normalizeStateKey(
						entity.state_key,
						MILESTONE_STATES,
						DEFAULT_MILESTONE_STATE
					);

					const milestoneProps = mergeProps(entity.props ?? {}, {
						description: entity.description ?? null
					});

					const { data, error } = await client
						.from('onto_milestones')
						.insert({
							project_id: typedProjectId,
							title: entity.title,
							type_key: entity.type_key ?? 'milestone.default',
							due_at: entity.due_at,
							description: entity.description ?? null,
							state_key: normalizedState,
							props: milestoneProps as Json,
							created_by: actorId
						})
						.select('id')
						.single();

					if (error || !data) {
						throw new OntologyInstantiationError(
							`Failed to insert milestone "${entity.title}": ${error?.message ?? 'Unknown error'}`
						);
					}

					entityIdByTempId.set(entity.temp_id, { kind: 'milestone', id: data.id });
					inserted.milestones.push(data.id);
					counts.milestones += 1;
					break;
				}
				case 'plan': {
					const normalizedPlanState: PlanState =
						PLAN_STATE_MAP[entity.state_key?.trim().toLowerCase() ?? 'draft'] ??
						'draft';

					const resolvedPlanFacets = resolveFacets(
						undefined,
						(entity.props?.facets as Facets | undefined) ?? undefined
					);
					await assertValidFacets(
						client,
						resolvedPlanFacets,
						'plan',
						`plan "${entity.name}"`
					);

					const mergedPlanProps = mergeProps(entity.props ?? {}, {
						description: entity.description ?? null,
						start_date: entity.start_date ?? null,
						end_date: entity.end_date ?? null
					});
					if (hasFacetValues(resolvedPlanFacets)) {
						mergedPlanProps.facets = resolvedPlanFacets;
					} else {
						delete mergedPlanProps.facets;
					}

					const { data, error } = await client
						.from('onto_plans')
						.insert({
							project_id: typedProjectId,
							name: entity.name,
							type_key: entity.type_key ?? 'plan.default',
							state_key: normalizedPlanState,
							description: entity.description ?? null,
							props: mergedPlanProps as Json,
							created_by: actorId
						})
						.select('id')
						.single();

					if (error || !data) {
						throw new OntologyInstantiationError(
							`Failed to insert plan "${entity.name}": ${error?.message ?? 'Unknown error'}`
						);
					}

					entityIdByTempId.set(entity.temp_id, { kind: 'plan', id: data.id });
					inserted.plans.push(data.id);
					counts.plans += 1;
					break;
				}
				case 'task': {
					const normalizedState = normalizeStateKey(
						entity.state_key,
						TASK_STATES,
						DEFAULT_TASK_STATE
					);

					const resolvedTaskFacets = resolveFacets(
						undefined,
						(entity.props?.facets as Facets | undefined) ?? undefined
					);
					await assertValidFacets(
						client,
						resolvedTaskFacets,
						'task',
						`task "${entity.title}"`
					);

					const mergedTaskProps = mergeProps(entity.props ?? {}, {
						description: entity.description ?? null
					});
					if (hasFacetValues(resolvedTaskFacets)) {
						mergedTaskProps.facets = resolvedTaskFacets;
					} else {
						delete mergedTaskProps.facets;
					}

					const { data, error } = await client
						.from('onto_tasks')
						.insert({
							project_id: typedProjectId,
							title: entity.title,
							type_key: entity.type_key ?? 'task.default',
							state_key: normalizedState,
							priority: entity.priority ?? null,
							start_at: entity.start_at ?? null,
							due_at: entity.due_at ?? null,
							description: entity.description ?? null,
							props: mergedTaskProps as Json,
							created_by: actorId
						})
						.select('id')
						.single();

					if (error || !data) {
						throw new OntologyInstantiationError(
							`Failed to insert task "${entity.title}": ${error?.message ?? 'Unknown error'}`
						);
					}

					entityIdByTempId.set(entity.temp_id, { kind: 'task', id: data.id });
					inserted.tasks.push(data.id);
					counts.tasks += 1;
					break;
				}
				case 'document': {
					const normalizedState: DocumentState =
						DOCUMENT_STATE_MAP[entity.state_key?.trim().toLowerCase() ?? 'draft'] ??
						'draft';
					const body_markdown =
						entity.body_markdown ?? (entity as { content?: string }).content;

					const docId = await insertDocument(client, typedProjectId, actorId, {
						title: entity.title,
						type_key: entity.type_key ?? 'document.default',
						state_key: normalizedState,
						body_markdown,
						description: entity.description ?? null,
						props: entity.props ?? {}
					});

					entityIdByTempId.set(entity.temp_id, { kind: 'document', id: docId });
					inserted.documents.push(docId);
					counts.documents += 1;
					break;
				}
				case 'output': {
					const normalizedOutputState: OutputState =
						OUTPUT_STATE_MAP[entity.state_key?.trim().toLowerCase() ?? 'draft'] ??
						'draft';

					const resolvedOutputFacets = resolveFacets(
						undefined,
						(entity.props?.facets as Facets | undefined) ?? undefined
					);
					await assertValidFacets(
						client,
						resolvedOutputFacets,
						'output',
						`output "${entity.name}"`
					);

					const mergedOutputProps = mergeProps(entity.props ?? {});
					if (hasFacetValues(resolvedOutputFacets)) {
						mergedOutputProps.facets = resolvedOutputFacets;
					} else {
						delete mergedOutputProps.facets;
					}

					const { data, error } = await client
						.from('onto_outputs')
						.insert({
							project_id: typedProjectId,
							name: entity.name,
							type_key: entity.type_key ?? 'output.default',
							state_key: normalizedOutputState,
							description: entity.description ?? null,
							props: mergedOutputProps as Json,
							created_by: actorId
						})
						.select('id')
						.single();

					if (error || !data) {
						throw new OntologyInstantiationError(
							`Failed to insert output "${entity.name}": ${error?.message ?? 'Unknown error'}`
						);
					}

					entityIdByTempId.set(entity.temp_id, { kind: 'output', id: data.id });
					inserted.outputs.push(data.id);
					counts.outputs += 1;
					break;
				}
				case 'risk': {
					const normalizedState = normalizeStateKey(
						entity.state_key,
						RISK_STATES,
						DEFAULT_RISK_STATE
					);

					const riskProps = mergeProps(entity.props ?? {});

					const { data, error } = await client
						.from('onto_risks')
						.insert({
							project_id: typedProjectId,
							title: entity.title,
							type_key: entity.type_key ?? 'risk.default',
							probability: entity.probability ?? null,
							impact: entity.impact ?? 'medium',
							state_key: normalizedState,
							content: entity.content ?? null,
							props: riskProps as Json,
							created_by: actorId
						})
						.select('id')
						.single();

					if (error || !data) {
						throw new OntologyInstantiationError(
							`Failed to insert risk "${entity.title}": ${error?.message ?? 'Unknown error'}`
						);
					}

					entityIdByTempId.set(entity.temp_id, { kind: 'risk', id: data.id });
					inserted.risks.push(data.id);
					counts.risks += 1;
					break;
				}
				case 'decision': {
					const normalizedState = normalizeStateKey(
						entity.state_key,
						DECISION_STATES,
						DEFAULT_DECISION_STATE
					);

					const decisionProps = mergeProps(entity.props ?? {});

					const { data, error } = await client
						.from('onto_decisions')
						.insert({
							project_id: typedProjectId,
							title: entity.title,
							type_key: entity.type_key ?? 'decision.default',
							state_key: normalizedState,
							decision_at: entity.decision_at ?? null,
							rationale: entity.rationale ?? null,
							outcome: entity.outcome ?? null,
							props: decisionProps as Json,
							created_by: actorId
						})
						.select('id')
						.single();

					if (error || !data) {
						throw new OntologyInstantiationError(
							`Failed to insert decision "${entity.title}": ${error?.message ?? 'Unknown error'}`
						);
					}

					entityIdByTempId.set(entity.temp_id, { kind: 'decision', id: data.id });
					inserted.decisions.push(data.id);
					counts.decisions += 1;
					break;
				}
				case 'requirement': {
					const requirementProps = mergeProps(entity.props ?? {});

					const { data, error } = await client
						.from('onto_requirements')
						.insert({
							project_id: typedProjectId,
							text: entity.text,
							type_key: entity.type_key ?? 'requirement.general',
							props: requirementProps as Json,
							created_by: actorId
						})
						.select('id')
						.single();

					if (error || !data) {
						throw new OntologyInstantiationError(
							`Failed to insert requirement "${entity.text}": ${error?.message ?? 'Unknown error'}`
						);
					}

					entityIdByTempId.set(entity.temp_id, { kind: 'requirement', id: data.id });
					inserted.requirements.push(data.id);
					counts.requirements += 1;
					break;
				}
				case 'metric': {
					const metricProps = mergeProps(entity.props ?? {}, {
						target_value: entity.target_value ?? null
					});

					const { data, error } = await client
						.from('onto_metrics')
						.insert({
							project_id: typedProjectId,
							name: entity.name,
							unit: entity.unit,
							type_key: entity.type_key ?? null,
							definition: entity.definition ?? null,
							props: metricProps as Json,
							created_by: actorId
						})
						.select('id')
						.single();

					if (error || !data) {
						throw new OntologyInstantiationError(
							`Failed to insert metric "${entity.name}": ${error?.message ?? 'Unknown error'}`
						);
					}

					entityIdByTempId.set(entity.temp_id, { kind: 'metric', id: data.id });
					inserted.metrics.push(data.id);
					counts.metrics += 1;
					break;
				}
				case 'source': {
					const sourceProps = mergeProps(entity.props ?? {}, {
						name: entity.name ?? null
					});

					const { data, error } = await client
						.from('onto_sources')
						.insert({
							project_id: typedProjectId,
							uri: entity.uri,
							snapshot_uri: entity.snapshot_uri ?? null,
							props: sourceProps as Json,
							created_by: actorId
						})
						.select('id')
						.single();

					if (error || !data) {
						throw new OntologyInstantiationError(
							`Failed to insert source "${entity.uri}": ${error?.message ?? 'Unknown error'}`
						);
					}

					entityIdByTempId.set(entity.temp_id, { kind: 'source', id: data.id });
					inserted.sources.push(data.id);
					counts.sources += 1;
					break;
				}
				default: {
					const exhaustiveCheck: never = entity;
					throw new OntologyInstantiationError(
						`Unsupported entity kind: ${String(exhaustiveCheck)}`
					);
				}
			}
		}

		const connectionsByEntityKey = new Map<string, ConnectionRef[]>();
		const incomingContainmentKeys = new Set<string>();
		const taskStructuralKeys = new Set<string>();
		const relationships = parsed.relationships;

		for (const relation of relationships) {
			const normalized = Array.isArray(relation)
				? { from: relation[0], to: relation[1] }
				: relation;

			const relValue = !Array.isArray(relation) ? relation.rel : undefined;
			const relProvided = typeof relValue === 'string' && relValue.trim().length > 0;
			const normalizedRel = relProvided ? normalizeRelationshipType(relValue) : undefined;
			const hasInvalidRel = relProvided && !normalizedRel;

			const fromEntity = entityIdByTempId.get(normalized.from.temp_id);
			const toEntity = entityIdByTempId.get(normalized.to.temp_id);

			if (!fromEntity) {
				throw new OntologyInstantiationError(
					`Unknown relationship temp_id "${normalized.from.temp_id}"`
				);
			}
			if (!toEntity) {
				throw new OntologyInstantiationError(
					`Unknown relationship temp_id "${normalized.to.temp_id}"`
				);
			}
			if (fromEntity.kind !== normalized.from.kind) {
				throw new OntologyInstantiationError(
					`Relationship from kind mismatch for temp_id "${normalized.from.temp_id}"`
				);
			}
			if (toEntity.kind !== normalized.to.kind) {
				throw new OntologyInstantiationError(
					`Relationship to kind mismatch for temp_id "${normalized.to.temp_id}"`
				);
			}

			const fromKey = getEntityKey(fromEntity);
			const toKey = getEntityKey(toEntity);
			if (
				fromEntity.kind === 'task' &&
				TASK_DISALLOWS_PROJECT_FALLBACK_KINDS.has(toEntity.kind)
			) {
				taskStructuralKeys.add(fromKey);
			}
			if (
				toEntity.kind === 'task' &&
				TASK_DISALLOWS_PROJECT_FALLBACK_KINDS.has(fromEntity.kind)
			) {
				taskStructuralKeys.add(toKey);
			}

			const isExplicitSemantic =
				!Array.isArray(relation) &&
				(relation.intent === 'semantic' ||
					(relProvided && (!normalizedRel || !isContainmentRel(normalizedRel))));

			if (!isExplicitSemantic) {
				const allowedParents = getAllowedParents(toEntity.kind);
				if (allowedParents.includes(fromEntity.kind)) {
					incomingContainmentKeys.add(toKey);
				}
			}

			const list = connectionsByEntityKey.get(fromKey) ?? [];
			const connection: ConnectionRef = {
				kind: toEntity.kind,
				id: toEntity.id
			};

			if (!Array.isArray(relation)) {
				if (normalizedRel) {
					connection.rel = normalizedRel;
				}
				if (relation.intent) {
					connection.intent = relation.intent;
				}
			}
			if (!hasInvalidRel) {
				list.push(connection);
				connectionsByEntityKey.set(fromKey, list);
			}
		}

		for (const entity of parsed.entities) {
			const created = entityIdByTempId.get(entity.temp_id);
			if (!created) continue;
			const key = getEntityKey(created);
			const connections = connectionsByEntityKey.get(key) ?? [];
			const skipContainment = shouldSkipContainmentForEntity(created.kind, connections);
			const hasIncomingParent = incomingContainmentKeys.has(key);
			const mode = hasIncomingParent ? 'merge' : connections.length > 0 ? 'replace' : 'merge';
			const allowProjectFallback =
				created.kind === 'task' && taskStructuralKeys.has(key) ? false : undefined;

			await autoOrganizeConnections({
				supabase: client as any,
				projectId: typedProjectId,
				entity: created,
				connections,
				options: {
					mode,
					skipContainment,
					allowProjectFallback
				}
			});
		}

		if (edgesToInsert.length > 0) {
			const { data: edgeRows, error: edgesError } = await client
				.from('onto_edges')
				.insert(edgesToInsert)
				.select('id');

			if (edgesError) {
				throw new OntologyInstantiationError(
					`Failed to insert edges: ${edgesError.message}`
				);
			}

			for (const row of edgeRows ?? []) {
				inserted.edges.push(row.id);
			}
		}

		const { count: edgeCount } = await client
			.from('onto_edges')
			.select('id', { count: 'exact', head: true })
			.eq('project_id', typedProjectId);
		if (typeof edgeCount === 'number') {
			counts.edges = edgeCount;
		}

		const activityLogs = [
			{ entityType: 'project', ids: [typedProjectId] },
			{ entityType: 'goal', ids: inserted.goals },
			{ entityType: 'requirement', ids: inserted.requirements },
			{ entityType: 'plan', ids: inserted.plans },
			{ entityType: 'task', ids: inserted.tasks },
			{ entityType: 'output', ids: inserted.outputs },
			{ entityType: 'document', ids: inserted.documents },
			{ entityType: 'source', ids: inserted.sources },
			{ entityType: 'metric', ids: inserted.metrics },
			{ entityType: 'milestone', ids: inserted.milestones },
			{ entityType: 'risk', ids: inserted.risks },
			{ entityType: 'decision', ids: inserted.decisions }
		]
			.flatMap(({ entityType, ids }) =>
				ids.map((entityId) => ({
					projectId: typedProjectId,
					entityType: entityType as ProjectLogEntityType,
					entityId,
					action: 'created' as const,
					changedBy: userId,
					changeSource: 'api' as const
				}))
			)
			.filter((log) => Boolean(log.entityId));

		if (activityLogs.length > 0) {
			logActivitiesAsync(client as any, { logs: activityLogs });
		}

		return {
			project_id: typedProjectId,
			counts
		};
	} catch (error) {
		await cleanupPartialInstantiation(client, inserted);
		throw error;
	}
}

/**
 * Resolve facets by applying template defaults with user overrides winning.
 */
export function resolveFacets(
	templateDefaults: FacetDefaults | undefined,
	specFacets: Facets | undefined
): Facets {
	const resolved: Facets = {};

	if (templateDefaults?.context) resolved.context = templateDefaults.context;
	if (templateDefaults?.scale) resolved.scale = templateDefaults.scale;
	if (templateDefaults?.stage) resolved.stage = templateDefaults.stage;

	if (specFacets?.context) resolved.context = specFacets.context;
	if (specFacets?.scale) resolved.scale = specFacets.scale;
	if (specFacets?.stage) resolved.stage = specFacets.stage;

	return resolved;
}

/**
 * Validate ProjectSpec outside of Zod parse (exported for re-use)
 */
export function validateProjectSpec(spec: unknown): { valid: boolean; errors: string[] } {
	return validateProjectSpecStruct(spec);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ensureActorExists(client: TypedSupabaseClient, userId: string): Promise<string> {
	const { data, error } = await client.rpc('ensure_actor_for_user', {
		p_user_id: userId
	});

	if (error || !data) {
		throw new OntologyInstantiationError(
			`Failed to resolve actor for user: ${error?.message ?? 'Unknown error'}`
		);
	}

	return data;
}

async function assertValidFacets(
	client: TypedSupabaseClient,
	facets: Facets | undefined,
	scope: string,
	contextLabel?: string
): Promise<void> {
	if (!hasFacetValues(facets)) {
		return;
	}

	const { data, error } = await client.rpc('validate_facet_values', {
		p_facets: facets,
		p_scope: scope
	});

	if (error) {
		throw new OntologyInstantiationError(
			`Facet validation failed for ${contextLabel ?? scope}: ${error.message}`
		);
	}

	if (data && Array.isArray(data) && data.length > 0) {
		const messages = data
			.map((entry: { facet_key: string; provided_value: string; error: string }) => {
				return `${entry.facet_key}=${entry.provided_value}: ${entry.error}`;
			})
			.join('; ');
		throw new OntologyInstantiationError(
			`Facet validation failed for ${contextLabel ?? scope}: ${messages}`
		);
	}
}

function mergeProps(...sources: Array<Record<string, unknown>>): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const source of sources) {
		if (!source) continue;
		for (const [key, value] of Object.entries(source)) {
			const existing = result[key];
			if (isPlainObject(existing) && isPlainObject(value)) {
				result[key] = mergeProps(
					existing as Record<string, unknown>,
					value as Record<string, unknown>
				);
			} else {
				result[key] = value;
			}
		}
	}

	return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasFacetValues(facets: Facets | undefined): facets is Facets {
	if (!facets) return false;
	return Boolean(facets.context || facets.scale || facets.stage);
}

async function cleanupPartialInstantiation(
	client: TypedSupabaseClient,
	inserted: InsertedEntities
): Promise<void> {
	try {
		const allEntityIds = new Set<string>();

		for (const list of [
			inserted.goals,
			inserted.requirements,
			inserted.plans,
			inserted.tasks,
			inserted.outputs,
			inserted.documents,
			inserted.sources,
			inserted.metrics,
			inserted.milestones,
			inserted.risks,
			inserted.decisions
		]) {
			for (const id of list) {
				allEntityIds.add(id);
			}
		}

		if (inserted.projectId) {
			allEntityIds.add(inserted.projectId);
		}

		const entityIdArray = Array.from(allEntityIds);

		if (entityIdArray.length > 0) {
			await client.from('onto_edges').delete().in('src_id', entityIdArray);
			await client.from('onto_edges').delete().in('dst_id', entityIdArray);
		}

		if (inserted.projectId) {
			await client.from('onto_projects').delete().eq('id', inserted.projectId);
		}
	} catch (cleanupError) {
		console.error('[Ontology] Cleanup after instantiation failure failed:', cleanupError);
	}
}
