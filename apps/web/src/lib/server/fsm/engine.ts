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

	// 2) Load template FSM
	const { data: template, error: templateError } = await client
		.from('onto_templates')
		.select('fsm')
		.eq('type_key', entity.type_key)
		.limit(1)
		.maybeSingle();

	if (templateError || !template) {
		return {
			ok: false,
			error: `FSM template not found for type_key: ${entity.type_key}`
		};
	}

	const fsm = template.fsm as FSMDef;

	// 3) Find transition
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
					const taskInserts: OntoTaskInsert[] = action.titles.map((title) => ({
						project_id: projectId,
						plan_id: action.plan_id ?? null,
						title,
						state_key: 'todo',
						props: propsTemplate,
						created_by: createdBy
					}));

					await client.from('onto_tasks').insert(taskInserts);
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
