// apps/web/src/routes/api/projects/[id]/tasks/+server.ts
import type { RequestHandler } from './$types';
import { CalendarService, CalendarConnectionError } from '$lib/services/calendar-service';
import { sanitizeTaskData } from '$lib/utils/sanitize-data';
import { ApiResponse, parseRequestBody, validateRequiredFields } from '$lib/utils/api-response';
import { validatePagination } from '$lib/utils/api-helpers';

export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const { id: projectId } = params;
		const data = await parseRequestBody(request);
		if (!data) {
			return ApiResponse.badRequest('Invalid request body');
		}

		const warnings: string[] = [];
		const errors: string[] = [];

		// Validate required fields
		const validation = validateRequiredFields(data, ['title']);
		if (!validation.valid) {
			return ApiResponse.validationError(validation.missing!, 'This field is required');
		}

		// Verify user owns the project and get project details for validation
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id, user_id, start_date, end_date, name')
			.eq('id', projectId)
			.eq('user_id', user.id)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		// Validate start_date against project boundaries if provided
		if (data.start_date) {
			const taskDate = new Date(data.start_date);

			if (project.start_date && taskDate < new Date(project.start_date)) {
				return ApiResponse.badRequest(
					`Task date cannot be before project start date (${new Date(project.start_date).toLocaleDateString()})`
				);
			}

			if (project.end_date && taskDate > new Date(project.end_date)) {
				return ApiResponse.badRequest(
					`Task date cannot be after project end date (${new Date(project.end_date).toLocaleDateString()})`
				);
			}
		}

		// Apply project end date logic for recurring tasks
		if (data.task_type === 'recurring') {
			if (!data.recurrence_ends && project.end_date) {
				// Inherit project end date if no explicit end date is set
				data.recurrence_ends = project.end_date;
				data.recurrence_end_source = 'project_inherited';
			} else if (data.recurrence_ends) {
				// User specified an end date
				data.recurrence_end_source = 'user_specified';
			} else {
				// No end date and project has no end date - indefinite
				data.recurrence_end_source = 'indefinite';
			}
		}

		// Sanitize the task data to only include valid task table fields
		const sanitizedData = sanitizeTaskData({
			...data,
			user_id: user.id,
			project_id: projectId
		});

		// Create the task
		const { data: task, error: createError } = await supabase
			.from('tasks')
			.insert(sanitizedData)
			.select('*')
			.single();

		if (createError) {
			return ApiResponse.databaseError(createError);
		}

		// Handle phase assignment if start_date is provided
		if (task.start_date) {
			await handlePhaseAssignment(task.id, projectId, task.start_date, supabase);
		}

		// Auto-schedule to calendar if start_date and duration are provided
		if (task.start_date && task.duration_minutes) {
			try {
				// Check if user has calendar connected
				const { data: calendarTokens } = await supabase
					.from('user_calendar_tokens')
					.select('access_token, refresh_token, expiry_date')
					.eq('user_id', user.id)
					.single();

				if (
					calendarTokens &&
					'access_token' in calendarTokens &&
					calendarTokens.access_token
				) {
					const calendarService = new CalendarService(supabase);

					// Calculate calendar event times
					const startDate = new Date(task.start_date);
					// Default to 9am if no specific time
					if (startDate.getHours() === 0 && startDate.getMinutes() === 0) {
						startDate.setHours(9, 0, 0, 0);
					}

					// Call the typed scheduleTask method
					// The service will handle recurrence based on the task's settings
					// and will also handle the task_calendar_events database operations
					await calendarService.scheduleTask(user.id, {
						task_id: task.id,
						start_time: startDate.toISOString(),
						duration_minutes: task.duration_minutes,
						calendar_id: 'primary',
						description: `Task: ${task.title}\nProject: ${project.name}`,
						timeZone: data.timeZone,
						// Pass recurrence parameters if task is recurring
						// The service will use these OR the task's own settings
						recurrence_pattern:
							task.task_type === 'recurring' && task.recurrence_pattern
								? task.recurrence_pattern
								: undefined,
						recurrence_ends:
							task.task_type === 'recurring' && task.recurrence_ends
								? task.recurrence_ends
								: undefined
					});

					// Note: The CalendarService.scheduleTask method already handles:
					// - Creating the task_calendar_events record
					// - Setting is_master_event for recurring tasks
					// - Storing the RRULE in recurrence_rule column
					// So we don't need any additional database operations here
				}
			} catch (calendarError) {
				console.error('Error auto-scheduling task to calendar:', calendarError);

				if (calendarError instanceof CalendarConnectionError) {
					errors.push(
						'Task created successfully, but calendar connection expired. Please reconnect your Google Calendar to schedule tasks automatically.'
					);
				} else {
					warnings.push(
						'Task created successfully, but failed to add to calendar. You can manually add it later.'
					);
				}
			}
		}

		// Fetch the final task with all related data
		const { data: finalTask } = await supabase
			.from('tasks')
			.select(
				`
				*,
				task_calendar_events(
					id,
					calendar_event_id,
					calendar_id,
					event_start,
					event_end,
					event_link,
					event_title,
					sync_status,
					sync_error,
					last_synced_at,
					organizer_email,
					organizer_display_name,
					organizer_self,
					attendees
				),
				phase_tasks(
					id,
					phase_id,
					suggested_start_date,
					phases(
						id,
						name,
						start_date,
						end_date
					)
				)
			`
			)
			.eq('id', task.id)
			.single();

		return ApiResponse.success({
			task: finalTask || task,
			warnings: warnings.length > 0 ? warnings : undefined,
			errors: errors.length > 0 ? errors : undefined
		});
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};

/**
 * Handle phase assignment logic for new tasks
 */
async function handlePhaseAssignment(
	taskId: string,
	projectId: string,
	startDate: string,
	supabase: any
) {
	try {
		// Find appropriate phase for the start_date
		const { data: phases } = await supabase
			.from('phases')
			.select('id, name, start_date, end_date, order')
			.eq('project_id', projectId)
			.order('order', { ascending: true });

		let targetPhase = null;

		if (phases) {
			const taskDate = new Date(startDate);

			for (const phase of phases) {
				const phaseStart = new Date(phase.start_date);
				const phaseEnd = new Date(phase.end_date);
				phaseEnd.setHours(23, 59, 59, 999);

				if (taskDate >= phaseStart && taskDate <= phaseEnd) {
					targetPhase = phase;
					break;
				}
			}
		}

		// Add to phase if found
		if (targetPhase) {
			// Get the maximum order for this phase to append at the end
			const { data: maxOrderTask } = await supabase
				.from('phase_tasks')
				.select('order')
				.eq('phase_id', targetPhase.id)
				.order('order', { ascending: false })
				.limit(1)
				.maybeSingle();

			const newOrder = maxOrderTask ? maxOrderTask.order + 1 : 1;

			await supabase.from('phase_tasks').insert({
				phase_id: targetPhase.id,
				task_id: taskId,
				suggested_start_date: startDate,
				assignment_reason: 'Automatic assignment based on date',
				order: newOrder
			});
		}
	} catch (error) {
		console.error('Error in phase assignment:', error);
		// Don't fail task creation for phase assignment errors
	}
}

export const GET: RequestHandler = async ({
	params,
	url,
	locals: { supabase, safeGetSession }
}) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const { id: projectId } = params;

		// Validate pagination parameters (security fix: 2026-01-03)
		const { page, limit, offset } = validatePagination(url, {
			defaultLimit: 100,
			maxLimit: 500
		});

		// PERFORMANCE: Single optimized query with strategic field selection
		// Uses LEFT joins to include tasks without calendar events/phases
		const {
			data: tasks,
			error,
			count
		} = await supabase
			.from('tasks')
			.select(
				`
				*,
				task_calendar_events(
					id,
					calendar_event_id,
					calendar_id,
					event_start,
					event_end,
					event_link,
					event_title,
					sync_status,
					sync_error,
					last_synced_at
				),
				phase_tasks(
					id,
					phase_id,
					suggested_start_date,
					phases(
						id,
						name,
						start_date,
						end_date
					)
				)
			`,
				{ count: 'exact' }
			)
			.eq('project_id', projectId)
			.eq('user_id', user.id)
			.is('deleted_at', null)
			.order('created_at', { ascending: false })
			.range(offset, offset + limit - 1);

		if (error) {
			throw error;
		}

		const total = count ?? 0;
		const hasMore = offset + (tasks?.length ?? 0) < total;

		return ApiResponse.success({
			tasks,
			pagination: {
				page,
				limit,
				total,
				hasMore
			}
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to fetch tasks');
	}
};
