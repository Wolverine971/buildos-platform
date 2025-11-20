// apps/web/src/lib/server/fsm/engine.ts
/**
 * FSM (Finite State Machine) Engine for BuildOS Ontology
 *
 * Executes state transitions with declarative guards and actions.
 * All operations are idempotent and permission-checked.
 */

import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { FSMDef, FSMGuard, FSMAction, FSMTransition } from '$lib/types/onto';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { executeNotifyAction } from './actions/notify';
import { executeCreateOutputAction } from './actions/create-output';
import { executeScheduleRruleAction } from './actions/schedule-rrule';
import { executeEmailUserAction } from './actions/email-user';
import { executeCreateDocFromTemplateAction } from './actions/create-doc-from-template';
import { executeEmailAdminAction } from './actions/email-admin';
import { executeCreateResearchDocAction } from './actions/create-research-doc';
import { executeRunLlmCritiqueAction } from './actions/run-llm-critique';
import type { Database, Json } from '@buildos/shared-types';
import { resolveTemplateWithClient } from '$lib/services/ontology/template-resolver.service';

// ============================================
// TYPES
// ============================================

type TransitionContext = {
	actor_id?: string | null;
	user_id?: string | null;
};

type TransitionResult =
	| { ok: true; state_after: string; actions_run: string[] }
	| { ok: false; error: string; guard_failures?: string[] };

type OntoTable = 'onto_tasks' | 'onto_outputs' | 'onto_plans' | 'onto_projects' | 'onto_documents';

type JsonObject = Record<string, Json | undefined>;

type RawEntityRow = {
	id: string;
	type_key: string;
	state_key: string;
	props: Json | null;
	project_id?: string | null;
	[key: string]: unknown;
};

type EntityRow = {
	id: string;
	type_key: string;
	state_key: string;
	props: JsonObject;
	project_id: string;
	[key: string]: unknown;
};

// ============================================
// MAIN ENTRY POINT
// ============================================

export async function runTransition(
	request: { object_kind: string; object_id: string; event: string },
	ctx: TransitionContext,
	clientParam?: TypedSupabaseClient
): Promise<TransitionResult> {
	const client = clientParam ?? createAdminSupabaseClient();

	// 1) Load object row + its type_key/state_key
	const table = kindToTable(request.object_kind);

	// For projects, use 'id' as project_id (since they don't have a parent project)
	// For other entities, select the actual project_id foreign key
	const selectClause = selectClauseForKind(request.object_kind);

	const { data: rows, error } = await client
		.from(table)
		.select(selectClause)
		.eq('id', request.object_id)
		.limit(1)
		.returns<RawEntityRow[]>();

	if (error || !rows || rows.length === 0) {
		return {
			ok: false,
			error: `Object not found: ${request.object_kind}/${request.object_id}`
		};
	}

	const rawEntity = rows[0]!;
	const entity: EntityRow = {
		...rawEntity,
		project_id: (rawEntity.project_id ?? rawEntity.id) as string,
		props: toJsonObject(rawEntity.props)
	};

	// 2) Load template FSM with inheritance resolution
	let resolvedTemplate: { fsm: FSMDef | null };
	try {
		const scope = kindToScope(request.object_kind);
		const template = await resolveTemplateWithClient(client, entity.type_key, scope);
		resolvedTemplate = { fsm: template.fsm as FSMDef | null };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return {
			ok: false,
			error: `FSM template not found for type_key: ${entity.type_key} (${message})`
		};
	}

	const fsm = resolvedTemplate.fsm;

	// 3) Find transition
	if (!fsm) {
		return {
			ok: false,
			error: `FSM definition missing for type_key: ${entity.type_key}`
		};
	}

	const transition = fsm.transitions.find(
		(t) => t.from === entity.state_key && t.event === request.event
	);

	if (!transition) {
		return {
			ok: false,
			error: `No valid transition from "${entity.state_key}" on event "${request.event}"`
		};
	}

	// 4) Evaluate guards
	if (transition.guards && transition.guards.length > 0) {
		const guardResults = await evaluateGuards(transition.guards, entity, ctx);
		if (!guardResults.passed) {
			return {
				ok: false,
				error: 'Guard check failed',
				guard_failures: guardResults.failures
			};
		}
	}

	// 5) Update state
	const { error: updateError } = await client
		.from(table)
		.update({ state_key: transition.to })
		.eq('id', entity.id);

	if (updateError) {
		return { ok: false, error: `Failed to update state: ${updateError.message}` };
	}

	// 6) Execute actions
	const actions_run: string[] = [];
	if (transition.actions && transition.actions.length > 0) {
		try {
			const actionResults = await executeActions(
				transition.actions,
				entity,
				transition.to,
				ctx
			);
			actions_run.push(...actionResults);
		} catch (err) {
			console.error('[FSM Engine] Action execution error:', err);
			// Actions are side-effects; don't fail the transition if they error
		}
	}

	// 7) Log transition
	await logTransition(entity, transition, request.event, ctx, actions_run);

	return { ok: true, state_after: transition.to, actions_run };
}

// ============================================
// GUARD EVALUATION
// ============================================

async function evaluateGuards(
	guards: FSMGuard[],
	entity: EntityRow,
	ctx: TransitionContext
): Promise<{ passed: boolean; failures: string[] }> {
	const failures: string[] = [];

	for (const guard of guards) {
		let passed = false;

		switch (guard.type) {
			case 'has_property': {
				// e.g., { type: "has_property", path: "props.equipment" }
				if (!guard.path) {
					failures.push(`has_property guard missing "path" field`);
					continue;
				}
				const value = getNestedValue(entity, guard.path);
				passed = value !== undefined && value !== null;
				break;
			}

			case 'has_facet': {
				// e.g., { type: "has_facet", key: "context", value: "client" }
				if (!guard.key || !guard.value) {
					failures.push(`has_facet guard missing "key" or "value"`);
					continue;
				}
				const facets = getFacets(entity);
				passed = facets[guard.key] === guard.value;
				break;
			}

			case 'facet_in': {
				// e.g., { type: "facet_in", key: "scale", values: ["large", "epic"] }
				if (!guard.key || !guard.values || !Array.isArray(guard.values)) {
					failures.push(`facet_in guard missing "key" or "values"`);
					continue;
				}
				const facets = getFacets(entity);
				const candidate = facets[guard.key];
				passed = typeof candidate === 'string' && guard.values.includes(candidate);
				break;
			}

			case 'all_facets_set': {
				// e.g., { type: "all_facets_set", keys: ["context", "scale", "stage"] }
				if (!guard.keys || !Array.isArray(guard.keys)) {
					failures.push(`all_facets_set guard missing "keys" array`);
					continue;
				}
				const facets = getFacets(entity);
				passed = guard.keys.every((key) => typeof facets[key] === 'string');
				break;
			}

			case 'type_key_matches': {
				// e.g., { type: "type_key_matches", pattern: "writer.*" }
				if (!guard.pattern) {
					failures.push(`type_key_matches guard missing "pattern"`);
					continue;
				}
				const regex = new RegExp(guard.pattern.replace(/\*/g, '.*'));
				passed = regex.test(entity.type_key);
				break;
			}

			default:
				failures.push(`Unknown guard type: ${guard.type}`);
				continue;
		}

		if (!passed) {
			failures.push(`Guard failed: ${guard.type} (${JSON.stringify(guard)})`);
		}
	}

	return { passed: failures.length === 0, failures };
}

// ============================================
// ACTION EXECUTION
// ============================================

async function executeActions(
	actions: FSMAction[],
	entity: EntityRow,
	newState: string,
	ctx: TransitionContext
): Promise<string[]> {
	const client = createAdminSupabaseClient();
	const executed: string[] = [];

	for (const action of actions) {
		try {
			switch (action.type) {
				case 'update_facets': {
					// Update facets in props
					if (!action.facets) {
						console.warn('[FSM] update_facets action missing facets field');
						break;
					}

					const table = getTableForEntity(entity);
					const propsObject = toJsonObject(entity.props);
					const updatedFacets = {
						...getFacets(entity),
						...sanitizeFacets(action.facets)
					};
					const updatedProps: JsonObject = {
						...propsObject,
						facets: updatedFacets
					};

					await client
						.from(table)
						.update({ props: updatedProps as Json })
						.eq('id', entity.id);
					entity.props = updatedProps;

					executed.push(`update_facets(${JSON.stringify(action.facets)})`);
					break;
				}

				case 'spawn_tasks': {
					// Create tasks in the project
					if (!action.titles || action.titles.length === 0) {
						console.warn('[FSM] spawn_tasks action missing titles');
						break;
					}

					const projectId = entity.project_id ?? entity.id;
					const createdBy = ctx.actor_id ?? 'fsm_engine';
					const propsTemplate = (action.props_template ?? {}) as Json;
					type OntoTaskInsert = Database['public']['Tables']['onto_tasks']['Insert'];
					type OntoEdgeInsert = Database['public']['Tables']['onto_edges']['Insert'];

					// If a plan_id was provided, make sure it belongs to the same project to avoid
					// wiring tasks to the wrong project graph.
					let validatedPlanId: string | null = null;
					if (action.plan_id) {
						const { data: plan, error: planError } = await client
							.from('onto_plans')
							.select('id, project_id')
							.eq('id', action.plan_id)
							.maybeSingle();

						if (planError) {
							throw new Error(
								`Failed to validate plan for spawn_tasks: ${planError.message}`
							);
						}

						if (!plan || plan.project_id !== projectId) {
							throw new Error(
								`Plan ${action.plan_id} does not belong to project ${projectId}; aborting spawn_tasks`
							);
						}

						validatedPlanId = plan.id;
					}

					// Idempotency: reuse existing tasks with the same title + plan within the project
					const { data: existingTasks, error: existingTaskError } = await client
						.from('onto_tasks')
						.select('id, title, plan_id')
						.eq('project_id', projectId)
						.in('title', action.titles)
						.returns<{ id: string; title: string; plan_id: string | null }[]>();

					if (existingTaskError) {
						throw new Error(
							`Failed to check existing tasks: ${existingTaskError.message}`
						);
					}

					const existingByKey = new Map<string, { id: string }>();
					for (const task of existingTasks ?? []) {
						const key = `${task.title}::${task.plan_id ?? ''}`;
						existingByKey.set(key, { id: task.id });
					}

					const taskInserts: OntoTaskInsert[] = [];
					for (const title of action.titles) {
						const key = `${title}::${validatedPlanId ?? ''}`;
						if (existingByKey.has(key)) continue;

						taskInserts.push({
							project_id: projectId,
							plan_id: validatedPlanId,
							title,
							state_key: 'todo',
							props: propsTemplate,
							created_by: createdBy
						});
					}

					const newTaskIds: string[] = [];
					if (taskInserts.length > 0) {
						const { data: tasks, error: taskInsertError } = await client
							.from('onto_tasks')
							.insert(taskInserts)
							.select('id')
							.returns<{ id: string }[]>();

						if (taskInsertError || !tasks) {
							throw new Error(
								`Failed to spawn tasks: ${taskInsertError?.message ?? 'unknown error'}`
							);
						}

						for (const task of tasks) {
							newTaskIds.push(task.id);
						}
					}

					const allTaskIds = [
						...newTaskIds,
						...Array.from(existingByKey.values()).map((t) => t.id)
					];

					const edges: OntoEdgeInsert[] = [];

					// Project -> Task edges
					if (allTaskIds.length > 0) {
						const { data: existingProjectEdges, error: edgeQueryError } = await client
							.from('onto_edges')
							.select('dst_id')
							.eq('src_id', projectId)
							.eq('src_kind', 'project')
							.eq('dst_kind', 'task')
							.eq('rel', 'contains')
							.in('dst_id', allTaskIds)
							.returns<{ dst_id: string }[]>();

						if (edgeQueryError) {
							throw new Error(
								`Failed to check existing project edges: ${edgeQueryError.message}`
							);
						}

						const existingProjectEdgeIds = new Set(
							(existingProjectEdges ?? []).map((edge) => edge.dst_id)
						);

						for (const taskId of allTaskIds) {
							if (existingProjectEdgeIds.has(taskId)) continue;
							edges.push({
								src_id: projectId,
								src_kind: 'project',
								dst_id: taskId,
								dst_kind: 'task',
								rel: 'contains',
								props: { origin: 'fsm_action' } as Json
							});
						}
					}

					// Plan -> Task edges
					if (validatedPlanId && allTaskIds.length > 0) {
						const { data: existingPlanEdges, error: planEdgeQueryError } = await client
							.from('onto_edges')
							.select('dst_id')
							.eq('src_id', validatedPlanId)
							.eq('src_kind', 'plan')
							.eq('dst_kind', 'task')
							.eq('rel', 'contains')
							.in('dst_id', allTaskIds)
							.returns<{ dst_id: string }[]>();

						if (planEdgeQueryError) {
							throw new Error(
								`Failed to check existing plan edges: ${planEdgeQueryError.message}`
							);
						}

						const existingPlanEdgeIds = new Set(
							(existingPlanEdges ?? []).map((edge) => edge.dst_id)
						);

						for (const taskId of allTaskIds) {
							if (existingPlanEdgeIds.has(taskId)) continue;
							edges.push({
								src_id: validatedPlanId,
								src_kind: 'plan',
								dst_id: taskId,
								dst_kind: 'task',
								rel: 'contains',
								props: { origin: 'fsm_action', via: 'spawn_tasks' } as Json
							});
						}
					}

					if (edges.length > 0) {
						const { error: edgeError } = await client.from('onto_edges').insert(edges);

						if (edgeError) {
							throw new Error(
								`Failed to link tasks to project: ${edgeError.message}`
							);
						}
					}

					executed.push(`spawn_tasks(${action.titles.length} tasks)`);
					break;
				}

				case 'notify': {
					const result = await executeNotifyAction(action, entity, ctx, client);
					executed.push(result);
					break;
				}

				case 'email_user': {
					const result = await executeEmailUserAction(action, entity, ctx, client);
					executed.push(result);
					break;
				}

				case 'email_admin': {
					const result = await executeEmailAdminAction(action, entity, ctx, client);
					executed.push(result);
					break;
				}

				case 'create_output': {
					const result = await executeCreateOutputAction(action, entity, ctx, client);
					executed.push(result);
					break;
				}

				case 'create_doc_from_template': {
					const result = await executeCreateDocFromTemplateAction(
						action,
						entity,
						ctx,
						client
					);
					executed.push(result);
					break;
				}

				case 'create_research_doc': {
					const result = await executeCreateResearchDocAction(
						action,
						entity,
						ctx,
						client
					);
					executed.push(result);
					break;
				}

				case 'schedule_rrule': {
					const result = await executeScheduleRruleAction(action, entity, ctx, client);
					executed.push(result);
					break;
				}

				case 'run_llm_critique': {
					const result = await executeRunLlmCritiqueAction(action, entity, ctx, client);
					executed.push(result);
					break;
				}

				default:
					console.warn(`[FSM] Unknown action type: ${action.type}`);
			}
		} catch (err) {
			console.error(`[FSM] Action ${action.type} failed:`, err);
			// Continue executing other actions
		}
	}

	return executed;
}

// ============================================
// LOGGING
// ============================================

async function logTransition(
	entity: EntityRow,
	transition: FSMTransition,
	event: string,
	ctx: TransitionContext,
	actionsRun: string[]
): Promise<void> {
	// Future: Store transition logs in onto.transition_logs table
	// For now, console log for debugging
	console.log('[FSM Transition]', {
		entity_id: entity.id,
		type_key: entity.type_key,
		from: transition.from,
		to: transition.to,
		event,
		actor_id: ctx.actor_id,
		actions_run: actionsRun,
		timestamp: new Date().toISOString()
	});
}

// ============================================
// HELPERS
// ============================================

function isJsonObject(value: Json | JsonObject | null | undefined): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonObject(value: Json | JsonObject | null | undefined): JsonObject {
	return isJsonObject(value) ? (value as JsonObject) : {};
}

function getFacets(entity: EntityRow): Record<string, string> {
	const props = toJsonObject(entity.props);
	const rawFacets = props.facets;

	if (isJsonObject(rawFacets as Json | null | undefined)) {
		const result: Record<string, string> = {};
		for (const [key, value] of Object.entries(rawFacets as JsonObject)) {
			if (typeof value === 'string') {
				result[key] = value;
			}
		}
		return result;
	}

	return {};
}

function sanitizeFacets(input: FSMAction['facets']): Record<string, string> {
	const result: Record<string, string> = {};
	if (!input) return result;

	for (const [key, value] of Object.entries(input)) {
		if (typeof value === 'string') {
			result[key] = value;
		}
	}

	return result;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
	return path.split('.').reduce((acc: any, part) => acc?.[part], obj);
}

function kindToTable(kind: string): OntoTable {
	switch (kind) {
		case 'task':
			return 'onto_tasks';
		case 'output':
			return 'onto_outputs';
		case 'plan':
			return 'onto_plans';
		case 'document':
			return 'onto_documents';
		case 'project':
		default:
			return 'onto_projects';
	}
}

function kindToScope(kind: string): string {
	switch (kind) {
		case 'task':
			return 'task';
		case 'output':
			return 'output';
		case 'plan':
			return 'plan';
		case 'document':
			return 'document';
		case 'project':
		default:
			return 'project';
	}
}

function selectClauseForKind(kind: string): string {
	switch (kind) {
		case 'project':
			return 'id, type_key, state_key, props, name';
		case 'plan':
			return 'id, type_key, state_key, props, project_id, name';
		case 'task':
			return 'id, type_key, state_key, props, project_id, title, plan_id';
		case 'output':
			return 'id, type_key, state_key, props, project_id, name';
		case 'document':
			return 'id, type_key, state_key, props, project_id, title';
		default:
			return 'id, type_key, state_key, props, project_id';
	}
}

function getTableForEntity(entity: EntityRow): OntoTable {
	// Infer table from entity structure (could be passed explicitly)
	if ('plan_id' in entity && 'title' in entity) return 'onto_tasks';
	if ('name' in entity && entity.type_key?.startsWith('output.')) return 'onto_outputs';
	if ('title' in entity && entity.type_key?.startsWith('doc.')) return 'onto_documents';
	if ('name' in entity && entity.type_key?.includes('.')) return 'onto_plans';
	return 'onto_projects';
}

// ============================================
// EXPORTS
// ============================================

export type { TransitionContext, TransitionResult };
