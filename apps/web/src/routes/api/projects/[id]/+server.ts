// apps/web/src/routes/api/projects/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

function toLegacyStatus(stateKey: string): 'active' | 'paused' | 'completed' | 'archived' {
	switch (stateKey) {
		case 'planning':
			return 'paused';
		case 'completed':
			return 'completed';
		case 'cancelled':
			return 'archived';
		case 'active':
		default:
			return 'active';
	}
}

function toProjectState(
	status: string | null | undefined
): 'planning' | 'active' | 'completed' | 'cancelled' {
	switch ((status || '').toLowerCase()) {
		case 'paused':
			return 'planning';
		case 'completed':
			return 'completed';
		case 'archived':
			return 'cancelled';
		case 'planning':
			return 'planning';
		case 'cancelled':
			return 'cancelled';
		case 'active':
		default:
			return 'active';
	}
}

function toLegacyTaskStatus(stateKey: string): 'backlog' | 'in_progress' | 'done' | 'blocked' {
	switch (stateKey) {
		case 'in_progress':
			return 'in_progress';
		case 'done':
			return 'done';
		case 'blocked':
			return 'blocked';
		case 'todo':
		default:
			return 'backlog';
	}
}

function toTaskState(
	status: string | null | undefined
): 'todo' | 'in_progress' | 'done' | 'blocked' {
	switch ((status || '').toLowerCase()) {
		case 'in_progress':
			return 'in_progress';
		case 'done':
			return 'done';
		case 'blocked':
			return 'blocked';
		case 'backlog':
		case 'todo':
		default:
			return 'todo';
	}
}

function hasProjectWriteAccess(supabase: App.Locals['supabase'], projectId: string) {
	return supabase.rpc('current_actor_has_project_access', {
		p_project_id: projectId,
		p_required_access: 'write'
	});
}

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		await ensureActorId(supabase, user.id);

		const { data: canRead, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: params.id,
				p_required_access: 'read'
			}
		);

		if (accessError) {
			return ApiResponse.databaseError(accessError);
		}

		if (!canRead) {
			return ApiResponse.notFound('Project');
		}

		const [{ data: project, error: projectError }, { data: tasks, error: tasksError }] =
			await Promise.all([
				supabase
					.from('onto_projects')
					.select('*')
					.eq('id', params.id)
					.is('deleted_at', null)
					.single(),
				supabase
					.from('onto_tasks')
					.select('*')
					.eq('project_id', params.id)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
			]);

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		if (tasksError) {
			return ApiResponse.databaseError(tasksError);
		}

		const mappedTasks = (tasks || []).map((task) => ({
			id: task.id,
			project_id: task.project_id,
			user_id: user.id,
			title: task.title,
			description: task.description ?? null,
			details:
				task.props && typeof task.props === 'object' && !Array.isArray(task.props)
					? (((task.props as Record<string, unknown>).details as string | null) ?? null)
					: null,
			status: toLegacyTaskStatus(task.state_key),
			priority:
				task.priority == null
					? 'medium'
					: task.priority >= 4
						? 'high'
						: task.priority <= 2
							? 'low'
							: 'medium',
			start_date: task.start_at,
			due_date: task.due_at,
			completed_at: task.completed_at,
			created_at: task.created_at,
			updated_at: task.updated_at
		}));

		return ApiResponse.success({
			project: {
				id: project.id,
				user_id: user.id,
				name: project.name,
				description: project.description,
				status: toLegacyStatus(project.state_key),
				state_key: project.state_key,
				start_date: project.start_at,
				end_date: project.end_at,
				slug: null,
				created_at: project.created_at,
				updated_at: project.updated_at,
				tasks: mappedTasks
			}
		});
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};

export const PUT: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		await ensureActorId(supabase, user.id);
		const { data: canWrite, error: accessError } = await hasProjectWriteAccess(
			supabase,
			params.id
		);

		if (accessError) {
			return ApiResponse.databaseError(accessError);
		}

		if (!canWrite) {
			return ApiResponse.forbidden();
		}

		const data = await parseRequestBody(request);
		if (!data) {
			return ApiResponse.badRequest('Invalid request body');
		}

		const projectUpdate: Record<string, unknown> = {
			updated_at: new Date().toISOString()
		};

		if (typeof data.name === 'string') projectUpdate.name = data.name.trim();
		if (typeof data.description === 'string' || data.description === null) {
			projectUpdate.description = data.description;
		}
		if (typeof data.status === 'string') {
			projectUpdate.state_key = toProjectState(data.status);
		}
		if (typeof data.start_date === 'string' || data.start_date === null) {
			projectUpdate.start_at = data.start_date;
		}
		if (typeof data.end_date === 'string' || data.end_date === null) {
			projectUpdate.end_at = data.end_date;
		}
		if (typeof data.next_step_short === 'string' || data.next_step_short === null) {
			projectUpdate.next_step_short = data.next_step_short;
		}
		if (typeof data.next_step_long === 'string' || data.next_step_long === null) {
			projectUpdate.next_step_long = data.next_step_long;
		}
		if (typeof data.next_step_source === 'string' || data.next_step_source === null) {
			projectUpdate.next_step_source = data.next_step_source;
		}
		if (typeof data.next_step_updated_at === 'string' || data.next_step_updated_at === null) {
			projectUpdate.next_step_updated_at = data.next_step_updated_at;
		}

		if (typeof data.status === 'string' && typeof data.next_step_source === 'undefined') {
			projectUpdate.next_step_source = 'user';
			projectUpdate.next_step_updated_at = new Date().toISOString();
		}

		if (typeof data.props === 'object' && data.props && !Array.isArray(data.props)) {
			projectUpdate.props = data.props;
		}

		const { data: updatedProject, error } = await supabase
			.from('onto_projects')
			.update(projectUpdate)
			.eq('id', params.id)
			.is('deleted_at', null)
			.select('*')
			.single();

		if (error) {
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({
			project: {
				...updatedProject,
				status: toLegacyStatus(updatedProject.state_key),
				slug: null,
				start_date: updatedProject.start_at,
				end_date: updatedProject.end_at,
				user_id: user.id
			}
		});
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const actorId = await ensureActorId(supabase, user.id);

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', params.id)
			.is('deleted_at', null)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden('Only the project owner can delete this project');
		}

		const { error: deleteError } = await supabase.rpc('delete_onto_project', {
			p_project_id: params.id
		});

		if (deleteError) {
			return ApiResponse.databaseError(deleteError);
		}

		return ApiResponse.success({ message: 'Project deleted successfully' });
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};
