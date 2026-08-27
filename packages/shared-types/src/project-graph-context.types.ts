// packages/shared-types/src/project-graph-context.types.ts
import type { Json } from './database.types';

type FieldKind = 'json' | 'nullableNumber' | 'nullableString' | 'string';
type ShapeSpec = Record<string, FieldKind>;

type FieldValue<TKind extends FieldKind> = TKind extends 'string'
	? string
	: TKind extends 'nullableString'
		? string | null
		: TKind extends 'nullableNumber'
			? number | null
			: Json;

type ParsedShape<TSpec extends ShapeSpec> = {
	[TKey in keyof TSpec]: FieldValue<TSpec[TKey]>;
};

const PROJECT_SPEC = {
	id: 'string',
	name: 'string',
	description: 'nullableString',
	type_key: 'string',
	state_key: 'string',
	facet_context: 'nullableString',
	facet_scale: 'nullableString',
	facet_stage: 'nullableString',
	start_at: 'nullableString',
	end_at: 'nullableString',
	next_step_short: 'nullableString',
	next_step_long: 'nullableString',
	created_at: 'string',
	updated_at: 'string'
} as const satisfies ShapeSpec;

const TASK_SPEC = {
	id: 'string',
	title: 'string',
	description: 'nullableString',
	state_key: 'string',
	type_key: 'string',
	priority: 'nullableNumber',
	start_at: 'nullableString',
	due_at: 'nullableString',
	completed_at: 'nullableString',
	created_at: 'string',
	updated_at: 'string'
} as const satisfies ShapeSpec;

const GOAL_SPEC = {
	id: 'string',
	name: 'string',
	goal: 'nullableString',
	description: 'nullableString',
	state_key: 'string',
	type_key: 'nullableString',
	target_date: 'nullableString',
	completed_at: 'nullableString',
	created_at: 'string',
	updated_at: 'nullableString'
} as const satisfies ShapeSpec;

const PLAN_SPEC = {
	id: 'string',
	name: 'string',
	description: 'nullableString',
	state_key: 'string',
	type_key: 'string',
	created_at: 'string',
	updated_at: 'string'
} as const satisfies ShapeSpec;

const MILESTONE_SPEC = {
	id: 'string',
	title: 'string',
	description: 'nullableString',
	state_key: 'string',
	type_key: 'nullableString',
	due_at: 'nullableString',
	completed_at: 'nullableString',
	created_at: 'string',
	updated_at: 'nullableString'
} as const satisfies ShapeSpec;

const RISK_SPEC = {
	id: 'string',
	title: 'string',
	content: 'nullableString',
	state_key: 'string',
	type_key: 'nullableString',
	impact: 'string',
	probability: 'nullableNumber',
	mitigated_at: 'nullableString',
	created_at: 'string',
	updated_at: 'nullableString'
} as const satisfies ShapeSpec;

const DOCUMENT_SPEC = {
	id: 'string',
	title: 'string',
	description: 'nullableString',
	state_key: 'string',
	type_key: 'string',
	created_at: 'string',
	updated_at: 'string'
} as const satisfies ShapeSpec;

const REQUIREMENT_SPEC = {
	id: 'string',
	text: 'string',
	priority: 'nullableNumber',
	type_key: 'string',
	created_at: 'string',
	updated_at: 'nullableString'
} as const satisfies ShapeSpec;

const SIGNAL_SPEC = {
	id: 'string',
	channel: 'string',
	ts: 'string',
	payload: 'json',
	created_at: 'string'
} as const satisfies ShapeSpec;

const INSIGHT_SPEC = {
	id: 'string',
	title: 'string',
	derived_from_signal_id: 'nullableString',
	props: 'json',
	created_at: 'string'
} as const satisfies ShapeSpec;

const EDGE_SPEC = {
	id: 'string',
	src_kind: 'string',
	src_id: 'string',
	rel: 'string',
	dst_kind: 'string',
	dst_id: 'string',
	project_id: 'string'
} as const satisfies ShapeSpec;

export type ProjectGraphContextProject = ParsedShape<typeof PROJECT_SPEC>;
export type ProjectGraphContextTask = ParsedShape<typeof TASK_SPEC>;
export type ProjectGraphContextGoal = ParsedShape<typeof GOAL_SPEC>;
export type ProjectGraphContextPlan = ParsedShape<typeof PLAN_SPEC>;
export type ProjectGraphContextMilestone = ParsedShape<typeof MILESTONE_SPEC>;
export type ProjectGraphContextRisk = ParsedShape<typeof RISK_SPEC>;
export type ProjectGraphContextDocument = ParsedShape<typeof DOCUMENT_SPEC>;
export type ProjectGraphContextRequirement = ParsedShape<typeof REQUIREMENT_SPEC>;
export type ProjectGraphContextSignal = ParsedShape<typeof SIGNAL_SPEC>;
export type ProjectGraphContextInsight = ParsedShape<typeof INSIGHT_SPEC>;
export type ProjectGraphContextEdge = ParsedShape<typeof EDGE_SPEC>;

/** Runtime contract returned by the load_project_graph_context JSON RPC. */
export interface ProjectGraphContext {
	project: ProjectGraphContextProject;
	tasks: ProjectGraphContextTask[];
	goals: ProjectGraphContextGoal[];
	plans: ProjectGraphContextPlan[];
	milestones: ProjectGraphContextMilestone[];
	risks: ProjectGraphContextRisk[];
	documents: ProjectGraphContextDocument[];
	requirements: ProjectGraphContextRequirement[];
	signals: ProjectGraphContextSignal[];
	insights: ProjectGraphContextInsight[];
	edges: ProjectGraphContextEdge[];
}

function isJsonObject(value: Json | undefined): value is { [key: string]: Json | undefined } {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesFieldKind(value: Json | undefined, kind: FieldKind): boolean {
	switch (kind) {
		case 'string':
			return typeof value === 'string';
		case 'nullableString':
			return value === null || typeof value === 'string';
		case 'nullableNumber':
			return value === null || (typeof value === 'number' && Number.isFinite(value));
		case 'json':
			return value !== undefined;
	}
}

function parseShape<TSpec extends ShapeSpec>(
	value: Json | undefined,
	label: string,
	spec: TSpec
): ParsedShape<TSpec> {
	if (!isJsonObject(value)) {
		throw new TypeError(`${label} must be a JSON object`);
	}

	for (const [key, kind] of Object.entries(spec)) {
		if (
			!Object.prototype.hasOwnProperty.call(value, key) ||
			!matchesFieldKind(value[key], kind)
		) {
			throw new TypeError(`${label}.${key} has an invalid ${kind} value`);
		}
	}

	// Every projected property has been checked against the matching runtime spec.
	return value as ParsedShape<TSpec>;
}

function parseShapeArray<TSpec extends ShapeSpec>(
	value: Json | undefined,
	label: string,
	spec: TSpec
): ParsedShape<TSpec>[] {
	if (!Array.isArray(value)) {
		throw new TypeError(`${label} must be a JSON array`);
	}
	return value.map((item, index) => parseShape(item, `${label}[${index}]`, spec));
}

/**
 * Decode and validate the JSON RPC response before domain code consumes it.
 * Throws with the first mismatched path so schema drift is visible to the worker.
 */
export function parseProjectGraphContext(value: Json): ProjectGraphContext {
	if (!isJsonObject(value)) {
		throw new TypeError('Project graph context must be a JSON object');
	}

	return {
		project: parseShape(value.project, 'project', PROJECT_SPEC),
		tasks: parseShapeArray(value.tasks, 'tasks', TASK_SPEC),
		goals: parseShapeArray(value.goals, 'goals', GOAL_SPEC),
		plans: parseShapeArray(value.plans, 'plans', PLAN_SPEC),
		milestones: parseShapeArray(value.milestones, 'milestones', MILESTONE_SPEC),
		risks: parseShapeArray(value.risks, 'risks', RISK_SPEC),
		documents: parseShapeArray(value.documents, 'documents', DOCUMENT_SPEC),
		requirements: parseShapeArray(value.requirements, 'requirements', REQUIREMENT_SPEC),
		signals: parseShapeArray(value.signals, 'signals', SIGNAL_SPEC),
		insights: parseShapeArray(value.insights, 'insights', INSIGHT_SPEC),
		edges: parseShapeArray(value.edges, 'edges', EDGE_SPEC)
	};
}
