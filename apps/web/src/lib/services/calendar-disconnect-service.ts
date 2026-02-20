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

	private async resolveActorId(userId: string): Promise<string | null> {
		const { data: actorId, error } = await this.supabase.rpc('ensure_actor_for_user', {
			p_user_id: userId
		});
		if (error || !actorId) {
			console.error('Error resolving actor ID for calendar disconnect:', error);
			return null;
		}
		return actorId;
	}

	/**
	 * Check for calendar dependencies (tasks, time blocks, etc.)
	 */
	async checkCalendarDependencies(userId: string): Promise<CalendarDependencies> {
		try {
			const actorId = await this.resolveActorId(userId);

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

			// Check for calendar-sourced ontology tasks
			let calendarTasksCount = 0;
			if (actorId) {
				const { data: ontoTasks, error: ontoTasksError } = await this.supabase
					.from('onto_tasks')
					.select('id, props')
					.eq('created_by', actorId)
					.is('deleted_at', null);

				if (ontoTasksError) {
					console.error('Error fetching ontology calendar tasks:', ontoTasksError);
				} else {
					calendarTasksCount =
						ontoTasks?.filter((task) => {
							const props = (task.props as Record<string, unknown> | null) ?? {};
							const source = props.source;
							const sourceMetadata =
								(props.source_metadata as Record<string, unknown> | null)?.source ??
								null;
							return (
								source === 'calendar_analysis' ||
								sourceMetadata === 'calendar_analysis' ||
								typeof props.source_calendar_event_id === 'string'
							);
						}).length ?? 0;
				}
			}

			const scheduledTasks = taskEventsCount || 0;
			const timeBlocks = timeBlocksCount || 0;
			const calendarTasks = calendarTasksCount;

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
			const actorId = await this.resolveActorId(userId);

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

			// Clear source references from ontology tasks
			if (actorId) {
				const { data: tasks, error: tasksFetchError } = await this.supabase
					.from('onto_tasks')
					.select('id, props')
					.eq('created_by', actorId)
					.is('deleted_at', null);

				if (tasksFetchError) {
					console.error(
						'Error loading ontology tasks for calendar cleanup:',
						tasksFetchError
					);
				} else if (tasks && tasks.length > 0) {
					for (const task of tasks) {
						const props = (task.props as Record<string, unknown> | null) ?? {};
						if (
							!props.source_calendar_event_id &&
							props.source !== 'calendar_analysis'
						) {
							continue;
						}

						const nextProps = { ...props };
						delete nextProps.source_calendar_event_id;
						if (nextProps.source === 'calendar_analysis') {
							delete nextProps.source;
						}

						const { error: updateError } = await this.supabase
							.from('onto_tasks')
							.update({
								props: nextProps as Database['public']['Tables']['onto_tasks']['Update']['props']
							})
							.eq('id', task.id);

						if (updateError) {
							console.error(
								`Error clearing ontology task calendar references for ${task.id}:`,
								updateError
							);
						}
					}
				}
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
			const actorId = await this.resolveActorId(userId);

			// Get scheduled ontology task events
			const { data: events } = actorId
				? await this.supabase
						.from('onto_events')
						.select('owner_entity_id, project_id, title')
						.eq('created_by', actorId)
						.eq('owner_entity_type', 'task')
						.is('deleted_at', null)
						.order('start_at', { ascending: true })
						.limit(10)
				: { data: [] };

			const taskIds = Array.from(
				new Set((events ?? []).map((event) => event.owner_entity_id).filter(Boolean))
			) as string[];

			const { data: tasks } =
				taskIds.length > 0
					? await this.supabase
							.from('onto_tasks')
							.select('id, title, project_id')
							.in('id', taskIds)
							.is('deleted_at', null)
					: { data: [] };

			// Get time blocks with calendar links
			const { data: timeBlocks } = await this.supabase
				.from('time_blocks')
				.select('id, start_time, end_time')
				.eq('user_id', userId)
				.not('calendar_event_id', 'is', null)
				.limit(10);

			return {
				tasks: (tasks ?? []).map((task) => ({
					id: task.id,
					title: task.title,
					project_id: task.project_id
				})),
				timeBlocks: timeBlocks || []
			};
		} catch (error) {
			console.error('Error getting affected items preview:', error);
			return { tasks: [], timeBlocks: [] };
		}
	}
}
