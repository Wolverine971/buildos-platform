// packages/agentic-chat-runtime/src/tools/ontology-detail-reads.ts
// Phase 4 Slice 18 S3-T6: direct detail reads shared by web routes and worker.

import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import { buildDetailNotFoundPayload, stripInternalPayloadFields } from './ontology-reads';
import { withComputedMilestoneState } from './milestone-state';

export interface SharedGetOntoGoalDetailsArgs {
	goal_id: string;
}

export interface SharedGetOntoPlanDetailsArgs {
	plan_id: string;
}

export interface SharedGetOntoMilestoneDetailsArgs {
	milestone_id: string;
}

export interface SharedGetOntoRiskDetailsArgs {
	risk_id: string;
}

export type DetailTable =
	| 'onto_tasks'
	| 'onto_goals'
	| 'onto_plans'
	| 'onto_documents'
	| 'onto_milestones'
	| 'onto_risks';

/** Identifies row-fetch failures separately from access-check failures for route parity. */
export class AgenticChatDetailReadQueryError extends Error {
	readonly name = 'AgenticChatDetailReadQueryError';
	readonly table: DetailTable;
	readonly cause: unknown;
	readonly code?: string;
	readonly projectId?: string;

	constructor(table: DetailTable, cause: unknown, projectId?: string) {
		const message =
			cause instanceof Error
				? cause.message
				: typeof (cause as { message?: unknown } | null)?.message === 'string'
					? String((cause as { message: string }).message)
					: `Failed to load ${table}`;
		super(message);
		this.table = table;
		this.cause = cause;
		this.projectId = projectId;
		const code = (cause as { code?: unknown } | null)?.code;
		if (typeof code === 'string') this.code = code;
	}
}

export async function loadReadableOntologyDetailRow(
	context: AgenticChatSharedReadContextV1,
	input: { table: DetailTable; id: string; selection: string }
): Promise<Record<string, any> | null> {
	const client = context.client as any;
	const { data: entityRef, error: refError } = await client
		.from(input.table)
		.select('id, project_id')
		.eq('id', input.id)
		.is('deleted_at', null)
		.maybeSingle();

	if (refError) throw new AgenticChatDetailReadQueryError(input.table, refError);
	if (!entityRef?.project_id) return null;

	// The worker uses a service-role client: gate on the minimal project ref
	// before fetching the full row, then fence the second query to the same
	// project in case the entity moves between the two reads.
	await context.access.assertProjectAccess(entityRef.project_id, 'read');

	const { data, error } = await client
		.from(input.table)
		.select(input.selection)
		.eq('id', input.id)
		.eq('project_id', entityRef.project_id)
		.is('deleted_at', null)
		.maybeSingle();

	if (error) {
		throw new AgenticChatDetailReadQueryError(input.table, error, entityRef.project_id);
	}
	return data ?? null;
}

export async function loadOntoGoalDetail(
	context: AgenticChatSharedReadContextV1,
	goalId: string
): Promise<{ goal: Record<string, any> } | null> {
	const row = await loadReadableOntologyDetailRow(context, {
		table: 'onto_goals',
		id: goalId,
		selection: '*, project:onto_projects!inner(id, name, created_by)'
	});
	if (!row) return null;
	const { project: _project, ...goal } = row;
	return { goal };
}

export async function getOntoGoalDetails(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetOntoGoalDetailsArgs
): Promise<Record<string, any>> {
	const details = await loadOntoGoalDetail(context, args.goal_id);
	if (!details) {
		return buildDetailNotFoundPayload({
			entityType: 'goal',
			idKey: 'goal_id',
			id: args.goal_id,
			searchTool: 'search_onto_goals'
		});
	}
	return {
		...stripInternalPayloadFields(details),
		message: 'Complete ontology goal details loaded.'
	};
}

export async function loadOntoPlanDetail(
	context: AgenticChatSharedReadContextV1,
	planId: string
): Promise<{ plan: Record<string, any> } | null> {
	const row = await loadReadableOntologyDetailRow(context, {
		table: 'onto_plans',
		id: planId,
		selection: '*, project:onto_projects!inner(id)'
	});
	if (!row) return null;
	const { project: _project, ...plan } = row;
	return { plan };
}

export async function getOntoPlanDetails(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetOntoPlanDetailsArgs
): Promise<Record<string, any>> {
	const details = await loadOntoPlanDetail(context, args.plan_id);
	if (!details) {
		return buildDetailNotFoundPayload({
			entityType: 'plan',
			idKey: 'plan_id',
			id: args.plan_id,
			listTool: 'list_onto_plans',
			searchTool: 'search_onto_plans'
		});
	}
	return {
		...stripInternalPayloadFields(details),
		message: 'Complete ontology plan details loaded.'
	};
}

/** Full route payload; the agent-specific document projection remains T4's getOntoDocumentDetails. */
export async function loadOntoDocumentApiDetail(
	context: AgenticChatSharedReadContextV1,
	documentId: string
): Promise<{ document: Record<string, any> } | null> {
	const document = await loadReadableOntologyDetailRow(context, {
		table: 'onto_documents',
		id: documentId,
		selection: '*'
	});
	return document ? { document } : null;
}

export async function loadOntoMilestoneDetail(
	context: AgenticChatSharedReadContextV1,
	milestoneId: string,
	now: Date = new Date()
): Promise<{ milestone: Record<string, any> } | null> {
	const row = await loadReadableOntologyDetailRow(context, {
		table: 'onto_milestones',
		id: milestoneId,
		selection: '*, project:onto_projects!inner(id, name)'
	});
	if (!row) return null;

	const { data: goalEdge, error: goalEdgeError } = await (context.client as any)
		.from('onto_edges')
		.select('src_id')
		.eq('project_id', row.project_id)
		.eq('src_kind', 'goal')
		.eq('dst_kind', 'milestone')
		.eq('dst_id', milestoneId)
		.eq('rel', 'has_milestone')
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (goalEdgeError) throw goalEdgeError;

	const decorated = withComputedMilestoneState(row, now);
	const { project, type_key: _typeKey, ...milestone } = decorated;
	return {
		milestone: {
			...milestone,
			goal_id: goalEdge?.src_id ?? null,
			project: { name: project.name }
		}
	};
}

export async function getOntoMilestoneDetails(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetOntoMilestoneDetailsArgs
): Promise<Record<string, any>> {
	const details = await loadOntoMilestoneDetail(context, args.milestone_id);
	if (!details) {
		return buildDetailNotFoundPayload({
			entityType: 'milestone',
			idKey: 'milestone_id',
			id: args.milestone_id,
			listTool: 'list_onto_milestones',
			searchTool: 'search_onto_milestones'
		});
	}
	return {
		...stripInternalPayloadFields(details),
		message: 'Complete ontology milestone details loaded.'
	};
}

export async function loadOntoRiskDetail(
	context: AgenticChatSharedReadContextV1,
	riskId: string
): Promise<{ risk: Record<string, any> } | null> {
	const row = await loadReadableOntologyDetailRow(context, {
		table: 'onto_risks',
		id: riskId,
		selection: '*, project:onto_projects!inner(id, name)'
	});
	if (!row) return null;
	const { project, ...risk } = row;
	return { risk: { ...risk, project: { name: project.name } } };
}

export async function getOntoRiskDetails(
	context: AgenticChatSharedReadContextV1,
	args: SharedGetOntoRiskDetailsArgs
): Promise<Record<string, any>> {
	const details = await loadOntoRiskDetail(context, args.risk_id);
	if (!details) {
		return buildDetailNotFoundPayload({
			entityType: 'risk',
			idKey: 'risk_id',
			id: args.risk_id,
			listTool: 'list_onto_risks',
			searchTool: 'search_onto_risks'
		});
	}
	return {
		...stripInternalPayloadFields(details),
		message: 'Complete ontology risk details loaded.'
	};
}
