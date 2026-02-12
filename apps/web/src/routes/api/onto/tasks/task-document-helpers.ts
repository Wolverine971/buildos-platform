// apps/web/src/routes/api/onto/tasks/task-document-helpers.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { Json } from '@buildos/shared-types';
import { isValidUUID } from '$lib/utils/operations/validation-utils';

export const TASK_DOCUMENT_REL = 'task_has_document';

type Locals = App.Locals;

export type TaskAccessResult =
	| {
			task: {
				id: string;
				title: string;
				project_id: string;
			};
			project: {
				id: string;
				created_by: string;
			};
			actorId: string;
	  }
	| { error: Response };

export async function ensureTaskAccess(
	locals: Locals,
	taskId: string,
	userId: string
): Promise<TaskAccessResult> {
	if (!isValidUUID(taskId)) {
		return { error: ApiResponse.badRequest('Invalid task_id: expected UUID') };
	}

	const supabase = locals.supabase;

	const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
		p_user_id: userId
	});

	if (actorError || !actorId) {
		console.error('[TaskDoc API] Failed to resolve actor:', actorError);
		return {
			error: ApiResponse.internalError(
				actorError || new Error('Failed to resolve user actor'),
				'Failed to resolve user identity'
			)
		};
	}

	const { data: task, error: taskError } = await supabase
		.from('onto_tasks')
		.select(
			`
				id,
				title,
				project_id,
				project:onto_projects!inner(
					id,
					created_by
				)
			`
		)
		.eq('id', taskId)
		.single();

	if (taskError) {
		console.error('[TaskDoc API] Failed to fetch task:', taskError);
		return { error: ApiResponse.databaseError(taskError) };
	}

	if (!task) {
		return { error: ApiResponse.notFound('Task') };
	}

	if (task.project.created_by !== actorId) {
		return { error: ApiResponse.forbidden('You do not have access to this task') };
	}

	const { project, ...taskData } = task;

	return {
		task: taskData,
		project,
		actorId
	};
}

export async function ensureTaskDocumentLink(
	locals: Locals,
	taskId: string,
	documentId: string
): Promise<
	| {
			edge: {
				id: string;
				props: Record<string, unknown> | null;
			};
	  }
	| { error: Response }
> {
	const supabase = locals.supabase;

	const { data: edge, error: edgeError } = await supabase
		.from('onto_edges')
		.select('id, props')
		.eq('src_kind', 'task')
		.eq('src_id', taskId)
		.eq('rel', TASK_DOCUMENT_REL)
		.eq('dst_kind', 'document')
		.eq('dst_id', documentId)
		.maybeSingle();

	if (edgeError) {
		console.error('[TaskDoc API] Failed to fetch task_has_document edge:', edgeError);
		return { error: ApiResponse.databaseError(edgeError) };
	}

	if (!edge) {
		return { error: ApiResponse.notFound('Document link not found for this task') };
	}

	return { edge: { id: edge.id, props: edge.props as Record<string, unknown> | null } };
}

export function mergeEdgeProps(
	edgeProps: Record<string, unknown> | null | undefined,
	newProps: Record<string, unknown>
): Json {
	return {
		...(edgeProps ?? {}),
		...newProps
	} as Json;
}
