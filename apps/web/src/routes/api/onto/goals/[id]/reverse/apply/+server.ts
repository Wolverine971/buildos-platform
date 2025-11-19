// apps/web/src/routes/api/onto/goals/[id]/reverse/apply/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import type { Json } from '@buildos/shared-types';
import { GoalReverseContextError, loadGoalReverseContext } from '../context';

const SOURCE_TAG = 'goal_reverse_engineering_v1';
const DEFAULT_TASK_PRIORITY = 3;
const DEFAULT_TASK_STATE = 'todo';

type ApplyTaskInput = {
	title?: string;
	description?: string | null;
	state_key?: string | null;
	priority?: number | null;
};

type ApplyMilestoneInput = {
	title?: string;
	due_at?: string | null;
	summary?: string | null;
	type_key?: string | null;
	confidence?: number | null;
	tasks?: ApplyTaskInput[];
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const goalId = params.id;
	if (!goalId) {
		return ApiResponse.badRequest('Goal ID is required');
	}

	const body = await request.json().catch(() => null);
	const milestonesInput = (body?.milestones ?? []) as ApplyMilestoneInput[];

	if (!Array.isArray(milestonesInput) || milestonesInput.length === 0) {
		return ApiResponse.badRequest('At least one milestone is required');
	}

	const supabase = locals.supabase;

	try {
		const context = await loadGoalReverseContext(supabase, user.id, goalId);

		const sanitizedMilestones = sanitizeMilestones(milestonesInput);

		if (!sanitizedMilestones.length) {
			return ApiResponse.badRequest('Add at least one milestone with a task before applying');
		}

		const insertedMilestones: Array<{ id: string; title: string }> = [];
		const taskInserts: Array<{
			project_id: string;
			title: string;
			state_key: string;
			priority: number | null;
			plan_id: string | null;
			due_at: string | null;
			props: Json;
			created_by: string;
		}> = [];

		for (const [index, milestone] of sanitizedMilestones.entries()) {
			const dueAt = resolveDueDate(milestone.due_at, index);

			const milestonePayload = {
				project_id: context.project.id,
				title: truncate(milestone.title, 140),
				type_key: milestone.type_key ?? 'milestone.standard',
				due_at: dueAt,
				props: buildMilestoneProps(milestone.summary, milestone.confidence, goalId),
				created_by: context.actorId
			};

			const { data: insertedMilestone, error: milestoneInsertError } = await supabase
				.from('onto_milestones')
				.insert(milestonePayload)
				.select('id, title')
				.single();

			if (milestoneInsertError || !insertedMilestone) {
				console.error('[Goal Reverse] Failed to insert milestone:', milestoneInsertError);
				return ApiResponse.databaseError(
					milestoneInsertError ?? new Error('Milestone insert failed')
				);
			}

			insertedMilestones.push(insertedMilestone);

			for (const task of milestone.tasks) {
				taskInserts.push({
					project_id: context.project.id,
					title: truncate(task.title, 200),
					state_key: normalizeTaskState(task.state_key),
					priority: normalizePriority(task.priority),
					plan_id: null,
					due_at: null,
					props: buildTaskProps(
						task.description,
						task.priority,
						goalId,
						insertedMilestone.id
					),
					created_by: context.actorId
				});
			}
		}

		let insertedTasks: Array<{ id: string; props: Record<string, unknown> | null }> = [];

		if (taskInserts.length) {
			const { data: taskRows, error: taskInsertError } = await supabase
				.from('onto_tasks')
				.insert(taskInserts)
				.select('id, props');

			if (taskInsertError) {
				console.error('[Goal Reverse] Failed to insert tasks:', taskInsertError);
				return ApiResponse.databaseError(taskInsertError);
			}

			insertedTasks = taskRows || [];
		}

		const edgePayloads: Array<{
			src_kind: string;
			src_id: string;
			rel: string;
			dst_kind: string;
			dst_id: string;
			props: Json;
		}> = [];

		for (const milestone of insertedMilestones) {
			edgePayloads.push(
				buildEdgePayload(
					'project',
					context.project.id,
					'contains',
					'milestone',
					milestone.id
				),
				buildEdgePayload('goal', goalId, 'supports_goal', 'milestone', milestone.id)
			);
		}

		for (const task of insertedTasks) {
			const props = (task.props as Record<string, unknown> | null) ?? null;
			const supportingMilestoneId = props?.supporting_milestone_id as string | undefined;
			edgePayloads.push(
				buildEdgePayload('project', context.project.id, 'contains', 'task', task.id),
				buildEdgePayload('goal', goalId, 'supports_goal', 'task', task.id)
			);
			if (supportingMilestoneId) {
				edgePayloads.push(
					buildEdgePayload(
						'milestone',
						supportingMilestoneId,
						'contains',
						'task',
						task.id
					)
				);
			}
		}

		if (edgePayloads.length) {
			const { error: edgeError } = await supabase.from('onto_edges').insert(edgePayloads);
			if (edgeError) {
				console.error('[Goal Reverse] Failed to insert edges:', edgeError);
			}
		}

		return ApiResponse.success({
			milestones_created: insertedMilestones.length,
			tasks_created: insertedTasks.length
		});
	} catch (error) {
		console.error('[Goal Reverse] Apply error:', error);
		if (error instanceof GoalReverseContextError) {
			switch (error.code) {
				case 'GOAL_NOT_FOUND':
					return ApiResponse.notFound('Goal');
				case 'PROJECT_NOT_FOUND':
					return ApiResponse.notFound('Project');
				case 'FORBIDDEN':
					return ApiResponse.forbidden('You do not have access to this goal');
				default:
					return ApiResponse.internalError(
						error,
						'Failed to load reverse engineering context'
					);
			}
		}
		return ApiResponse.internalError(error, 'Failed to apply goal reverse engineering plan');
	}
};

function sanitizeMilestones(inputs: ApplyMilestoneInput[]) {
	return inputs
		.map((milestone) => {
			const tasks = Array.isArray(milestone.tasks)
				? milestone.tasks
						.map((task) => ({
							title: (task.title ?? '').trim(),
							description: (task.description ?? '')?.trim() || null,
							state_key: task.state_key ?? DEFAULT_TASK_STATE,
							priority:
								typeof task.priority === 'number'
									? task.priority
									: DEFAULT_TASK_PRIORITY
						}))
						.filter((task) => task.title.length > 0)
				: [];

			return {
				title: (milestone.title ?? '').trim() || 'Milestone',
				due_at: (milestone.due_at ?? null) as string | null,
				summary: (milestone.summary ?? '')?.trim() || null,
				type_key: milestone.type_key ?? undefined,
				confidence:
					typeof milestone.confidence === 'number' ? milestone.confidence : undefined,
				tasks
			};
		})
		.filter((milestone) => milestone.tasks.length > 0);
}

function truncate(value: string, maxLength: number): string {
	if (!value) return '';
	if (value.length <= maxLength) {
		return value;
	}
	return value.slice(0, Math.max(0, maxLength - 3)).trimEnd() + '...';
}

function resolveDueDate(dueAt: string | null, position: number): string {
	if (dueAt) {
		const parsed = new Date(dueAt);
		if (!Number.isNaN(parsed.getTime())) {
			return parsed.toISOString();
		}
	}

	const fallback = new Date();
	fallback.setUTCDate(fallback.getUTCDate() + 14 * (position + 1));
	return fallback.toISOString();
}

function normalizeTaskState(state?: string | null): string {
	if (!state) return DEFAULT_TASK_STATE;
	const normalized = state.toLowerCase().replace(/\s+/g, '_');
	const allowed = new Set(['todo', 'in_progress', 'done', 'blocked']);
	return allowed.has(normalized) ? normalized : DEFAULT_TASK_STATE;
}

function normalizePriority(priority?: number | null): number | null {
	if (priority === null || priority === undefined) {
		return DEFAULT_TASK_PRIORITY;
	}
	const value = Math.round(priority);
	if (Number.isNaN(value)) {
		return DEFAULT_TASK_PRIORITY;
	}
	return Math.min(5, Math.max(1, value));
}

function buildMilestoneProps(
	summary: string | null,
	confidence: number | undefined,
	goalId: string
) {
	const props: Record<string, unknown> = {
		source: SOURCE_TAG,
		goal_id: goalId
	};

	if (summary) {
		props.summary = summary;
	}

	if (typeof confidence === 'number') {
		props.confidence = confidence;
	}

	return props as Json;
}

function buildTaskProps(
	description: string | null,
	priority: number | null | undefined,
	goalId: string,
	milestoneId: string
): Json {
	const props: Record<string, unknown> = {
		source: SOURCE_TAG,
		goal_id: goalId,
		source_goal_id: goalId,
		supporting_milestone_id: milestoneId
	};

	if (description) {
		props.description = description;
	}

	if (typeof priority === 'number') {
		props.priority = priority;
	}

	return props as Json;
}

function buildEdgePayload(
	srcKind: string,
	srcId: string,
	rel: string,
	dstKind: string,
	dstId: string
) {
	return {
		src_kind: srcKind,
		src_id: srcId,
		rel,
		dst_kind: dstKind,
		dst_id: dstId,
		props: { source: SOURCE_TAG } as Json
	};
}
