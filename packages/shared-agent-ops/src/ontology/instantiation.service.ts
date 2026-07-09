// packages/shared-agent-ops/src/ontology/instantiation.service.ts
import { randomUUID } from 'node:crypto';
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
	type ProjectState,
	type DocumentState,
	type PlanState,
	type ProjectSpec,
	GOAL_STATES,
	MILESTONE_STATES,
	TASK_STATES,
	RISK_STATES
} from './onto';
import type { Json, ProjectLogChangeSource, ProjectLogEntityType } from '@buildos/shared-types';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { logActivitiesAsync, type ActivityLogActorContext } from '../ops/async-activity-logger';
import { captureProductEvent } from '../analytics/posthog';
import { autoOrganizeConnections } from './auto-organizer.service';
import { addDocumentToTree, type AddDocumentOptions } from './doc-structure.service';
import {
	DEPRECATED_RELATIONSHIPS,
	RELATIONSHIP_DIRECTIONS,
	type EntityKind,
	type RelationshipType
} from './edge-direction';
import type { ConnectionRef } from './relationship-resolver';
import {
	getAllowedParents,
	isContainmentRel,
	TASK_DISALLOWS_PROJECT_FALLBACK_KINDS
} from './relationship-policy';
import {
	buildStartHereTemplate,
	buildStartHereTitle,
	START_HERE_DOCUMENT_TYPE_KEY
} from './start-here';

type InstantiationCounts = {
	goals: number;
	requirements: number;
	plans: number;
	tasks: number;
	documents: number;
	sources: number;
	metrics: number;
	milestones: number;
	risks: number;
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
	documents: string[];
	sources: string[];
	metrics: string[];
	milestones: string[];
	risks: string[];
	edges: string[];
};

export interface ProjectInstantiationOptions {
	activityLog?: {
		changeSource?: ProjectLogChangeSource;
		chatSessionId?: string;
		actorContext?: ActivityLogActorContext;
	};
}

const PROJECT_STATE_MAP: Record<string, ProjectState> = {
	planning: 'planning',
	active: 'active',
	completed: 'completed',
	cancelled: 'cancelled',
	draft: 'planning',
	complete: 'completed',
	archived: 'cancelled',
	paused: 'paused'
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

const DEFAULT_GOAL_STATE: GoalState = 'draft';
const DEFAULT_MILESTONE_STATE: MilestoneState = 'pending';
const DEFAULT_TASK_STATE: TaskState = 'todo';
const DEFAULT_RISK_STATE: RiskState = 'identified';

const INITIAL_COUNTS: InstantiationCounts = {
	goals: 0,
	requirements: 0,
	plans: 0,
	tasks: 0,
	documents: 0,
	sources: 0,
	metrics: 0,
	milestones: 0,
	risks: 0,
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
	return false;
}

// Bounded concurrency for the per-entity DB work during instantiation
// (speed audit 2026-07-08 WP-12: create_onto_project ran every insert as a
// serial round-trip — 5.9s p50 for the slowest tool in the surface).
const ENTITY_WRITE_CONCURRENCY = 5;

/**
 * Run `worker` over `items` with at most `limit` in flight. On the first
 * failure no new work starts, but everything already in flight is awaited
 * before the error is rethrown — instantiation cleanup must see every row
 * that actually landed.
 */
async function runWithConcurrency<T>(
	items: readonly T[],
	limit: number,
	worker: (item: T, index: number) => Promise<void>
): Promise<void> {
	if (items.length === 0) return;
	let nextIndex = 0;
	let firstError: unknown = null;
	const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (firstError === null) {
			const index = nextIndex;
			nextIndex += 1;
			if (index >= items.length) return;
			try {
				await worker(items[index] as T, index);
			} catch (error) {
				if (firstError === null) firstError = error;
				return;
			}
		}
	});
	await Promise.all(runners);
	if (firstError !== null) throw firstError;
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

async function addDocumentToDocStructure(
	client: TypedSupabaseClient,
	projectId: string,
	documentId: string,
	actorId: string,
	options?: AddDocumentOptions
): Promise<void> {
	try {
		await addDocumentToTree(client as any, projectId, documentId, options ?? {}, actorId);
	} catch (error) {
		console.error(`[Ontology] Failed to add document ${documentId} to doc_structure:`, error);
	}
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
	userId: string,
	options: ProjectInstantiationOptions = {}
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
		documents: [],
		sources: [],
		metrics: [],
		milestones: [],
		risks: [],
		edges: []
	};

	const counts: InstantiationCounts = { ...INITIAL_COUNTS };
	const activityDataByEntityKey = new Map<string, Record<string, unknown>>();
	const setActivityData = (
		kind: string,
		id: string | null | undefined,
		data: Record<string, unknown>
	): void => {
		if (!id) return;
		activityDataByEntityKey.set(`${kind}:${id}`, data);
	};

	// Identical facet payloads validate once per instantiation — specs with
	// many tasks sharing the same facets were paying one RPC per entity.
	const facetValidationCache = new Map<string, Promise<void>>();
	const assertValidFacetsCached = (
		facets: Facets | undefined,
		scope: string,
		contextLabel?: string
	): Promise<void> => {
		if (!hasFacetValues(facets)) return Promise.resolve();
		const cacheKey = `${scope}|${JSON.stringify(facets)}`;
		let pending = facetValidationCache.get(cacheKey);
		if (!pending) {
			pending = assertValidFacets(client, facets, scope, contextLabel);
			facetValidationCache.set(cacheKey, pending);
		}
		return pending;
	};

	const resolvedProjectFacets = resolveFacets(
		undefined,
		(parsed.project.props?.facets as Facets | undefined) ?? undefined
	);

	// Resolve actor ID from the current auth context to satisfy RLS
	// (created_by must equal current_actor_id()). Facet validation is an
	// independent round-trip, so both run concurrently.
	const [actorId] = await Promise.all([
		resolveActorId(client, userId),
		assertValidFacetsCached(resolvedProjectFacets, 'project', 'project')
	]);

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
		// Generate ID client-side so project creation does not depend on insert RETURNING visibility.
		const newProjectId = randomUUID();

		// Insert project first
		const { error: projectError } = await client.from('onto_projects').insert({
			id: newProjectId,
			name: parsed.project.name,
			description: parsed.project.description ?? null,
			type_key: parsed.project.type_key,
			state_key: projectState,
			props: mergedProjectProps as Json,
			start_at: parsed.project.start_at ?? null,
			end_at: parsed.project.end_at ?? null,
			created_by: actorId
		});

		if (projectError) {
			throw new OntologyInstantiationError(
				`Failed to create project: ${projectError?.message ?? 'Unknown error'}`
			);
		}

		projectId = newProjectId;
		inserted.projectId = projectId;
		setActivityData('project', projectId, {
			name: parsed.project.name,
			type_key: parsed.project.type_key,
			state_key: projectState,
			description: parsed.project.description ?? null
		});

		// Type guard: Ensure projectId is string for all subsequent operations
		if (!projectId) {
			throw new OntologyInstantiationError('Project ID is required but was not set');
		}

		// Create typed constant for type-safe operations (TypeScript narrowing doesn't flow into closures)
		const typedProjectId: string = projectId;

		const contextDocument = parsed.context_document
			? {
					title: parsed.context_document.title,
					type_key: parsed.context_document.type_key ?? START_HERE_DOCUMENT_TYPE_KEY,
					state_key: parsed.context_document.state_key ?? 'draft',
					body_markdown: parsed.context_document.body_markdown,
					props: parsed.context_document.props ?? {}
				}
			: {
					title: buildStartHereTitle(parsed.project.name),
					type_key: START_HERE_DOCUMENT_TYPE_KEY,
					state_key: 'draft',
					body_markdown: buildStartHereTemplate({
						projectName: parsed.project.name,
						projectDescription: parsed.project.description
					}),
					props: {
						origin: 'start_here_template',
						managed_region_version: 1
					}
				};

		if (contextDocument) {
			const contextDocId = await insertDocument(client, typedProjectId, actorId, {
				title: contextDocument.title,
				type_key: contextDocument.type_key,
				state_key: contextDocument.state_key,
				body_markdown: contextDocument.body_markdown,
				props: contextDocument.props
			});

			inserted.documents.push(contextDocId);
			setActivityData('document', contextDocId, {
				title: contextDocument.title,
				type_key: contextDocument.type_key,
				state_key: contextDocument.state_key
			});
			counts.documents += 1;
			await addDocumentToDocStructure(client, typedProjectId, contextDocId, actorId, {
				title: contextDocument.title
			});
		}

		const entityIdByTempId = new Map<string, { kind: EntityKind; id: string }>();

		const seenTempIds = new Set<string>();
		for (const entity of parsed.entities) {
			if (seenTempIds.has(entity.temp_id)) {
				throw new OntologyInstantiationError(
					`Duplicate temp_id "${entity.temp_id}" in entities list`
				);
			}
			seenTempIds.add(entity.temp_id);
		}

		// Documents join the doc tree AFTER the parallel insert phase — the doc
		// tree is a read-modify-write on shared project state and must stay
		// serial across documents.
		const documentsForDocStructure: Array<{
			specIndex: number;
			docId: string;
			title: string;
			description: string | null;
		}> = [];

		// Entity inserts depend only on the project id and actor, so they run
		// concurrently (bounded). This was the dominant serial cost of project
		// creation; the shared maps/arrays mutated below are safe because JS
		// interleaves only at await points and every key is unique per entity.
		await runWithConcurrency(
			parsed.entities,
			ENTITY_WRITE_CONCURRENCY,
			async (entity, specIndex) => {
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
						setActivityData('goal', data.id, {
							name: entity.name,
							type_key: entity.type_key ?? 'goal.default',
							state_key: normalizedState,
							description: entity.description ?? null
						});
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
						setActivityData('milestone', data.id, {
							title: entity.title,
							type_key: entity.type_key ?? 'milestone.default',
							state_key: normalizedState,
							description: entity.description ?? null
						});
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
						await assertValidFacetsCached(
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
						setActivityData('plan', data.id, {
							name: entity.name,
							type_key: entity.type_key ?? 'plan.default',
							state_key: normalizedPlanState,
							description: entity.description ?? null
						});
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
						await assertValidFacetsCached(
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
						setActivityData('task', data.id, {
							title: entity.title,
							type_key: entity.type_key ?? 'task.default',
							state_key: normalizedState,
							description: entity.description ?? null
						});
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
						setActivityData('document', docId, {
							title: entity.title,
							type_key: entity.type_key ?? 'document.default',
							state_key: normalizedState,
							description: entity.description ?? null
						});
						counts.documents += 1;
						documentsForDocStructure.push({
							specIndex,
							docId,
							title: entity.title,
							description: entity.description ?? null
						});
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
						setActivityData('risk', data.id, {
							title: entity.title,
							type_key: entity.type_key ?? 'risk.default',
							state_key: normalizedState,
							impact: entity.impact ?? 'medium'
						});
						counts.risks += 1;
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
						setActivityData('requirement', data.id, {
							text: entity.text,
							type_key: entity.type_key ?? 'requirement.general'
						});
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
						setActivityData('metric', data.id, {
							name: entity.name,
							type_key: entity.type_key ?? null,
							unit: entity.unit,
							definition: entity.definition ?? null
						});
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
						setActivityData('source', data.id, {
							name: entity.name ?? null,
							uri: entity.uri,
							snapshot_uri: entity.snapshot_uri ?? null
						});
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
		);

		documentsForDocStructure.sort((left, right) => left.specIndex - right.specIndex);
		for (const doc of documentsForDocStructure) {
			await addDocumentToDocStructure(client, typedProjectId, doc.docId, actorId, {
				title: doc.title,
				description: doc.description
			});
		}

		const connectionsByEntityKey = new Map<string, ConnectionRef[]>();
		const incomingContainmentKeys = new Set<string>();
		const taskStructuralKeys = new Set<string>();
		// Entities no relationship touches organize only their own edges and can
		// run concurrently in the auto-organize phase below.
		const relationshipTouchedKeys = new Set<string>();
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
			relationshipTouchedKeys.add(fromKey);
			relationshipTouchedKeys.add(toKey);
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

		const organizeEntity = async (created: { kind: EntityKind; id: string }): Promise<void> => {
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
		};

		const createdEntities = parsed.entities
			.map((entity) => entityIdByTempId.get(entity.temp_id))
			.filter((created): created is { kind: EntityKind; id: string } => Boolean(created));
		// Auto-organize concurrently only where no cross-entity state is shared:
		// an entity untouched by every relationship organizes just its own edges.
		// Anything a relationship references — and every document, since document
		// containment routes through the shared doc tree — stays sequential.
		const independentEntities = createdEntities.filter(
			(created) =>
				created.kind !== 'document' && !relationshipTouchedKeys.has(getEntityKey(created))
		);
		const linkedEntities = createdEntities.filter(
			(created) =>
				created.kind === 'document' || relationshipTouchedKeys.has(getEntityKey(created))
		);
		await runWithConcurrency(independentEntities, ENTITY_WRITE_CONCURRENCY, organizeEntity);
		for (const created of linkedEntities) {
			await organizeEntity(created);
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

		const activityLogs = [
			{ entityType: 'project', ids: [typedProjectId] },
			{ entityType: 'goal', ids: inserted.goals },
			{ entityType: 'requirement', ids: inserted.requirements },
			{ entityType: 'plan', ids: inserted.plans },
			{ entityType: 'task', ids: inserted.tasks },
			{ entityType: 'document', ids: inserted.documents },
			{ entityType: 'source', ids: inserted.sources },
			{ entityType: 'metric', ids: inserted.metrics },
			{ entityType: 'milestone', ids: inserted.milestones },
			{ entityType: 'risk', ids: inserted.risks }
		]
			.flatMap(({ entityType, ids }) =>
				ids.map((entityId) => ({
					projectId: typedProjectId,
					entityType: entityType as ProjectLogEntityType,
					entityId,
					action: 'created' as const,
					changedBy: userId,
					changedByActorId: options.activityLog?.actorContext?.changedByActorId,
					afterData: activityDataByEntityKey.get(`${entityType}:${entityId}`),
					changeSource: options.activityLog?.changeSource ?? 'api',
					chatSessionId: options.activityLog?.chatSessionId,
					externalAgentCallerId: options.activityLog?.actorContext?.externalAgentCallerId,
					agentCallSessionId: options.activityLog?.actorContext?.agentCallSessionId
				}))
			)
			.filter((log) => Boolean(log.entityId));

		// Edge count (display metadata), activity logs, and the PostHog funnel
		// event are three independent network calls — run them together. The
		// funnel event stays awaited (not fire-and-forget): it is the aha-moment
		// metric and serverless teardown would drop an un-awaited capture.
		const [{ count: edgeCount }] = await Promise.all([
			client
				.from('onto_edges')
				.select('id', { count: 'exact', head: true })
				.eq('project_id', typedProjectId),
			activityLogs.length > 0
				? logActivitiesAsync(client as any, { logs: activityLogs })
				: Promise.resolve(),
			// AHA-moment funnel event — this is the single point every project
			// creation path (API, agentic chat, braindump, calendar analysis)
			// funnels through.
			captureProductEvent(userId, 'project_created', {
				project_id: typedProjectId,
				type_key: parsed.project.type_key,
				task_count: counts.tasks,
				change_source: options.activityLog?.changeSource ?? 'api'
			})
		]);
		if (typeof edgeCount === 'number') {
			counts.edges = edgeCount;
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

/**
 * Resolve the actor id tied to the current session.
 * Tries current_actor_id() first (what RLS uses), then falls back to creating
 * the actor via ensure_actor_for_user and re-checks. Throws if still missing.
 */
export async function resolveActorId(client: TypedSupabaseClient, userId: string): Promise<string> {
	// First, try the same resolver used by RLS policies. This works for
	// user-scoped clients (the web app) where auth.uid() is populated.
	const { data: currentActorId } = await client.rpc('current_actor_id');
	if (currentActorId) return currentActorId;

	// No session actor. This is the normal case for the service-role admin client
	// used by the external agent gateway / remote MCP, where auth.uid() is null and
	// current_actor_id() therefore returns null. ensure_actor_for_user takes an
	// explicit user id and returns that user's actor id directly, so use it rather
	// than re-checking the session resolver (which can never succeed without a JWT).
	const ensuredActorId = await ensureActorExists(client, userId);
	if (ensuredActorId) return ensuredActorId;

	// Last resort: re-check the session resolver in case the actor was just created
	// for a user-scoped client that previously had no actor row.
	const { data: resolvedActorId, error: resolvedError } = await client.rpc('current_actor_id');
	if (resolvedActorId) return resolvedActorId;

	// If we still can't resolve, surface a clear, user-friendly error.
	throw new OntologyInstantiationError(
		`Failed to resolve actor for user session${
			resolvedError?.message ? `: ${resolvedError.message}` : ''
		}. Please reauthenticate and try again.`
	);
}

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
			inserted.documents,
			inserted.sources,
			inserted.metrics,
			inserted.milestones,
			inserted.risks
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
