// src/lib/services/recurring-instance.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { addDays, startOfDay, endOfDay, format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

export interface RecurringTaskInstance {
	id: string;
	task_id: string;
	instance_date: string;
	status: 'scheduled' | 'completed' | 'skipped' | 'cancelled' | 'deleted';
	completed_at?: string | null;
	skipped?: boolean;
	notes?: string | null;
	calendar_event_id?: string | null;
	created_at: string;
	updated_at: string;
	user_id: string;
	tasks?: any; // Will be populated with the parent task data
}

export interface TaskWithInstance {
	task: any;
	displayDate: string;
	isRecurringInstance: boolean;
	instanceId?: string;
	instanceStatus?: string;
	recurrencePattern?: string;
}

export class RecurringInstanceService {
	private static instance: RecurringInstanceService | null = null;
	private supabase: SupabaseClient<Database>;

	private constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
	}

	static getInstance(supabase: SupabaseClient<Database>): RecurringInstanceService {
		if (!RecurringInstanceService.instance) {
			RecurringInstanceService.instance = new RecurringInstanceService(supabase);
		}
		return RecurringInstanceService.instance;
	}

	/**
	 * Get recurring task instances for a date range
	 */
	async getInstancesForDateRange(
		userId: string,
		startDate: Date,
		endDate: Date,
		timezone: string = 'UTC'
	): Promise<RecurringTaskInstance[]> {
		try {
			// Format dates for query
			const startDateStr = format(startDate, 'yyyy-MM-dd');
			const endDateStr = format(endDate, 'yyyy-MM-dd');

			const { data, error } = await this.supabase
				.from('recurring_task_instances')
				.select(
					`
					*,
					tasks!inner(
						id, title, description, details, status, priority, task_type,
						start_date, duration_minutes, project_id, created_at, updated_at,
						recurrence_pattern, recurrence_ends, recurrence_end_source,
						projects (id, name, slug, description, status),
						task_calendar_events (
							id, calendar_event_id, calendar_id, event_start, event_end,
							event_link, sync_status
						)
					)
				`
				)
				.eq('user_id', userId)
				.gte('instance_date', startDateStr)
				.lte('instance_date', endDateStr)
				.in('status', ['scheduled', 'overdue'])
				.order('instance_date', { ascending: true });

			if (error) {
				console.error('Error fetching recurring instances:', error);
				return [];
			}

			return data || [];
		} catch (error) {
			console.error('Error in getInstancesForDateRange:', error);
			return [];
		}
	}

	/**
	 * Get overdue recurring task instances
	 */
	async getOverdueInstances(
		userId: string,
		beforeDate: Date,
		timezone: string = 'UTC'
	): Promise<RecurringTaskInstance[]> {
		try {
			const beforeDateStr = format(beforeDate, 'yyyy-MM-dd');

			const { data, error } = await this.supabase
				.from('recurring_task_instances')
				.select(
					`
					*,
					tasks!inner(
						id, title, description, details, status, priority, task_type,
						start_date, duration_minutes, project_id, created_at, updated_at,
						recurrence_pattern, recurrence_ends, recurrence_end_source,
						projects (id, name, slug, description, status),
						task_calendar_events (
							id, calendar_event_id, calendar_id, event_start, event_end,
							event_link, sync_status
						)
					)
				`
				)
				.eq('user_id', userId)
				.lt('instance_date', beforeDateStr)
				.in('status', ['scheduled', 'overdue'])
				.order('instance_date', { ascending: false });

			if (error) {
				console.error('Error fetching overdue instances:', error);
				return [];
			}

			// Mark as overdue if not already
			const instancesToUpdate = (data || []).filter((i) => i.status === 'scheduled');
			if (instancesToUpdate.length > 0) {
				await this.supabase
					.from('recurring_task_instances')
					.update({ status: 'overdue' as any })
					.in(
						'id',
						instancesToUpdate.map((i) => i.id)
					);
			}

			return data || [];
		} catch (error) {
			console.error('Error in getOverdueInstances:', error);
			return [];
		}
	}

	/**
	 * Merge recurring instances with parent tasks for display
	 */
	mergeInstancesWithTasks(
		instances: RecurringTaskInstance[],
		regularTasks: any[]
	): TaskWithInstance[] {
		const merged: TaskWithInstance[] = [];

		// Add one-off tasks
		for (const task of regularTasks) {
			if (task.task_type === 'one_off') {
				merged.push({
					task,
					displayDate: task.start_date,
					isRecurringInstance: false
				});
			}
		}

		// Add recurring instances
		for (const instance of instances) {
			if (instance.tasks) {
				merged.push({
					task: instance.tasks,
					displayDate: instance.instance_date,
					isRecurringInstance: true,
					instanceId: instance.id,
					instanceStatus: instance.status,
					recurrencePattern: instance.tasks.recurrence_pattern
				});
			}
		}

		return merged;
	}

	/**
	 * Ensure instances are generated for a recurring task up to a certain date
	 */
	async ensureInstancesGenerated(
		taskId: string,
		throughDate: Date,
		userId: string
	): Promise<boolean> {
		try {
			// Check what instances already exist
			const { data: existingInstances, error: fetchError } = await this.supabase
				.from('recurring_task_instances')
				.select('instance_date')
				.eq('task_id', taskId)
				.order('instance_date', { ascending: false })
				.limit(1);

			if (fetchError) {
				console.error('Error checking existing instances:', fetchError);
				return false;
			}

			// Get the task details
			const { data: task, error: taskError } = await this.supabase
				.from('tasks')
				.select('start_date, recurrence_pattern, recurrence_ends, task_type')
				.eq('id', taskId)
				.single();

			if (taskError || !task || task.task_type !== 'recurring') {
				console.error('Error fetching task or task is not recurring:', taskError);
				return false;
			}

			// Determine start date for generation
			let generateFromDate: Date;
			if (existingInstances && existingInstances.length > 0) {
				// Start from day after last instance
				generateFromDate = addDays(new Date(existingInstances[0].instance_date), 1);
			} else {
				// Start from task start date
				generateFromDate = new Date(task.start_date);
			}

			// Only generate if we need to
			if (generateFromDate > throughDate) {
				return true; // Already have instances through the requested date
			}

			// Use the database function to generate instances
			const { error: generateError } = await this.supabase.rpc(
				'generate_recurring_instances',
				{
					p_task_id: taskId,
					p_start_date: format(generateFromDate, 'yyyy-MM-dd'),
					p_end_date: format(throughDate, 'yyyy-MM-dd')
				}
			);

			if (generateError) {
				console.error('Error generating instances:', generateError);
				return false;
			}

			return true;
		} catch (error) {
			console.error('Error in ensureInstancesGenerated:', error);
			return false;
		}
	}

	/**
	 * Complete a recurring task instance
	 */
	async completeRecurringInstance(
		instanceId: string,
		taskId: string,
		userId: string
	): Promise<boolean> {
		try {
			const { error } = await this.supabase
				.from('recurring_task_instances')
				.update({
					status: 'completed' as any,
					completed_at: new Date().toISOString()
				})
				.eq('id', instanceId)
				.eq('user_id', userId);

			if (error) {
				console.error('Error completing instance:', error);
				return false;
			}

			// Generate next instance if needed (30 days out)
			const futureDate = addDays(new Date(), 30);
			await this.ensureInstancesGenerated(taskId, futureDate, userId);

			return true;
		} catch (error) {
			console.error('Error in completeRecurringInstance:', error);
			return false;
		}
	}

	/**
	 * Skip a recurring task instance
	 */
	async skipRecurringInstance(
		instanceId: string,
		userId: string,
		notes?: string
	): Promise<boolean> {
		try {
			const { error } = await this.supabase
				.from('recurring_task_instances')
				.update({
					status: 'skipped' as any,
					skipped: true,
					notes
				})
				.eq('id', instanceId)
				.eq('user_id', userId);

			if (error) {
				console.error('Error skipping instance:', error);
				return false;
			}

			return true;
		} catch (error) {
			console.error('Error in skipRecurringInstance:', error);
			return false;
		}
	}

	/**
	 * Generate instances for all recurring tasks for a user
	 */
	async generateInstancesForUser(userId: string, daysAhead: number = 30): Promise<boolean> {
		try {
			// Get all active recurring tasks for the user
			const { data: recurringTasks, error: fetchError } = await this.supabase
				.from('tasks')
				.select('id')
				.eq('user_id', userId)
				.eq('task_type', 'recurring')
				.neq('status', 'done')
				.is('deleted_at', null);

			if (fetchError) {
				console.error('Error fetching recurring tasks:', fetchError);
				return false;
			}

			if (!recurringTasks || recurringTasks.length === 0) {
				return true; // No recurring tasks to process
			}

			const throughDate = addDays(new Date(), daysAhead);
			const promises = recurringTasks.map((task) =>
				this.ensureInstancesGenerated(task.id, throughDate, userId)
			);

			const results = await Promise.all(promises);
			return results.every((r) => r === true);
		} catch (error) {
			console.error('Error in generateInstancesForUser:', error);
			return false;
		}
	}
}
