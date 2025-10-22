// apps/web/src/routes/api/projects/[id]/phases/+server.ts

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ApiResponse, parseRequestBody, handleConditionalRequest } from '$lib/utils/api-response';
import { CalendarService } from '$lib/services/calendar-service';

// Feature flag to toggle between old and new implementation
const USE_RPC_FUNCTION = true;

// Get all phases for a project
export const GET: RequestHandler = async ({ params, locals, request }) => {
	const { safeGetSession, supabase } = locals;
	const projectId = params.id;

	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.error('Unauthorized', 401);
		}

		// Use new RPC function for optimized performance
		if (USE_RPC_FUNCTION) {
			const { data: rpcResult, error: rpcError } = await supabase.rpc(
				'get_project_phases_hierarchy',
				{
					p_project_id: projectId,
					p_user_id: user.id
				}
			);

			if (rpcError) {
				console.error('Error calling phases RPC:', rpcError);
				// Fall back to original implementation
				return handleOriginalPhasesQuery({ supabase, projectId, request });
			}

			// Check for authorization error in result
			if (rpcResult?.error === 'Unauthorized') {
				return ApiResponse.error('Unauthorized', 401);
			}

			// Process RPC result
			const phases = rpcResult?.phases || [];

			// Transform phases to match expected format
			const processedPhases = phases.map((phase: any) => ({
				...phase,
				// Rename calendar_events to task_calendar_events for compatibility
				tasks: (phase.tasks || []).map((task: any) => ({
					...task,
					task_calendar_events: task.calendar_events || []
				}))
			}));

			const responseData = { phases: processedPhases };

			// Check for conditional request (304 Not Modified)
			const conditionalResponse = handleConditionalRequest(request, responseData);
			if (conditionalResponse) {
				return conditionalResponse;
			}

			// Return without cache headers to ensure fresh data
			return ApiResponse.success(responseData);
		}

		// Fall back to original implementation
		return handleOriginalPhasesQuery({ supabase, projectId, request });
	} catch (error) {
		console.error('Error in phases API:', error);
		return ApiResponse.error('An unexpected error occurred');
	}
};

// Original implementation for fallback
async function handleOriginalPhasesQuery({ supabase, projectId, request }: any) {
	// Original query with complex nested JOINs
	const { data: phasesWithTasks, error: fetchError } = await supabase
		.from('phases')
		.select(
			`
			*,
			phase_tasks (
				task_id,
				suggested_start_date,
				assignment_reason,
				tasks (
					id,
					title,
					description,
					status,
					priority,
					task_type,
					start_date,
					deleted_at,
					created_at,
					updated_at,
					details,
					project_id,
					completed_at,
					task_calendar_events(
						id,
						calendar_event_id,
						calendar_id,
						event_start,
						event_end,
						event_link,
						sync_status,
						organizer_email,
						organizer_display_name,
						organizer_self,
						attendees
					)
				)
			)
		`
		)
		.eq('project_id', projectId)
		.order('order', { ascending: true });

	if (fetchError) {
		console.error('Error fetching phases with tasks:', fetchError);
		return ApiResponse.error('Failed to fetch phases');
	}

	// Process phases with their tasks
	const processedPhases = (phasesWithTasks || []).map((phase) => {
		const phaseTasks = (phase.phase_tasks || [])
			.filter((pt: any) => pt.tasks)
			.map((pt: any) => ({
				...pt.tasks,
				suggested_start_date: pt.suggested_start_date,
				assignment_reason: pt.assignment_reason
			}));

		const taskCount = phaseTasks.length;
		const completedTasks = phaseTasks.filter(
			(task: any) => task.status === 'done' || task.status === 'completed'
		).length;

		const { phase_tasks, ...phaseData } = phase;

		return {
			...phaseData,
			tasks: phaseTasks,
			task_count: taskCount,
			completed_tasks: completedTasks
		};
	});

	const responseData = { phases: processedPhases };

	const conditionalResponse = handleConditionalRequest(request, responseData);
	if (conditionalResponse) {
		return conditionalResponse;
	}

	// Return without cache headers to ensure fresh data
	return ApiResponse.success(responseData);
}

// Create a new phase
export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.error('Unauthorized', 401);
		}

		const { id: projectId } = params;
		const phaseData = await request.json();

		// Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id, start_date, end_date')
			.eq('id', projectId)
			.eq('user_id', user.id)
			.single();

		if (projectError || !project) {
			return ApiResponse.error('Project not found', 404);
		}

		// Validate phase dates if provided
		if (phaseData.start_date && phaseData.end_date) {
			const startDate = new Date(phaseData.start_date);
			const endDate = new Date(phaseData.end_date);

			if (startDate >= endDate) {
				return ApiResponse.error('End date must be after start date', 400);
			}

			// Validate against project boundaries
			if (project.start_date) {
				const projectStart = new Date(project.start_date);
				if (startDate < projectStart) {
					return ApiResponse.error(
						`Phase cannot start before project start date (${projectStart.toLocaleDateString()})`,
						400
					);
				}
			}

			if (project.end_date) {
				const projectEnd = new Date(project.end_date);
				if (endDate > projectEnd) {
					return ApiResponse.badRequest(
						`Phase cannot end after project end date (${projectEnd.toLocaleDateString()})`
					);
				}
			}

			// REMOVED: Overlap checking - now allowing overlapping phases
			// Optional: Check for overlaps and provide informational warning
			if (phaseData.check_overlaps) {
				const { data: existingPhases } = await supabase
					.from('phases')
					.select('id, name, start_date, end_date')
					.eq('project_id', projectId)
					.or(
						`start_date.lte.${phaseData.end_date},end_date.gte.${phaseData.start_date}`
					);

				if (existingPhases && existingPhases.length > 0) {
					const overlappingPhases = existingPhases.map((p) => p.name).join(', ');
					// Return success with warning instead of blocking
					const newPhase = await createPhaseRecord(
						supabase,
						projectId,
						user.id,
						phaseData
					);
					if (!newPhase) {
						return ApiResponse.databaseError(new Error('Failed to create phase'));
					}

					return ApiResponse.success({
						phase: newPhase,
						warning: `Phase created successfully but overlaps with: ${overlappingPhases}`,
						overlapping_phases: existingPhases
					});
				}
			}
		}

		// Create the phase
		const newPhase = await createPhaseRecord(supabase, projectId, user.id, phaseData);
		if (!newPhase) {
			return ApiResponse.databaseError(new Error('Failed to create phase'));
		}

		return ApiResponse.success({ phase: newPhase });
	} catch (error) {
		return ApiResponse.internalError(error);
	}
};

// Helper function to create phase record
async function createPhaseRecord(supabase: any, projectId: string, userId: string, phaseData: any) {
	// Get the highest order number
	const { data: maxOrderPhase } = await supabase
		.from('phases')
		.select('order')
		.eq('project_id', projectId)
		.order('order', { ascending: false })
		.limit(1)
		.single();

	const newOrder = maxOrderPhase ? maxOrderPhase.order + 1 : 1;

	// Create the phase
	const { data: newPhase, error: createError } = await supabase
		.from('phases')
		.insert({
			project_id: projectId,
			user_id: userId,
			name: phaseData.name || 'New Phase',
			description: phaseData.description || null,
			start_date: phaseData.start_date || new Date().toISOString().split('T')[0],
			end_date:
				phaseData.end_date ||
				new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
			order: newOrder
		})
		.select()
		.single();

	if (createError) {
		console.error('Error creating phase:', createError);
		return null;
	}

	return newPhase;
}

// Reorder phases with enhanced task date clearing
export const PUT: RequestHandler = async ({
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
		const body = await parseRequestBody(request);
		if (!body) {
			return ApiResponse.badRequest('Invalid request body');
		}
		const { phaseId, newOrder, updateDates, clearTaskDates = false } = body;

		// Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id')
			.eq('id', projectId)
			.eq('user_id', user.id)
			.single();

		if (projectError || !project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		// Get all phases for the project
		const { data: phases, error: phasesError } = await supabase
			.from('phases')
			.select('*')
			.eq('project_id', projectId)
			.order('order', { ascending: true });

		if (phasesError || !phases) {
			return json({ error: 'Failed to fetch phases' }, { status: 500 });
		}

		// Find the phase being moved
		const movingPhase = phases.find((p) => p.id === phaseId);
		if (!movingPhase) {
			return json({ error: 'Phase not found' }, { status: 404 });
		}

		const oldOrder = movingPhase.order;

		// Check if this is a significant reorder that requires clearing task dates
		const isSignificantReorder = Math.abs(newOrder - oldOrder) > 1 || clearTaskDates;

		// If clearing task dates, get all tasks in affected phases
		let affectedTaskIds: string[] = [];
		if (isSignificantReorder || clearTaskDates) {
			const { data: phaseTasks } = await supabase
				.from('phase_tasks')
				.select('task_id')
				.in(
					'phase_id',
					phases.map((p) => p.id)
				);

			if (phaseTasks) {
				affectedTaskIds = phaseTasks.map((pt) => pt.task_id);
			}
		}

		// Reorder phases
		const updates = [];
		for (const phase of phases) {
			let newPhaseOrder = phase.order;

			if (phase.id === phaseId) {
				newPhaseOrder = newOrder;
			} else if (oldOrder < newOrder && phase.order > oldOrder && phase.order <= newOrder) {
				newPhaseOrder = phase.order - 1;
			} else if (oldOrder > newOrder && phase.order < oldOrder && phase.order >= newOrder) {
				newPhaseOrder = phase.order + 1;
			}

			if (newPhaseOrder !== phase.order) {
				updates.push({
					id: phase.id,
					order: newPhaseOrder
				});
			}
		}

		// Use batch operations for all updates
		const { data: reorderResult, error: reorderError } = await supabase.rpc(
			'reorder_phases_with_tasks',
			{
				p_project_id: projectId,
				p_phase_updates: updates,
				p_clear_task_dates: isSignificantReorder,
				p_affected_task_ids: isSignificantReorder ? affectedTaskIds : null
			}
		);

		if (reorderError) {
			console.error('Error in batch phase reorder:', reorderError);
			return json({ error: 'Failed to reorder phases' }, { status: 500 });
		}

		// If task dates were cleared, also delete their calendar events
		if (isSignificantReorder && affectedTaskIds.length > 0) {
			try {
				// Get calendar events for affected tasks
				const { data: calendarEvents, error: fetchError } = await supabase
					.from('task_calendar_events')
					.select('calendar_event_id, calendar_id')
					.in('task_id', affectedTaskIds)
					.eq('user_id', user.id);

				if (!fetchError && calendarEvents && calendarEvents.length > 0) {
					const calendarService = new CalendarService(supabase);
					const deleteOperations = calendarEvents.map((event) => ({
						event_id: event.calendar_event_id,
						calendar_id: event.calendar_id || 'primary'
					}));

					const deleteResult = await calendarService.bulkDeleteCalendarEvents(
						user.id,
						deleteOperations,
						{ batchSize: 5 }
					);

					console.log(
						`Calendar sync after phase reorder: ${deleteResult.deleted} events deleted, ${deleteResult.failed} failed`
					);
				}
			} catch (calendarError) {
				console.error(
					'Failed to delete calendar events after phase reorder:',
					calendarError
				);
				// Don't fail the whole operation due to calendar sync issues
			}
		}

		// Update dates if requested using batch operation
		if (updateDates && updateDates[phaseId]) {
			const dateUpdates = [
				{
					id: phaseId,
					start_date: updateDates[phaseId].start_date,
					end_date: updateDates[phaseId].end_date
				}
			];

			const { error: dateError } = await supabase.rpc('batch_update_phase_dates', {
				p_project_id: projectId,
				p_updates: dateUpdates
			});

			if (dateError) {
				console.error('Error updating phase dates:', dateError);
				return json({ error: 'Failed to update phase dates' }, { status: 500 });
			}
		}

		return json({
			success: true,
			taskDatesCleared: true,
			affectedTaskCount: affectedTaskIds.length,
			message: `Phase reordered successfully. ${affectedTaskIds.length} task dates have been cleared.`
		});
	} catch (error) {
		console.error('Error in phase reordering:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		);
	}
};

// Update individual phase
export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { id: projectId } = params;
		const { phaseId, ...updateData } = await request.json();

		// Verify user owns the project and phase
		const { data: phase, error: phaseError } = await supabase
			.from('phases')
			.select('*, projects!inner(user_id)')
			.eq('id', phaseId)
			.eq('project_id', projectId)
			.eq('projects.user_id', user.id)
			.single();

		if (phaseError || !phase) {
			return json({ error: 'Phase not found' }, { status: 404 });
		}

		// Validate dates if being updated
		if (updateData.start_date && updateData.end_date) {
			const startDate = new Date(updateData.start_date);
			const endDate = new Date(updateData.end_date);

			if (startDate >= endDate) {
				return json({ error: 'End date must be after start date' }, { status: 400 });
			}

			// REMOVED: Overlap blocking - now allowing overlapping phases
			// Optional: Check for overlaps and provide informational warning
			if (updateData.check_overlaps) {
				const { data: existingPhases } = await supabase
					.from('phases')
					.select('id, name, start_date, end_date')
					.eq('project_id', projectId)
					.neq('id', phaseId)
					.or(
						`start_date.lte.${updateData.end_date},end_date.gte.${updateData.start_date}`
					);

				if (existingPhases && existingPhases.length > 0) {
					const overlappingPhases = existingPhases.map((p) => p.name).join(', ');

					// Proceed with update and return warning instead of blocking
					const updatedPhase = await performPhaseUpdate(
						supabase,
						phaseId,
						updateData,
						projectId
					);
					if (!updatedPhase) {
						return json({ error: 'Failed to update phase' }, { status: 500 });
					}

					return json({
						success: true,
						phase: updatedPhase,
						warning: `Phase updated successfully but now overlaps with: ${overlappingPhases}`,
						overlapping_phases: existingPhases.map((p) => p.name)
					});
				}
			}

			// Check if date changes affect task assignments (provide warning but don't block)
			const { data: phaseTasks } = await supabase
				.from('phase_tasks')
				.select(
					`
					task_id,
					tasks!inner(start_date, title)
				`
				)
				.eq('phase_id', phaseId);

			if (phaseTasks && phaseTasks.length > 0) {
				const conflictingTasks = [];

				for (const pt of phaseTasks) {
					const task = pt.tasks;
					if (task.start_date) {
						const taskDate = new Date(task.start_date);
						if (taskDate < startDate || taskDate > endDate) {
							conflictingTasks.push(task.title);
						}
					}
				}

				if (conflictingTasks.length > 0) {
					// Proceed with update and clear conflicting task dates
					const updatedPhase = await performPhaseUpdate(
						supabase,
						phaseId,
						updateData,
						projectId
					);
					if (!updatedPhase) {
						return json({ error: 'Failed to update phase' }, { status: 500 });
					}

					// Clear conflicting task dates
					await clearConflictingTaskDates(
						supabase,
						phaseId,
						startDate,
						endDate,
						projectId,
						user.id
					);

					return json({
						success: true,
						phase: updatedPhase,
						warning: `Phase updated successfully. ${conflictingTasks.length} task dates were cleared because they fell outside the new phase range: ${conflictingTasks.join(', ')}`,
						conflictingTasks,
						taskDatesCleared: true
					});
				}
			}
		}

		// Perform the update
		const updatedPhase = await performPhaseUpdate(supabase, phaseId, updateData, projectId);
		if (!updatedPhase) {
			return json({ error: 'Failed to update phase' }, { status: 500 });
		}

		return json({
			success: true,
			phase: updatedPhase
		});
	} catch (error) {
		console.error('Error updating phase:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		);
	}
};

// Helper function to perform phase update
async function performPhaseUpdate(
	supabase: any,
	phaseId: string,
	updateData: any,
	projectId: string
) {
	const { data: updatedPhase, error: updateError } = await supabase
		.from('phases')
		.update({
			...updateData,
			updated_at: new Date().toISOString()
		})
		.eq('id', phaseId)
		.select()
		.single();

	if (updateError) {
		console.error('Error updating phase:', updateError);
		return null;
	}

	return updatedPhase;
}

// Helper function to clear conflicting task dates
async function clearConflictingTaskDates(
	supabase: any,
	phaseId: string,
	startDate: Date,
	endDate: Date,
	projectId: string,
	userId?: string
) {
	// Get tasks that are now outside the phase range
	const { data: conflictingTasks } = await supabase
		.from('phase_tasks')
		.select(
			`
			task_id,
			tasks!inner(start_date)
		`
		)
		.eq('phase_id', phaseId);

	if (conflictingTasks) {
		const tasksToUpdate = [];

		for (const pt of conflictingTasks) {
			const task = pt.tasks;
			if (task.start_date) {
				const taskDate = new Date(task.start_date);
				if (taskDate < startDate || taskDate > endDate) {
					tasksToUpdate.push(pt.task_id);
				}
			}
		}

		if (tasksToUpdate.length > 0) {
			// Use batch operation to clear conflicting task dates
			const { error: batchError } = await supabase.rpc('reorder_phases_with_tasks', {
				p_project_id: projectId,
				p_phase_updates: [], // No phase order changes
				p_clear_task_dates: true,
				p_affected_task_ids: tasksToUpdate
			});

			if (batchError) {
				console.error('Error clearing task dates:', batchError);
				// Continue anyway - phase update was successful
			}

			// Also delete calendar events for tasks whose dates were cleared
			if (userId) {
				try {
					const { data: calendarEvents, error: fetchError } = await supabase
						.from('task_calendar_events')
						.select('calendar_event_id, calendar_id')
						.in('task_id', tasksToUpdate)
						.eq('user_id', userId);

					if (!fetchError && calendarEvents && calendarEvents.length > 0) {
						const calendarService = new CalendarService(supabase);
						const deleteOperations = calendarEvents.map((event) => ({
							event_id: event.calendar_event_id,
							calendar_id: event.calendar_id || 'primary'
						}));

						const deleteResult = await calendarService.bulkDeleteCalendarEvents(
							userId,
							deleteOperations,
							{ batchSize: 5 }
						);

						console.log(
							`Calendar sync after clearing conflicting task dates: ${deleteResult.deleted} events deleted, ${deleteResult.failed} failed`
						);
					}
				} catch (calendarError) {
					console.error(
						'Failed to delete calendar events after clearing conflicting task dates:',
						calendarError
					);
					// Don't fail the whole operation due to calendar sync issues
				}
			}
		}
	}
}

// Delete phase
export const DELETE: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { id: projectId } = params;
		const url = new URL(request.url);
		const phaseId = url.searchParams.get('phaseId');

		if (!phaseId) {
			return json({ error: 'Phase ID required' }, { status: 400 });
		}

		// Verify user owns the project and phase
		const { data: phase, error: phaseError } = await supabase
			.from('phases')
			.select('*, projects!inner(user_id)')
			.eq('id', phaseId)
			.eq('project_id', projectId)
			.eq('projects.user_id', user.id)
			.single();

		if (phaseError || !phase) {
			return json({ error: 'Phase not found' }, { status: 404 });
		}

		// Move all tasks in this phase to backlog (remove phase assignments)
		await supabase.from('phase_tasks').delete().eq('phase_id', phaseId);

		// Delete the phase
		const { error: deleteError } = await supabase.from('phases').delete().eq('id', phaseId);

		if (deleteError) {
			console.error('Error deleting phase:', deleteError);
			return json({ error: 'Failed to delete phase' }, { status: 500 });
		}

		return json({ success: true });
	} catch (error) {
		console.error('Error deleting phase:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		);
	}
};
