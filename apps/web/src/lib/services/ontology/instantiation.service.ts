// apps/web/src/lib/services/ontology/instantiation.service.ts
import {
	ProjectSpecSchema,
	validateProjectSpec as validateProjectSpecStruct,
	type FacetDefaults,
	type Facets,
	type FSMDef,
	type ProjectState,
	type DocumentState,
	type PlanState,
	type OutputState,
	type ProjectSpec
} from '$lib/types/onto';
import { Json } from '@buildos/shared-types';
import type { TypedSupabaseClient } from '@buildos/supabase-client';

type InstantiationCounts = {
	goals: number;
	requirements: number;
	plans: number;
	tasks: number;
	outputs: number;
	documents: number;
	edges: number;
};

type EdgeInsert = {
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
	review: 'review',
	published: 'published',
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

const INITIAL_COUNTS: InstantiationCounts = {
	goals: 0,
	requirements: 0,
	plans: 0,
	tasks: 0,
	outputs: 0,
	documents: 0,
	edges: 0
};

type DocumentInsertSpec = {
	title: string;
	type_key: string;
	state_key?: string;
	props?: Record<string, unknown>;
	body_markdown?: string;
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
	const planIdByName = new Map<string, string>();
	const documentIdByTitle = new Map<string, string>();

	let projectId: string | undefined;
	let contextDocumentId: string | null = null;

	try {
		// Insert project first
		const { data: projectRows, error: projectError } = await client
			.from('onto_projects')
			.insert({
				name: parsed.project.name,
				description: parsed.project.description ?? null,
				type_key: parsed.project.type_key,
				also_types: parsed.project.also_types ?? [],
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

			contextDocumentId = contextDocId;
			inserted.documents.push(contextDocId);
			documentIdByTitle.set(parsed.context_document.title, contextDocId);

			// Use has_context_document edge to link the context document
			edgesToInsert.push({
				src_kind: 'project',
				src_id: projectId,
				rel: 'has_context_document',
				dst_kind: 'document',
				dst_id: contextDocId
			});
		}

		// Goals
		if (parsed.goals?.length) {
			const goalInserts = parsed.goals.map((goal) => ({
				project_id: typedProjectId,
				name: goal.name,
				type_key: goal.type_key ?? null,
				props: (goal.props ?? {}) as Json,
				created_by: actorId
			}));

			const { data: goalRows, error: goalsError } = await client
				.from('onto_goals')
				.insert(goalInserts)
				.select('id');

			if (goalsError) {
				throw new OntologyInstantiationError(
					`Failed to insert goals: ${goalsError.message}`
				);
			}

			for (const row of goalRows ?? []) {
				inserted.goals.push(row.id);
				edgesToInsert.push({
					src_kind: 'project',
					src_id: projectId,
					rel: 'has_goal',
					dst_kind: 'goal',
					dst_id: row.id
				});
			}

			counts.goals = goalRows?.length ?? 0;
		}

		// Requirements
		if (parsed.requirements?.length) {
			const requirementInserts = parsed.requirements.map((req) => ({
				project_id: typedProjectId,
				text: req.text,
				type_key: req.type_key ?? 'requirement.general',
				props: (req.props ?? {}) as Json,
				created_by: actorId
			}));

			const { data: reqRows, error: reqError } = await client
				.from('onto_requirements')
				.insert(requirementInserts)
				.select('id');

			if (reqError) {
				throw new OntologyInstantiationError(
					`Failed to insert requirements: ${reqError.message}`
				);
			}

			for (const row of reqRows ?? []) {
				inserted.requirements.push(row.id);
				edgesToInsert.push({
					src_kind: 'project',
					src_id: projectId,
					rel: 'has_requirement',
					dst_kind: 'requirement',
					dst_id: row.id
				});
			}

			counts.requirements = reqRows?.length ?? 0;
		}

		// Documents (sequential so we can capture context doc)
		if (parsed.documents?.length) {
			for (const doc of parsed.documents) {
				const docId = await insertDocument(client, typedProjectId, actorId, {
					title: doc.title,
					type_key: doc.type_key,
					state_key: doc.state_key,
					body_markdown: doc.body_markdown,
					props: doc.props ?? {}
				});

				inserted.documents.push(docId);
				documentIdByTitle.set(doc.title, docId);

				edgesToInsert.push({
					src_kind: 'project',
					src_id: projectId,
					rel: 'has_document',
					dst_kind: 'document',
					dst_id: docId
				});
			}

			counts.documents = inserted.documents.length;

			// Link first intake/brief doc as project context when applicable (only if not already set)
			if (!contextDocumentId) {
				const firstDoc = parsed.documents[0];
				if (firstDoc) {
					const fallbackContextDocId = documentIdByTitle.get(firstDoc.title);
					if (fallbackContextDocId) {
						// Create has_context_document edge for the fallback context doc
						edgesToInsert.push({
							src_kind: 'project',
							src_id: projectId,
							rel: 'has_context_document',
							dst_kind: 'document',
							dst_id: fallbackContextDocId
						});
					}
				}
			}
		} else if (contextDocumentId) {
			counts.documents = inserted.documents.length;
		}

		// Plans
		if (parsed.plans?.length) {
			for (const plan of parsed.plans) {
				const resolvedPlanFacets = resolveFacets(
					undefined,
					(plan.props?.facets as Facets | undefined) ?? undefined
				);
				await assertValidFacets(client, resolvedPlanFacets, 'plan', `plan "${plan.name}"`);

				const mergedPlanProps = mergeProps(plan.props ?? {});
					if (hasFacetValues(resolvedPlanFacets)) {
						mergedPlanProps.facets = resolvedPlanFacets;
					} else {
						delete mergedPlanProps.facets;
					}

					const normalizedPlanState: PlanState =
						PLAN_STATE_MAP[plan.state_key?.trim().toLowerCase() ?? 'draft'] ??
						'draft';

					const { data: planRow, error: planError } = await client
						.from('onto_plans')
						.insert({
							project_id: typedProjectId,
							name: plan.name,
							type_key: plan.type_key,
							state_key: normalizedPlanState,
							props: mergedPlanProps as Json,
							created_by: actorId
						})
						.select('id')
						.single();

				if (planError || !planRow) {
					throw new OntologyInstantiationError(
						`Failed to insert plan "${plan.name}": ${planError?.message ?? 'Unknown error'}`
					);
				}

				inserted.plans.push(planRow.id);
				planIdByName.set(plan.name, planRow.id);

				edgesToInsert.push({
					src_kind: 'project',
					src_id: projectId,
					rel: 'has_plan',
					dst_kind: 'plan',
					dst_id: planRow.id
				});
			}

			counts.plans = inserted.plans.length;
		}

		// Tasks - now have type_key column and use edges for plan relationships
		if (parsed.tasks?.length) {
			for (const task of parsed.tasks) {
				let planId: string | null = null;
				if (task.plan_name) {
					const mappedPlanId = planIdByName.get(task.plan_name);
					if (!mappedPlanId) {
						throw new OntologyInstantiationError(
							`Task "${task.title}" references unknown plan "${task.plan_name}"`
						);
					}
					planId = mappedPlanId;
				}

				const taskTypeKey = task.type_key ?? 'task.execute';

				const resolvedTaskFacets = resolveFacets(
					undefined,
					(task.props?.facets as Facets | undefined) ?? undefined
				);
				await assertValidFacets(client, resolvedTaskFacets, 'task', `task "${task.title}"`);

				const finalTaskProps = mergeProps(task.props ?? {});
				if (hasFacetValues(resolvedTaskFacets)) {
					finalTaskProps.facets = resolvedTaskFacets;
				} else {
					delete finalTaskProps.facets;
				}

				const { data: taskRow, error: taskError } = await client
					.from('onto_tasks')
					.insert({
						project_id: typedProjectId,
						title: task.title,
						type_key: taskTypeKey,
						state_key: task.state_key ?? 'todo',
						priority: task.priority ?? null,
						due_at: task.due_at ?? null,
						props: finalTaskProps as Json,
						created_by: actorId
					})
					.select('id')
					.single();

				if (taskError || !taskRow) {
					throw new OntologyInstantiationError(
						`Failed to insert task "${task.title}": ${taskError?.message ?? 'Unknown error'}`
					);
				}

				const taskId = taskRow.id;
				inserted.tasks.push(taskId);
				edgesToInsert.push({
					src_kind: 'project',
					src_id: projectId,
					rel: 'has_task',
					dst_kind: 'task',
					dst_id: taskId
				});

				// Plan relationship via bidirectional edges (plan_id column removed)
				if (planId) {
					// Plan -> Task (has_task)
					edgesToInsert.push({
						src_kind: 'plan',
						src_id: planId,
						rel: 'has_task',
						dst_kind: 'task',
						dst_id: taskId
					});
					// Task -> Plan (belongs_to_plan)
					edgesToInsert.push({
						src_kind: 'task',
						src_id: taskId,
						rel: 'belongs_to_plan',
						dst_kind: 'plan',
						dst_id: planId
					});
				}
			}

			counts.tasks = inserted.tasks.length;
		}

		// Outputs
		if (parsed.outputs?.length) {
			for (const output of parsed.outputs) {
				const resolvedOutputFacets = resolveFacets(
					undefined,
					(output.props?.facets as Facets | undefined) ?? undefined
				);
				await assertValidFacets(
					client,
					resolvedOutputFacets,
					'output',
					`output "${output.name}"`
				);

				const mergedOutputProps = mergeProps(output.props ?? {});
					if (hasFacetValues(resolvedOutputFacets)) {
						mergedOutputProps.facets = resolvedOutputFacets;
					} else {
						delete mergedOutputProps.facets;
					}

					const normalizedOutputState: OutputState =
						OUTPUT_STATE_MAP[output.state_key?.trim().toLowerCase() ?? 'draft'] ??
						'draft';

					const { data: outputRow, error: outputError } = await client
						.from('onto_outputs')
						.insert({
							project_id: typedProjectId,
							name: output.name,
							type_key: output.type_key,
							state_key: normalizedOutputState,
							props: mergedOutputProps as Json,
							created_by: actorId
						})
					.select('id')
					.single();

				if (outputError || !outputRow) {
					throw new OntologyInstantiationError(
						`Failed to insert output "${output.name}": ${outputError?.message ?? 'Unknown error'}`
					);
				}

				inserted.outputs.push(outputRow.id);
				edgesToInsert.push({
					src_kind: 'project',
					src_id: projectId,
					rel: 'has_output',
					dst_kind: 'output',
					dst_id: outputRow.id
				});
			}

			counts.outputs = inserted.outputs.length;
		}

		// Sources
		if (parsed.sources?.length) {
			const sourceInserts = parsed.sources.map((source) => ({
				project_id: typedProjectId,
				uri: source.uri,
				snapshot_uri: source.snapshot_uri ?? null,
				props: (source.props ?? {}) as Json,
				created_by: actorId
			}));

			const { data: sourceRows, error: sourcesError } = await client
				.from('onto_sources')
				.insert(sourceInserts)
				.select('id');

			if (sourcesError) {
				throw new OntologyInstantiationError(
					`Failed to insert sources: ${sourcesError.message}`
				);
			}

			for (const row of sourceRows ?? []) {
				inserted.sources.push(row.id);
				edgesToInsert.push({
					src_kind: 'project',
					src_id: projectId,
					rel: 'has_source',
					dst_kind: 'source',
					dst_id: row.id
				});
			}
		}

		// Metrics
		if (parsed.metrics?.length) {
			const metricInserts = parsed.metrics.map((metric) => ({
				project_id: typedProjectId,
				name: metric.name,
				type_key: metric.type_key ?? null,
				unit: metric.unit,
				definition: metric.definition ?? null,
				props: (metric.props ?? {}) as Json,
				created_by: actorId
			}));

			const { data: metricRows, error: metricError } = await client
				.from('onto_metrics')
				.insert(metricInserts)
				.select('id');

			if (metricError) {
				throw new OntologyInstantiationError(
					`Failed to insert metrics: ${metricError.message}`
				);
			}

			for (const row of metricRows ?? []) {
				inserted.metrics.push(row.id);
				edgesToInsert.push({
					src_kind: 'project',
					src_id: projectId,
					rel: 'has_metric',
					dst_kind: 'metric',
					dst_id: row.id
				});
			}
		}

		// Milestones
		if (parsed.milestones?.length) {
			const milestoneInserts = parsed.milestones.map((milestone) => ({
				project_id: typedProjectId,
				title: milestone.title,
				type_key: milestone.type_key ?? null,
				due_at: milestone.due_at,
				props: (milestone.props ?? {}) as Json,
				created_by: actorId
			}));

			const { data: milestoneRows, error: milestoneError } = await client
				.from('onto_milestones')
				.insert(milestoneInserts)
				.select('id');

			if (milestoneError) {
				throw new OntologyInstantiationError(
					`Failed to insert milestones: ${milestoneError.message}`
				);
			}

			for (const row of milestoneRows ?? []) {
				inserted.milestones.push(row.id);
				edgesToInsert.push({
					src_kind: 'project',
					src_id: projectId,
					rel: 'has_milestone',
					dst_kind: 'milestone',
					dst_id: row.id
				});
			}
		}

		// Risks
		if (parsed.risks?.length) {
			const riskInserts = parsed.risks.map((risk) => ({
				project_id: typedProjectId,
				title: risk.title,
				type_key: risk.type_key ?? null,
				probability: risk.probability ?? null,
				impact: risk.impact ?? 'medium',
				state_key: 'open',
				props: (risk.props ?? {}) as Json,
				created_by: actorId
			}));

			const { data: riskRows, error: riskError } = await client
				.from('onto_risks')
				.insert(riskInserts)
				.select('id');

			if (riskError) {
				throw new OntologyInstantiationError(
					`Failed to insert risks: ${riskError.message}`
				);
			}

			for (const row of riskRows ?? []) {
				inserted.risks.push(row.id);
				edgesToInsert.push({
					src_kind: 'project',
					src_id: projectId,
					rel: 'has_risk',
					dst_kind: 'risk',
					dst_id: row.id
				});
			}
		}

		// Decisions
		if (parsed.decisions?.length) {
			const decisionInserts = parsed.decisions.map((decision) => ({
				project_id: typedProjectId,
				title: decision.title,
				decision_at: decision.decision_at,
				rationale: decision.rationale ?? null,
				props: (decision.props ?? {}) as Json,
				created_by: actorId
			}));

			const { data: decisionRows, error: decisionError } = await client
				.from('onto_decisions')
				.insert(decisionInserts)
				.select('id');

			if (decisionError) {
				throw new OntologyInstantiationError(
					`Failed to insert decisions: ${decisionError.message}`
				);
			}

			for (const row of decisionRows ?? []) {
				inserted.decisions.push(row.id);
				edgesToInsert.push({
					src_kind: 'project',
					src_id: projectId,
					rel: 'has_decision',
					dst_kind: 'decision',
					dst_id: row.id
				});
			}
		}

		// Explicit edges provided in spec
		if (parsed.edges?.length) {
			for (const edge of parsed.edges) {
				edgesToInsert.push({
					src_kind: edge.src_kind,
					src_id: edge.src_id,
					rel: edge.rel,
					dst_kind: edge.dst_kind,
					dst_id: edge.dst_id,
					props: (edge.props ?? {}) as Json
				});
			}
		}

		// Insert accumulated edges
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

			counts.edges = edgeRows?.length ?? 0;
		}

		return {
			project_id: projectId,
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
