// apps/web/src/routes/api/projects/[id]/+server.ts
import type { RequestHandler } from './$types';
import { cleanDataForTable, validateRequiredFields } from '$lib/utils/data-cleaner';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';
import { CalendarService } from '$lib/services/calendar-service';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const userId = user.id;

	try {
		const { data, error } = await supabase
			.from('projects')
			.select(
				`*,
                tasks (*)
            `
			)
			.eq('id', params.id)
			.eq('user_id', userId)
			.single();

		if (error) {
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({ project: data });
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
		const data = await parseRequestBody(request);
		if (!data) {
			return ApiResponse.badRequest('Invalid request body');
		}

		// Verify project ownership first
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('user_id')
			.eq('id', params.id)
			.single();

		if (projectError) {
			return ApiResponse.notFound('Project');
		}

		if (project.user_id !== user.id) {
			return ApiResponse.forbidden();
		}

		// Clean the project data - now includes context and executive_summary
		const cleanedData = cleanDataForTable('projects', data);

		// Validate required fields
		const validation = validateRequiredFields('projects', cleanedData, 'update');
		if (!validation.isValid && validation.missingFields[0] === 'id' && !params.id) {
			return ApiResponse.badRequest('Validation failed', {
				missingFields: validation.missingFields
			});
		}

		// Add updated timestamp
		cleanedData.updated_at = new Date().toISOString();

		const { data: updatedProject, error } = await supabase
			.from('projects')
			.update(cleanedData)
			.eq('id', params.id)
			.select()
			.single();

		if (error) {
			return ApiResponse.databaseError(error);
		}

		if (cleanedData.status === 'archived' || cleanedData.status === 'paused') {
			// remove all scheduled tasks when archiving or pausing

			const { data: tasks, error: tasksError } = await supabase
				.from('tasks')
				.select('*, task_calendar_events(*)')
				.eq('project_id', params.id)
				.eq('user_id', user.id);

			if (tasksError) {
				console.error('Error fetching tasks:', tasksError);
			}

			const taskCalendarEvents = (tasks ?? [])
				.filter((t) => t.task_calendar_events.length)
				.flatMap((task) => task.task_calendar_events);

			if (taskCalendarEvents && taskCalendarEvents.length > 0) {
				const calendarService = new CalendarService(supabase);
				const deletionResult = await calendarService.bulkDeleteCalendarEvents(
					taskCalendarEvents as any,
					user.id
				);

				// Log warnings if any
				if (deletionResult.warnings.length > 0) {
					console.warn('Calendar deletion warnings:', deletionResult.warnings);
				}
			}
		}

		return ApiResponse.success({ project: updatedProject });
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
		// Verify project ownership
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('user_id')
			.eq('id', params.id)
			.single();

		if (projectError) {
			return ApiResponse.notFound('Project');
		}

		if (project.user_id !== user.id) {
			return ApiResponse.forbidden();
		}

		// Delete all tasks associated with the project first (cascade delete)
		const { error: tasksError } = await supabase
			.from('tasks')
			.delete()
			.eq('project_id', params.id);

		if (tasksError) {
			console.error('Error deleting tasks:', tasksError);
		}

		// Delete the project
		const { error: deleteError } = await supabase
			.from('projects')
			.delete()
			.eq('id', params.id)
			.eq('user_id', user.id);

		if (deleteError) {
			return ApiResponse.databaseError(deleteError);
		}

		return ApiResponse.success({ message: 'Project deleted successfully' });
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};
