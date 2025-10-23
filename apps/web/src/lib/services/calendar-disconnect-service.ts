// apps/web/src/lib/services/calendar-disconnect-service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

export interface CalendarDependencies {
	hasScheduledTasks: boolean;
	hasTimeBlocks: boolean;
	hasCalendarSourcedTasks: boolean;
	totalAffectedItems: number;
	breakdown: {
		scheduledTasks: number;
		timeBlocks: number;
		calendarTasks: number;
	};
}

/**
 * Service to handle calendar disconnection and data cleanup
 */
export class CalendarDisconnectService {
	constructor(private supabase: SupabaseClient<Database>) {}

	/**
	 * Check for calendar dependencies (tasks, time blocks, etc.)
	 */
	async checkCalendarDependencies(userId: string): Promise<CalendarDependencies> {
		try {
			// Check for task_calendar_events
			const { count: taskEventsCount } = await this.supabase
				.from('task_calendar_events')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId);

			// Check for time_blocks with calendar links
			const { count: timeBlocksCount } = await this.supabase
				.from('time_blocks')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId)
				.not('calendar_event_id', 'is', null);

			// Check for calendar-sourced tasks
			const { count: calendarTasksCount } = await this.supabase
				.from('tasks')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId)
				.eq('source', 'calendar_analysis');

			const scheduledTasks = taskEventsCount || 0;
			const timeBlocks = timeBlocksCount || 0;
			const calendarTasks = calendarTasksCount || 0;

			return {
				hasScheduledTasks: scheduledTasks > 0,
				hasTimeBlocks: timeBlocks > 0,
				hasCalendarSourcedTasks: calendarTasks > 0,
				totalAffectedItems: scheduledTasks + timeBlocks,
				breakdown: {
					scheduledTasks,
					timeBlocks,
					calendarTasks
				}
			};
		} catch (error) {
			console.error('Error checking calendar dependencies:', error);
			// Return safe defaults on error
			return {
				hasScheduledTasks: false,
				hasTimeBlocks: false,
				hasCalendarSourcedTasks: false,
				totalAffectedItems: 0,
				breakdown: {
					scheduledTasks: 0,
					timeBlocks: 0,
					calendarTasks: 0
				}
			};
		}
	}

	/**
	 * Remove all calendar-related data for a user
	 */
	async removeCalendarData(userId: string): Promise<void> {
		try {
			// Remove task_calendar_events
			const { error: taskEventsError } = await this.supabase
				.from('task_calendar_events')
				.delete()
				.eq('user_id', userId);

			if (taskEventsError) {
				console.error('Error removing task calendar events:', taskEventsError);
			}

			// Clear calendar references from time_blocks
			const { error: timeBlocksError } = await this.supabase
				.from('time_blocks')
				.update({
					calendar_event_id: null,
					calendar_event_link: null,
					last_synced_at: null,
					sync_source: null
				})
				.eq('user_id', userId)
				.not('calendar_event_id', 'is', null);

			if (timeBlocksError) {
				console.error('Error clearing time blocks calendar data:', timeBlocksError);
			}

			// Clear source references from calendar-sourced tasks
			const { error: tasksError } = await this.supabase
				.from('tasks')
				.update({
					source_calendar_event_id: null
				})
				.eq('user_id', userId)
				.eq('source', 'calendar_analysis');

			if (tasksError) {
				console.error('Error clearing task calendar references:', tasksError);
			}

			console.log(`Calendar data removed for user ${userId}`);
		} catch (error) {
			console.error('Error removing calendar data:', error);
			throw error;
		}
	}

	/**
	 * Get a preview of affected items before removal
	 */
	async getAffectedItemsPreview(userId: string): Promise<{
		tasks: Array<{ id: string; title: string; project_id: string | null }>;
		timeBlocks: Array<{ id: string; start_time: string; end_time: string }>;
	}> {
		try {
			// Get scheduled tasks
			const { data: taskEvents } = await this.supabase
				.from('task_calendar_events')
				.select(
					`
					task_id,
					tasks!inner (
						id,
						title,
						project_id
					)
				`
				)
				.eq('user_id', userId)
				.limit(10);

			// Get time blocks with calendar links
			const { data: timeBlocks } = await this.supabase
				.from('time_blocks')
				.select('id, start_time, end_time')
				.eq('user_id', userId)
				.not('calendar_event_id', 'is', null)
				.limit(10);

			return {
				tasks:
					taskEvents?.map((te: any) => ({
						id: te.tasks.id,
						title: te.tasks.title,
						project_id: te.tasks.project_id
					})) || [],
				timeBlocks: timeBlocks || []
			};
		} catch (error) {
			console.error('Error getting affected items preview:', error);
			return { tasks: [], timeBlocks: [] };
		}
	}
}
