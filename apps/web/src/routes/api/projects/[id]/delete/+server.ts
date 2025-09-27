// src/routes/api/projects/[id]/delete/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CalendarService, CalendarConnectionError } from '$lib/services/calendar-service';

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const projectId = params.id;
	const userId = user.id;

	try {
		const warnings: string[] = [];
		const errors: string[] = [];

		// Start a transaction by deleting in the correct order to respect foreign key constraints

		// 1. Delete project_daily_briefs
		const { error: briefsError } = await supabase
			.from('project_daily_briefs')
			.delete()
			.eq('project_id', projectId)
			.eq('user_id', userId);

		if (briefsError) {
			console.error('Error deleting project briefs:', briefsError);
			throw new Error('Failed to delete project briefs');
		}

		const { data: tasks, error: tasksGetError } = await supabase
			.from('tasks')
			.select('id')
			.eq('project_id', projectId);

		if (tasks && !tasksGetError) {
			const { error: brainDumpLinksDeleteTasksError } = await supabase
				.from('brain_dump_links')
				.delete()
				.in(
					'task_id',
					tasks.map((p) => p.id)
				);
			if (brainDumpLinksDeleteTasksError) {
				console.error(
					'Error deleting brain dump links to tasks:',
					brainDumpLinksDeleteTasksError
				);
				throw new Error('Failed to delete brain dump links to tasks');
			}
		}

		const { data: notes, error: notesGetError } = await supabase
			.from('notes')
			.select('id')
			.eq('project_id', projectId);

		if (notes && !notesGetError) {
			const { error: brainDumpLinksDeleteNotesError } = await supabase
				.from('brain_dump_links')
				.delete()
				.in(
					'note_id',
					notes.map((p) => p.id)
				);
			if (brainDumpLinksDeleteNotesError) {
				console.error(
					'Error deleting brain dump links to notes:',
					brainDumpLinksDeleteNotesError
				);
				throw new Error('Failed to delete brain dump links to notes');
			}
		}

		const { error: brainDumpLinksError } = await supabase
			.from('brain_dump_links')
			.delete()
			.eq('project_id', projectId);

		if (brainDumpLinksError) {
			console.error('Error deleting brain dump links:', brainDumpLinksError);
			throw new Error('Failed to delete brain dump links');
		}

		// 2. Delete project_questions
		const { error: projectQuestionsError } = await supabase
			.from('project_questions')
			.delete()
			.eq('project_id', projectId)
			.eq('user_id', userId);

		if (projectQuestionsError) {
			console.error('Error deleting project questions:', projectQuestionsError);
			throw new Error('Failed to delete project questions');
		}

		// 3. Delete notes
		const { error: notesError } = await supabase
			.from('notes')
			.delete()
			.eq('project_id', projectId)
			.eq('user_id', userId);

		if (notesError) {
			console.error('Error deleting notes:', notesError);
			throw new Error('Failed to delete notes');
		}

		// 4. Delete calendar events associated with all tasks in the project
		if (tasks && tasks.length > 0) {
			const { data: calendarEvents, error: calendarEventsError } = await supabase
				.from('task_calendar_events')
				.select('id, calendar_event_id, calendar_id, task_id')
				.in(
					'task_id',
					tasks.map((task) => task.id)
				);

			if (calendarEvents && calendarEvents.length > 0 && !calendarEventsError) {
				const calendarResults = await handleCalendarEventDeletion(
					calendarEvents,
					userId,
					supabase
				);
				warnings.push(...calendarResults.warnings);
				errors.push(...calendarResults.errors);
			}
		}

		// 5. Delete tasks
		const { error: tasksError } = await supabase
			.from('tasks')
			.delete()
			.eq('project_id', projectId);

		if (tasksError) {
			console.error('Error deleting tasks:', tasksError);
			throw new Error('Failed to delete tasks');
		}

		// 6. Delete project_synthesis
		const { error: synthesisError } = await supabase
			.from('project_synthesis')
			.delete()
			.eq('project_id', projectId)
			.eq('user_id', userId);

		if (synthesisError) {
			console.error('Error deleting project synthesis:', synthesisError);
			throw new Error('Failed to delete project synthesis');
		}

		// 7. Delete phase_tasks (if you have phases)
		const { data: phasesData, error: phasesDataError } = await supabase
			.from('phases')
			.select('*')
			.eq('project_id', projectId);

		if (phasesDataError) {
			console.error('Error getting phases data:', phasesDataError);
		}

		// Delete phase_tasks for all phases at once
		if (phasesData && phasesData.length > 0) {
			const phaseIds = phasesData.map((p) => p.id);
			const { error: phaseTasksError } = await supabase
				.from('phase_tasks')
				.delete()
				.in('phase_id', phaseIds);
			if (phaseTasksError) {
				console.error('Error deleting phase tasks:', phaseTasksError);
			}
		}

		// 8. Delete phases
		const { error: phasesError } = await supabase
			.from('phases')
			.delete()
			.eq('project_id', projectId);

		if (phasesError) {
			console.error('Error deleting phases:', phasesError);
		}

		// 9. Update brain dumps to remove project association
		const { error: brainDumpError } = await supabase
			.from('brain_dumps')
			.update({
				project_id: null
			})
			.eq('project_id', projectId)
			.eq('user_id', userId);

		if (brainDumpError) {
			console.error('Error updating brain dumps:', brainDumpError);
			throw new Error('Failed to update brain dumps');
		}

		const { error: projectBriefTemplatesError } = await supabase
			.from('project_brief_templates')
			.delete()
			.eq('project_id', projectId)
			.eq('user_id', userId);

		if (projectBriefTemplatesError) {
			console.error('Error deleting project brief templates:', projectBriefTemplatesError);
			throw new Error('Failed to delete project brief templates');
		}

		// 10. Finally, delete the project itself
		const { error: projectError } = await supabase
			.from('projects')
			.delete()
			.eq('id', projectId)
			.eq('user_id', userId);

		if (projectError) {
			console.error('Error deleting project:', projectError);
			throw new Error('Failed to delete project');
		}

		return json({
			success: true,
			warnings: warnings.length > 0 ? warnings : undefined,
			errors: errors.length > 0 ? errors : undefined
		});
	} catch (error) {
		console.error('Error in delete project handler:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to delete project' },
			{ status: 500 }
		);
	}
};

/**
 * Handle calendar event deletion with comprehensive error handling
 */
async function handleCalendarEventDeletion(
	calendarEvents: any[],
	userId: string,
	supabase: any
): Promise<{ warnings: string[]; errors: string[] }> {
	const calendarService = new CalendarService(supabase);
	const warnings: string[] = [];
	const errors: string[] = [];
	let successCount = 0;
	let failCount = 0;

	for (const event of calendarEvents) {
		try {
			await calendarService.deleteCalendarEvent(userId, {
				event_id: event.calendar_event_id,
				calendar_id: event.calendar_id || 'primary'
			});

			successCount++;
		} catch (calendarError: any) {
			console.error('Error deleting calendar event:', calendarError);
			failCount++;

			if (calendarError instanceof CalendarConnectionError) {
				errors.push(
					'Calendar connection expired. Some events could not be removed from your calendar.'
				);
			} else {
				warnings.push(
					`Failed to remove calendar event: ${calendarError?.message || 'Unknown error'}`
				);
			}

			// Mark as error in database
			await supabase
				.from('task_calendar_events')
				.update({
					sync_status: 'error',
					sync_error: calendarError?.message || 'Unknown error',
					last_synced_at: new Date().toISOString()
				})
				.eq('id', event.id);
		}
	}

	// Add summary messages
	if (successCount > 0 && failCount > 0) {
		warnings.push(
			`${successCount} calendar event(s) removed successfully, ${failCount} failed.`
		);
	} else if (failCount > 0 && successCount === 0) {
		errors.push('Failed to remove any calendar events. Check your calendar connection.');
	} else if (successCount > 0) {
		warnings.push(`${successCount} calendar event(s) removed from your calendar.`);
	}

	return { warnings, errors };
}
