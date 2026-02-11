// apps/web/src/routes/api/onto/goals/[id]/reverse/context.ts
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	ReverseEngineeringContextDocument,
	ReverseEngineeringExistingMilestone,
	ReverseEngineeringExistingTask
} from '$lib/services/ontology/goal-reverse-engineering.service';

export type GoalRow = {
	id: string;
	project_id: string;
	name: string;
	type_key: string | null;
	props: Record<string, unknown> | null;
};

export type ProjectRow = {
	id: string;
	name: string;
	description: string | null;
	state_key: string;
	type_key: string;
	props: Record<string, unknown> | null;
	created_by: string;
};

export class GoalReverseContextError extends Error {
	constructor(
		public code:
			| 'ACTOR_NOT_FOUND'
			| 'GOAL_NOT_FOUND'
			| 'PROJECT_NOT_FOUND'
			| 'FORBIDDEN'
			| 'CONTEXT_LOAD_FAILED',
		message?: string
	) {
		super(message || code);
	}
}

export interface GoalReverseContext {
	actorId: string;
	goal: GoalRow;
	project: ProjectRow;
	contextDocument: ReverseEngineeringContextDocument | null;
	existingMilestones: ReverseEngineeringExistingMilestone[];
	existingTasks: ReverseEngineeringExistingTask[];
}

export async function loadGoalReverseContext(
	supabase: SupabaseClient<Database>,
	userId: string,
	goalId: string
): Promise<GoalReverseContext> {
	const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
		p_user_id: userId
	});

	if (actorError || !actorId) {
		console.error('[Goal Reverse] Unable to resolve actor:', actorError);
		throw new GoalReverseContextError('ACTOR_NOT_FOUND');
	}

	const { data: goalRow, error: goalError } = await supabase
		.from('onto_goals')
		.select('id, project_id, name, type_key, props')
		.eq('id', goalId)
		.is('deleted_at', null)
		.maybeSingle<GoalRow>();

	if (goalError) {
		console.error('[Goal Reverse] Failed to fetch goal:', goalError);
		throw new GoalReverseContextError('GOAL_NOT_FOUND');
	}

	if (!goalRow) {
		throw new GoalReverseContextError('GOAL_NOT_FOUND');
	}

	const { data: projectRow, error: projectError } = await supabase
		.from('onto_projects')
		.select('id, name, description, state_key, type_key, props, created_by')
		.eq('id', goalRow.project_id)
		.is('deleted_at', null)
		.maybeSingle<ProjectRow>();

	if (projectError) {
		console.error('[Goal Reverse] Failed to fetch project:', projectError);
		throw new GoalReverseContextError('PROJECT_NOT_FOUND');
	}

	if (!projectRow) {
		throw new GoalReverseContextError('PROJECT_NOT_FOUND');
	}

	if (projectRow.created_by !== actorId) {
		throw new GoalReverseContextError('FORBIDDEN');
	}

	const contextDocument = await loadContextDocument(supabase, projectRow);

	const { data: existingMilestones, error: milestonesError } = await supabase
		.from('onto_milestones')
		.select('id, title, due_at')
		.eq('project_id', projectRow.id)
		.is('deleted_at', null)
		.order('due_at', { ascending: true });

	if (milestonesError) {
		console.error('[Goal Reverse] Failed to load milestones:', milestonesError);
		throw new GoalReverseContextError('CONTEXT_LOAD_FAILED');
	}

	const { data: existingTasks, error: tasksError } = await supabase
		.from('onto_tasks')
		.select('id, title, state_key, type_key')
		.eq('project_id', projectRow.id)
		.is('deleted_at', null)
		.order('created_at', { ascending: true })
		.limit(40);

	if (tasksError) {
		console.error('[Goal Reverse] Failed to load tasks:', tasksError);
		throw new GoalReverseContextError('CONTEXT_LOAD_FAILED');
	}

	// Fetch plan relationships for tasks via edges
	const taskIds = (existingTasks || []).map((t) => t.id);
	let taskPlanMap = new Map<string, string>();

	if (taskIds.length > 0) {
		const { data: taskPlanEdges } = await supabase
			.from('onto_edges')
			.select('src_id, dst_id')
			.eq('rel', 'has_task')
			.eq('src_kind', 'plan')
			.eq('dst_kind', 'task')
			.in('dst_id', taskIds);

		if (taskPlanEdges) {
			for (const edge of taskPlanEdges) {
				taskPlanMap.set(edge.dst_id, edge.src_id);
			}
		}
	}

	return {
		actorId: actorId as string,
		goal: goalRow,
		project: projectRow,
		contextDocument,
		existingMilestones: (existingMilestones || []).map((milestone) => ({
			id: milestone.id,
			title: milestone.title,
			due_at: milestone.due_at ?? null
		})) as ReverseEngineeringExistingMilestone[],
		existingTasks: (existingTasks || []).map((task) => ({
			id: task.id,
			title: task.title,
			state_key: task.state_key,
			plan_id: taskPlanMap.get(task.id) || null
		}))
	};
}

async function loadContextDocument(
	supabase: SupabaseClient<Database>,
	project: ProjectRow
): Promise<ReverseEngineeringContextDocument | null> {
	// Query context document via edge relationship
	const { data: contextEdge } = await supabase
		.from('onto_edges')
		.select('dst_id')
		.eq('src_kind', 'project')
		.eq('src_id', project.id)
		.eq('rel', 'has_context_document')
		.eq('dst_kind', 'document')
		.limit(1)
		.maybeSingle();

	const contextDocumentId = contextEdge?.dst_id || null;

	if (!contextDocumentId) {
		return null;
	}

	const { data: document, error: documentError } = await supabase
		.from('onto_documents')
		.select('id, title')
		.eq('id', contextDocumentId)
		.maybeSingle();

	if (documentError) {
		console.error('[Goal Reverse] Failed to load context document metadata:', documentError);
		return null;
	}

	const { data: version, error: versionError } = await supabase
		.from('onto_document_versions')
		.select('props')
		.eq('document_id', contextDocumentId)
		.order('number', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (versionError) {
		console.error('[Goal Reverse] Failed to load context document version:', versionError);
		return null;
	}

	const propsPayload = (version?.props as Record<string, unknown> | null) ?? null;
	const content = typeof propsPayload?.content === 'string' ? propsPayload.content : null;

	if (!content) {
		return null;
	}

	return {
		title: document?.title ?? 'Project Context',
		content
	};
}
