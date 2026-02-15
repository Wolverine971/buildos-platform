// apps/web/src/lib/services/task-time-slot-finder.ts
import { Database } from '@buildos/shared-types';
import { Task } from '$lib/types/project';
import {
	format,
	addDays,
	startOfDay,
	isSameDay,
	setHours,
	setMinutes,
	addMinutes,
	isAfter,
	isBefore,
	isEqual
} from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

// type UserCalendarPreferences
type UserCalendarPreferences = Database['public']['Tables']['user_calendar_preferences']['Row'];

interface TimeSlot {
	start: Date;
	end: Date;
}

interface TaskWithOriginalTime extends Task {
	originalTime?: Date;
}

export interface NextAvailableSlotRequest {
	userId: string;
	durationMinutes: number;
	startAfter: Date;
	endBefore: Date;
	preferredHours?: number[];
	timeZone?: string;
}

export interface NextAvailableSlotResult {
	start: Date;
	end: Date;
	timeZone: string;
}

export class TaskTimeSlotFinder {
	private supabase: any;
	private maxDaysToLookAhead = 7;
	private actorIdByUserId = new Map<string, string>();

	constructor(supabaseClient: any) {
		this.supabase = supabaseClient;
	}

	/**
	 * Find the next available timeslot for a task inside the provided window.
	 */
	async findNextAvailableSlot(
		params: NextAvailableSlotRequest
	): Promise<NextAvailableSlotResult | null> {
		const { userId, durationMinutes, startAfter, endBefore } = params;

		if (endBefore <= startAfter) {
			return null;
		}

		const { data: userCalendarPreferences, error: userCalendarPreferencesError } =
			await this.supabase
				.from('user_calendar_preferences')
				.select('*')
				.eq('user_id', userId)
				.single();

		if (userCalendarPreferencesError) {
			console.error(userCalendarPreferencesError);
			console.log('no calendar preferences');
		}

		// Get user's timezone from users table (centralized source of truth)
		const { data: user } = await this.supabase
			.from('users')
			.select('timezone')
			.eq('id', userId)
			.single();

		const preferences = userCalendarPreferences || {
			user_id: userId,
			id: '',
			// timezone removed - now stored in users table
			work_start_time: '09:00:00',
			work_end_time: '17:00:00',
			working_days: [1, 2, 3, 4, 5],
			default_task_duration_minutes: 60,
			min_task_duration_minutes: 30,
			max_task_duration_minutes: 240,
			exclude_holidays: true,
			holiday_country_code: 'US',
			prefer_morning_for_important_tasks: false,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		// Use timezone from users table (centralized source of truth)
		const timezone = user?.timezone || params.timeZone || 'UTC';
		const defaultDuration = preferences.default_task_duration_minutes || 60;
		const effectiveDuration = durationMinutes || defaultDuration;

		let searchDate = startOfDay(startAfter);
		const endBoundary = startOfDay(endBefore);

		let daysChecked = 0;

		while (searchDate <= endBoundary && daysChecked < this.maxDaysToLookAhead) {
			daysChecked += 1;

			if (!this.isWorkingDay(searchDate, preferences)) {
				searchDate = addDays(searchDate, 1);
				continue;
			}

			const existingTasks = await this.getExistingTasksForDay(searchDate, userId, timezone);

			const workDayStart = this.createDateTime(
				searchDate,
				preferences.work_start_time || '09:00:00',
				timezone
			);
			const workDayEnd = this.createDateTime(
				searchDate,
				preferences.work_end_time || '17:00:00',
				timezone
			);

			const firstDayStart = toZonedTime(startAfter, timezone);
			const earliestStart =
				daysChecked === 1
					? firstDayStart.getTime() > workDayStart.getTime()
						? firstDayStart
						: workDayStart
					: workDayStart;

			const occupiedSlots = this.getOccupiedSlots(existingTasks, defaultDuration, timezone);

			const availableSlot = this.findAvailableSlot(
				earliestStart,
				workDayEnd,
				effectiveDuration,
				occupiedSlots
			);

			if (availableSlot) {
				const slotEndUtc = fromZonedTime(availableSlot.end, timezone);
				if (slotEndUtc > endBefore) {
					searchDate = addDays(searchDate, 1);
					continue;
				}

				return {
					start: fromZonedTime(availableSlot.start, timezone),
					end: slotEndUtc,
					timeZone: timezone
				};
			}

			searchDate = addDays(searchDate, 1);
		}

		return null;
	}

	/**
	 * Main function to schedule tasks
	 */
	async scheduleTasks(tasksToSchedule: Task[], userId: string): Promise<Task[]> {
		const { data: userCalendarPreferences, error: userCalendarPreferencesError } =
			await this.supabase
				.from('user_calendar_preferences')
				.select('*')
				.eq('user_id', userId)
				.single();

		if (userCalendarPreferencesError) {
			console.error(userCalendarPreferencesError);
			console.log('no calendar preferences');
		}

		// Get user's timezone from users table (centralized source of truth)
		const { data: user } = await this.supabase
			.from('users')
			.select('timezone')
			.eq('id', userId)
			.single();

		// Provide default preferences if none exist (don't auto-create in DB)
		const preferences = userCalendarPreferences || {
			user_id: userId,
			id: '',
			// timezone removed - now stored in users table
			work_start_time: '09:00:00',
			work_end_time: '17:00:00',
			working_days: [1, 2, 3, 4, 5],
			default_task_duration_minutes: 60,
			min_task_duration_minutes: 30,
			max_task_duration_minutes: 240,
			exclude_holidays: true,
			holiday_country_code: 'US',
			prefer_morning_for_important_tasks: false,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		if (userCalendarPreferencesError) {
			console.warn('No calendar preferences found for user, using defaults:', {
				userId,
				errorCode: userCalendarPreferencesError.code
			});
		}

		// Get timezone from users table (centralized source of truth)
		const timezone = user?.timezone || 'America/New_York';

		// Filter out recurring tasks (they shouldn't be adjusted)
		const recurringTasks = tasksToSchedule.filter((task) => task.recurrence_pattern !== null);
		const nonRecurringTasks = tasksToSchedule.filter(
			(task) => task.recurrence_pattern === null
		);

		// Group tasks by their start date (day only)
		const tasksByDay = this.groupTasksByDay(nonRecurringTasks, timezone);

		const scheduledTasks: Task[] = [];
		const bumpedTasks: TaskWithOriginalTime[] = [];

		// Get all working days that need existing task data
		const workingDays = Object.entries(tasksByDay)
			.map(([dateKey]) => new Date(dateKey))
			.filter((dayDate) => this.isWorkingDay(dayDate, preferences));

		// Batch fetch existing tasks for all working days
		const existingTasksByDay = await this.getExistingTasksForDateRange(
			workingDays,
			userId,
			timezone
		);

		// Process each day's tasks
		for (const [dateKey, dayTasks] of Object.entries(tasksByDay)) {
			const dayDate = new Date(dateKey);

			// Skip non-working days
			if (!this.isWorkingDay(dayDate, preferences)) {
				// Add all tasks for this non-working day to bump queue
				dayTasks.forEach((task) => {
					bumpedTasks.push({
						...task,
						originalTime: task.start_date ? new Date(task.start_date) : dayDate
					});
				});
				continue;
			}

			// Get existing tasks for this day from the batch fetch
			const existingTasks = existingTasksByDay.get(dateKey) || [];

			// Schedule tasks for this day
			const { scheduled, bumped } = this.scheduleTasksForDay(
				dayTasks,
				existingTasks,
				dayDate,
				preferences,
				timezone
			);

			scheduledTasks.push(...scheduled);
			bumpedTasks.push(...bumped);
		}

		// Process bumped tasks
		const rescheduledTasks = await this.processBumpedTasks(bumpedTasks, preferences, timezone);

		// Combine all tasks: recurring (unchanged) + scheduled + rescheduled
		return [...recurringTasks, ...scheduledTasks, ...rescheduledTasks];
	}

	/**
	 * Group tasks by their start date (considering only the day)
	 */
	private groupTasksByDay(tasks: Task[], timezone: string): Record<string, Task[]> {
		const grouped: Record<string, Task[]> = {};

		tasks.forEach((task) => {
			if (!task.start_date) return;

			const taskDate = new Date(task.start_date);
			const zonedDate = toZonedTime(taskDate, timezone);
			const dayKey = format(startOfDay(zonedDate), 'yyyy-MM-dd');

			if (!grouped[dayKey]) {
				grouped[dayKey] = [];
			}
			grouped[dayKey].push(task);
		});

		// Sort tasks within each day by their original time to maintain relative order
		Object.keys(grouped).forEach((dayKey) => {
			const dayTasks = grouped[dayKey];
			if (!dayTasks) {
				return;
			}

			dayTasks.sort((a, b) => {
				const timeA = a.start_date ? new Date(a.start_date).getTime() : 0;
				const timeB = b.start_date ? new Date(b.start_date).getTime() : 0;
				return timeA - timeB;
			});
		});

		return grouped;
	}

	/**
	 * Check if a date is a working day
	 */
	private isWorkingDay(date: Date, preferences: UserCalendarPreferences): boolean {
		const dayOfWeek = date.getDay();
		const workingDays = preferences.working_days || [1, 2, 3, 4, 5];

		// Convert Sunday = 0 to Sunday = 7 for consistency with ISO week days
		const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek;

		return workingDays.includes(isoDay);
	}

	/**
	 * Get existing tasks for a specific day from the database
	 */
	private async getExistingTasksForDay(
		date: Date,
		userId: string,
		timezone: string
	): Promise<Task[]> {
		const actorId = await this.getActorId(userId);
		if (!actorId) {
			return [];
		}

		const dayStart = startOfDay(date);
		const dayEnd = addDays(dayStart, 1);

		// Convert to UTC for database query
		const utcStart = fromZonedTime(dayStart, timezone);
		const utcEnd = fromZonedTime(dayEnd, timezone);

		const { data, error } = await this.supabase
			.from('onto_tasks')
			.select(
				'id, title, description, project_id, state_key, priority, start_at, created_at, updated_at, deleted_at, completed_at, props'
			)
			.eq('created_by', actorId)
			.gte('start_at', utcStart.toISOString())
			.lt('start_at', utcEnd.toISOString())
			.is('deleted_at', null)
			.order('start_at', { ascending: true });

		if (error) {
			console.error('Error fetching existing tasks:', error);
			return [];
		}

		return (data ?? []).map((task: any) => this.mapOntoTaskToTask(task, userId));
	}

	/**
	 * Batch fetch existing tasks for multiple days at once
	 */
	private async getExistingTasksForDateRange(
		dates: Date[],
		userId: string,
		timezone: string
	): Promise<Map<string, Task[]>> {
		if (dates.length === 0) return new Map();

		const actorId = await this.getActorId(userId);
		if (!actorId) {
			return new Map();
		}

		// Get the full date range to query
		const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime());
		const minDate = sortedDates[0];
		const maxDate = sortedDates[sortedDates.length - 1];

		if (!minDate || !maxDate) {
			return new Map();
		}

		const rangeStart = startOfDay(minDate);
		const rangeEnd = addDays(startOfDay(maxDate), 1);

		// Convert to UTC for database query
		const utcStart = fromZonedTime(rangeStart, timezone);
		const utcEnd = fromZonedTime(rangeEnd, timezone);

		const { data, error } = await this.supabase
			.from('onto_tasks')
			.select(
				'id, title, description, project_id, state_key, priority, start_at, created_at, updated_at, deleted_at, completed_at, props'
			)
			.eq('created_by', actorId)
			.gte('start_at', utcStart.toISOString())
			.lt('start_at', utcEnd.toISOString())
			.is('deleted_at', null)
			.order('start_at', { ascending: true });

		if (error) {
			console.error('Error fetching existing tasks batch:', error);
			return new Map();
		}

		// Group tasks by day
		const tasksByDay = new Map<string, Task[]>();
		dates.forEach((date) => {
			const dateKey = format(date, 'yyyy-MM-dd');
			tasksByDay.set(dateKey, []);
		});

		const taskRows = (data ?? []).map((task: any) => this.mapOntoTaskToTask(task, userId));

		taskRows.forEach((task: Task) => {
			if (task.start_date) {
				const taskDate = toZonedTime(new Date(task.start_date), timezone);
				const dateKey = format(taskDate, 'yyyy-MM-dd');
				const dayTasks = tasksByDay.get(dateKey);
				if (dayTasks) {
					dayTasks.push(task);
				}
			}
		});

		return tasksByDay;
	}

	private async getActorId(userId: string): Promise<string | null> {
		const cached = this.actorIdByUserId.get(userId);
		if (cached) return cached;

		const { data: actorId, error } = await this.supabase.rpc('ensure_actor_for_user', {
			p_user_id: userId
		});

		if (error || !actorId) {
			console.error('Failed to resolve actor for task scheduling:', error);
			return null;
		}

		this.actorIdByUserId.set(userId, actorId);
		return actorId;
	}

	private mapTaskStateToStatus(
		stateKey: string | null | undefined
	): 'backlog' | 'in_progress' | 'done' | 'blocked' {
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

	private mapPriorityLevel(priority: number | null | undefined): 'low' | 'medium' | 'high' {
		if ((priority ?? 0) >= 4) return 'high';
		if ((priority ?? 0) >= 2) return 'medium';
		return 'low';
	}

	private mapOntoTaskToTask(task: any, userId: string): Task {
		const props = (task.props as Record<string, unknown> | null) ?? {};
		const recurrencePattern =
			typeof props.recurrence_pattern === 'string' ? props.recurrence_pattern : null;
		const taskType =
			typeof props.task_type === 'string'
				? props.task_type
				: recurrencePattern
					? 'recurring'
					: 'one_off';

		return {
			id: task.id,
			title: task.title,
			description: task.description ?? null,
			details: typeof props.details === 'string' ? props.details : null,
			status: this.mapTaskStateToStatus(task.state_key),
			priority: this.mapPriorityLevel(task.priority),
			start_date: task.start_at ?? null,
			duration_minutes:
				typeof props.duration_minutes === 'number' ? props.duration_minutes : null,
			task_type: taskType as Task['task_type'],
			recurrence_pattern: recurrencePattern as Task['recurrence_pattern'],
			recurrence_ends:
				typeof props.recurrence_ends === 'string' ? props.recurrence_ends : null,
			recurrence_end_source:
				typeof props.recurrence_end_source === 'string'
					? props.recurrence_end_source
					: null,
			dependencies: Array.isArray(props.dependencies)
				? (props.dependencies as string[])
				: null,
			parent_task_id: typeof props.parent_task_id === 'string' ? props.parent_task_id : null,
			task_steps: typeof props.task_steps === 'string' ? props.task_steps : null,
			source: typeof props.source === 'string' ? props.source : null,
			source_calendar_event_id:
				typeof props.source_calendar_event_id === 'string'
					? props.source_calendar_event_id
					: null,
			project_id: task.project_id ?? null,
			completed_at: task.completed_at ?? null,
			deleted_at: task.deleted_at ?? null,
			outdated: null,
			created_at: task.created_at,
			updated_at: task.updated_at,
			user_id: userId
		};
	}

	/**
	 * Schedule tasks for a specific day
	 */
	private scheduleTasksForDay(
		tasksToSchedule: Task[],
		existingTasks: Task[],
		dayDate: Date,
		preferences: UserCalendarPreferences,
		timezone: string = 'UTC'
	): { scheduled: Task[]; bumped: TaskWithOriginalTime[] } {
		const scheduled: Task[] = [];
		const bumped: TaskWithOriginalTime[] = [];
		const workStartTime = preferences.work_start_time || '09:00:00';
		const workEndTime = preferences.work_end_time || '17:00:00';
		const defaultDuration = preferences.default_task_duration_minutes || 60;

		// Create work day boundaries
		const workDayStart = this.createDateTime(dayDate, workStartTime, timezone);
		const workDayEnd = this.createDateTime(dayDate, workEndTime, timezone);

		// Get all occupied time slots from existing tasks
		const occupiedSlots = this.getOccupiedSlots(existingTasks, defaultDuration, timezone);

		// Try to schedule each task
		tasksToSchedule.forEach((task) => {
			const taskDuration = task.duration_minutes || defaultDuration;

			// Find available slot
			const availableSlot = this.findAvailableSlot(workDayStart, workDayEnd, taskDuration, [
				...occupiedSlots,
				...this.getOccupiedSlots(scheduled, defaultDuration, timezone)
			]);

			if (availableSlot) {
				// Update task with new start_date
				const updatedTask = {
					...task,
					start_date: fromZonedTime(availableSlot.start, timezone).toISOString()
				};
				scheduled.push(updatedTask);
			} else {
				// Add to bump queue with original time preserved
				bumped.push({
					...task,
					originalTime: task.start_date ? new Date(task.start_date) : dayDate
				});
			}
		});

		return { scheduled, bumped };
	}

	/**
	 * Create a DateTime from date and time string
	 */
	private createDateTime(date: Date, timeString: string, timezone: string): Date {
		const [hoursRaw = '0', minutesRaw = '0'] = timeString.split(':');
		const hours = Number(hoursRaw);
		const minutes = Number(minutesRaw);
		const safeHours = Number.isFinite(hours) ? hours : 0;
		const safeMinutes = Number.isFinite(minutes) ? minutes : 0;
		const dateInZone = toZonedTime(date, timezone);
		const dateTime = setMinutes(setHours(dateInZone, safeHours), safeMinutes);
		return dateTime;
	}

	/**
	 * Get occupied time slots from tasks
	 */
	private getOccupiedSlots(tasks: Task[], defaultDuration: number, timezone: string): TimeSlot[] {
		return tasks
			.filter((task) => task.start_date)
			.map((task) => {
				const start = toZonedTime(new Date(task.start_date!), timezone);
				const duration = task.duration_minutes || defaultDuration;
				const end = addMinutes(start, duration);
				return { start, end };
			})
			.sort((a, b) => a.start.getTime() - b.start.getTime());
	}

	/**
	 * Find an available time slot
	 */
	private findAvailableSlot(
		workDayStart: Date,
		workDayEnd: Date,
		durationMinutes: number,
		occupiedSlots: TimeSlot[]
	): TimeSlot | null {
		// Sort occupied slots by start time
		const sortedSlots = [...occupiedSlots].sort(
			(a, b) => a.start.getTime() - b.start.getTime()
		);

		// Check if we can fit at the beginning of the day
		const firstSlot = sortedSlots[0];
		if (!firstSlot || isAfter(firstSlot.start, addMinutes(workDayStart, durationMinutes))) {
			const potentialEnd = addMinutes(workDayStart, durationMinutes);
			if (isBefore(potentialEnd, workDayEnd) || isEqual(potentialEnd, workDayEnd)) {
				return { start: workDayStart, end: potentialEnd };
			}
		}

		// Check gaps between occupied slots
		for (let i = 0; i < sortedSlots.length - 1; i++) {
			const currentSlot = sortedSlots[i];
			const nextSlot = sortedSlots[i + 1];
			if (!currentSlot || !nextSlot) {
				continue;
			}

			const gapStart = currentSlot.end;
			const gapEnd = nextSlot.start;
			const gapDuration = (gapEnd.getTime() - gapStart.getTime()) / (1000 * 60); // in minutes

			if (gapDuration >= durationMinutes) {
				const potentialEnd = addMinutes(gapStart, durationMinutes);
				if (isBefore(potentialEnd, workDayEnd) || isEqual(potentialEnd, workDayEnd)) {
					return { start: gapStart, end: potentialEnd };
				}
			}
		}

		// Check if we can fit after the last task
		if (sortedSlots.length > 0) {
			const lastSlot = sortedSlots[sortedSlots.length - 1];
			if (lastSlot) {
				const lastEnd = lastSlot.end;
				const potentialEnd = addMinutes(lastEnd, durationMinutes);

				if (isBefore(potentialEnd, workDayEnd) || isEqual(potentialEnd, workDayEnd)) {
					return { start: lastEnd, end: potentialEnd };
				}
			}
		}

		return null;
	}

	/**
	 * Process bumped tasks by trying to schedule them on subsequent days
	 */
	private async processBumpedTasks(
		bumpedTasks: TaskWithOriginalTime[],
		preferences: UserCalendarPreferences,
		timezone: string
	): Promise<Task[]> {
		const rescheduled: Task[] = [];

		for (const task of bumpedTasks) {
			let scheduled = false;
			const originalDate = task.originalTime || new Date();

			// Try up to maxDaysToLookAhead days
			for (let daysAhead = 1; daysAhead <= this.maxDaysToLookAhead; daysAhead++) {
				const targetDate = addDays(originalDate, daysAhead);

				// Skip non-working days
				if (!this.isWorkingDay(targetDate, preferences)) {
					continue;
				}

				// Get existing tasks for the target day
				const existingTasks = await this.getExistingTasksForDay(
					targetDate,
					preferences.user_id,
					timezone
				);

				// Include already rescheduled tasks for this day
				const existingPlusRescheduled = [
					...existingTasks,
					...rescheduled.filter((t) => {
						if (!t.start_date) return false;
						const tDate = toZonedTime(new Date(t.start_date), timezone);
						return isSameDay(tDate, targetDate);
					})
				];

				// Try to schedule the task
				const { scheduled: dayScheduled } = this.scheduleTasksForDay(
					[task],
					existingPlusRescheduled,
					targetDate,
					preferences,
					timezone
				);

				if (dayScheduled.length > 0) {
					const scheduledTask = dayScheduled[0];
					if (scheduledTask) {
						rescheduled.push(scheduledTask);
						scheduled = true;
						break;
					}
				}
			}

			// If still not scheduled after trying all days, keep original task unchanged
			if (!scheduled) {
				console.warn(
					`Could not find slot for task "${task.title}" within ${this.maxDaysToLookAhead} days`
				);
				const { originalTime, ...originalTask } = task;
				rescheduled.push(originalTask);
			}
		}

		return rescheduled;
	}
}

// Export the main function for use
// export async function assignTasksToCalendar(
// 	supabaseClient: any,
// 	tasksToSchedule: Task[],
// 	preferences: UserCalendarPreferences
// ): Promise<Task[]> {
// 	const scheduler = new TaskTimeSlotFinder(supabaseClient);
// 	return await scheduler.scheduleTasks(tasksToSchedule, preferences);
// }

// Example usage:
/*
import { createCustomClient } from '@buildos/supabase-client';

const supabase = createCustomClient('your-supabase-url', 'your-anon-key');

const tasks = [...]; // Your tasks array
const preferences = {...}; // User calendar preferences

const scheduledTasks = await assignTasksToCalendar(
  supabase,
  tasks,
  preferences
);

// scheduledTasks now contains all tasks with updated start_date values
*/
