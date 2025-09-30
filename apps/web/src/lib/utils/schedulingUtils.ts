// apps/web/src/lib/utils/schedulingUtils.ts

import {
	format,
	startOfDay,
	endOfDay,
	addMinutes,
	isWithinInterval,
	getDay,
	setHours,
	setMinutes
} from 'date-fns';
import type { PhaseWithTasks, TaskWithCalendarEvents } from '$lib/types/project-page.types';

export interface ProposedTaskSchedule {
	task: TaskWithCalendarEvents;
	phaseId?: string;
	proposedStart: Date;
	proposedEnd: Date;
	hasConflict: boolean;
	conflictReason?: string;
	duration_minutes: number;
	isEditing?: boolean;
	tempStart?: string;
	tempEnd?: string;
	originalStart?: Date;
	originalEnd?: Date;
}

export interface ConflictInfo {
	type: 'calendar' | 'task' | 'phase_boundary' | 'project_boundary';
	description: string;
	affectedTaskIds?: string[];
	severity: 'warning' | 'error';
	taskId?: string;
	taskName?: string;
	date?: Date;
}

export interface ValidationResult {
	isValid: boolean;
	conflicts: ConflictInfo[];
	warnings: string[];
}

export interface WorkingHours {
	work_start_time: string;
	work_end_time: string;
	working_days: number[];
	default_task_duration_minutes: number;
	timeZone: string;
}

/**
 * Parse a date string to local date, handling both date-only and ISO strings
 */
export function parseLocalDate(dateStr: string | Date | null | undefined): Date {
	if (!dateStr) {
		return new Date();
	}

	if (dateStr instanceof Date) {
		return dateStr;
	}

	// If it's a date-only string (YYYY-MM-DD), parse it as local date
	if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
		const [year, month, day] = dateStr.split('-').map(Number);
		return new Date(year, month - 1, day); // month is 0-indexed
	}

	// If it's an ISO string with time, just parse normally
	return new Date(dateStr);
}

/**
 * Get the start of day in local time
 */
export function getLocalStartOfDay(date: Date | string): Date {
	const d = typeof date === 'string' ? parseLocalDate(date) : new Date(date);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * Get the end of day in local time
 */
export function getLocalEndOfDay(date: Date | string): Date {
	const d = typeof date === 'string' ? parseLocalDate(date) : new Date(date);
	return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/**
 * Format date for display
 */
export function formatDate(date: Date): string {
	return format(date, 'EEE, MMM d');
}

/**
 * Format time for display
 */
export function formatTime(date: Date): string {
	return format(date, 'h:mm a');
}

/**
 * Format datetime for display
 */
export function formatDateTime(date: Date): string {
	return format(date, "MMM d, yyyy 'at' h:mm a");
}

/**
 * Format task time for display
 */
export function formatTaskTime(date: Date): string {
	return format(date, 'MMM d, h:mm a');
}

/**
 * Format datetime for HTML datetime-local input
 */
export function formatDateTimeForInput(date: Date): string {
	return format(date, "yyyy-MM-dd'T'HH:mm");
}

/**
 * Parse datetime from HTML datetime-local input
 */
export function parseDateTimeFromInput(value: string): Date {
	return new Date(value);
}

/**
 * Validate a task schedule against phase and project boundaries
 */
export function validateTaskSchedule(
	schedule: ProposedTaskSchedule,
	phase: PhaseWithTasks,
	project?: { start_date?: string; end_date?: string },
	existingEvents?: any[]
): ValidationResult {
	const conflicts: ConflictInfo[] = [];
	const warnings: string[] = [];
	let isValid = true;

	// Check phase boundaries
	const phaseStart = getLocalStartOfDay(phase.start_date);
	const phaseEnd = getLocalEndOfDay(phase.end_date);

	if (schedule.proposedStart < phaseStart || schedule.proposedEnd > phaseEnd) {
		conflicts.push({
			type: 'phase_boundary',
			description: `Task "${schedule.task.title}" scheduled outside phase dates`,
			severity: 'error',
			taskId: schedule.task.id,
			taskName: schedule.task.title,
			date: schedule.proposedStart
		});
		isValid = false;
	}

	// Check project boundaries if provided
	if (project) {
		if (project.start_date) {
			const projectStart = getLocalStartOfDay(project.start_date);
			if (schedule.proposedStart < projectStart) {
				conflicts.push({
					type: 'project_boundary',
					description: `Task "${schedule.task.title}" scheduled before project start date`,
					severity: 'error',
					taskId: schedule.task.id,
					taskName: schedule.task.title,
					date: schedule.proposedStart
				});
				isValid = false;
			}
		}

		if (project.end_date) {
			const projectEnd = getLocalEndOfDay(project.end_date);
			if (schedule.proposedEnd > projectEnd) {
				conflicts.push({
					type: 'project_boundary',
					description: `Task "${schedule.task.title}" scheduled after project end date`,
					severity: 'error',
					taskId: schedule.task.id,
					taskName: schedule.task.title,
					date: schedule.proposedEnd
				});
				isValid = false;
			}
		}
	}

	// Check conflicts with existing calendar events
	if (existingEvents && existingEvents.length > 0) {
		const conflictingEvent = existingEvents.find((event) => {
			const eventStart = new Date(event.start?.dateTime || event.start?.date);
			const eventEnd = new Date(event.end?.dateTime || event.end?.date);

			// Check if there's any overlap
			return schedule.proposedStart < eventEnd && schedule.proposedEnd > eventStart;
		});

		if (conflictingEvent) {
			conflicts.push({
				type: 'calendar',
				description: `Task "${schedule.task.title}" conflicts with: ${conflictingEvent.summary}`,
				severity: 'warning',
				taskId: schedule.task.id,
				taskName: schedule.task.title,
				date: schedule.proposedStart
			});
			warnings.push(
				`Task "${schedule.task.title}" overlaps with existing calendar event: ${conflictingEvent.summary}`
			);
		}
	}

	// Check for past scheduling
	const now = new Date();
	if (schedule.proposedStart < now) {
		warnings.push('Task is scheduled in the past');
	}

	return {
		isValid,
		conflicts,
		warnings
	};
}

/**
 * Calculate working hours for a specific day
 */
export function getWorkingHoursForDay(
	date: Date,
	workingHours: WorkingHours
): { start: Date; end: Date } | null {
	const dayOfWeek = getDay(date);

	// Check if it's a working day
	if (!workingHours.working_days.includes(dayOfWeek)) {
		return null;
	}

	const [startHour, startMin] = workingHours.work_start_time.split(':').map(Number);
	const [endHour, endMin] = workingHours.work_end_time.split(':').map(Number);

	const dayStart = setMinutes(setHours(startOfDay(date), startHour), startMin || 0);
	const dayEnd = setMinutes(setHours(startOfDay(date), endHour), endMin || 0);

	return { start: dayStart, end: dayEnd };
}

/**
 * Generate time slots for scheduling
 */
export function generateTimeSlots(
	startDate: Date,
	endDate: Date,
	workingHours: WorkingHours,
	existingEvents: any[] = [],
	slotDurationMinutes: number = 30
): Array<{ start: Date; end: Date; available: boolean }> {
	const slots = [];
	const current = new Date(startDate);

	while (current <= endDate) {
		const workHours = getWorkingHoursForDay(current, workingHours);

		if (workHours) {
			const slotStart = new Date(workHours.start);

			while (slotStart < workHours.end) {
				const slotEnd = addMinutes(slotStart, slotDurationMinutes);

				// Check if slot overlaps with any existing event
				const hasConflict = existingEvents.some((event) => {
					const eventStart = new Date(event.start?.dateTime || event.start?.date);
					const eventEnd = new Date(event.end?.dateTime || event.end?.date);

					return (
						isWithinInterval(slotStart, { start: eventStart, end: eventEnd }) ||
						isWithinInterval(slotEnd, { start: eventStart, end: eventEnd }) ||
						(slotStart <= eventStart && slotEnd >= eventEnd)
					);
				});

				slots.push({
					start: new Date(slotStart),
					end: new Date(slotEnd),
					available: !hasConflict
				});

				slotStart.setMinutes(slotStart.getMinutes() + slotDurationMinutes);
			}
		}

		current.setDate(current.getDate() + 1);
		current.setHours(0, 0, 0, 0);
	}

	return slots;
}

/**
 * Find the next available slot for a task
 */
export function findNextAvailableSlot(
	slots: Array<{ start: Date; end: Date; available: boolean }>,
	preferredDate: Date,
	durationMinutes: number
): { start: Date; end: Date } | null {
	const slotsNeeded = Math.ceil(durationMinutes / 30);
	const availableSlots = slots.filter((s) => s.available);

	// Sort by distance from preferred date
	availableSlots.sort((a, b) => {
		const distA = Math.abs(a.start.getTime() - preferredDate.getTime());
		const distB = Math.abs(b.start.getTime() - preferredDate.getTime());
		return distA - distB;
	});

	// Find consecutive slots
	for (let i = 0; i < availableSlots.length; i++) {
		const consecutiveSlots = [availableSlots[i]];

		for (
			let j = i + 1;
			j < availableSlots.length && consecutiveSlots.length < slotsNeeded;
			j++
		) {
			const lastSlot = consecutiveSlots[consecutiveSlots.length - 1];
			const currentSlot = availableSlots[j];

			// Check if slots are consecutive
			if (currentSlot.start.getTime() === lastSlot.end.getTime()) {
				consecutiveSlots.push(currentSlot);
			} else {
				break;
			}
		}

		if (consecutiveSlots.length >= slotsNeeded) {
			return {
				start: consecutiveSlots[0].start,
				end: consecutiveSlots[consecutiveSlots.length - 1].end
			};
		}
	}

	return null;
}

/**
 * Get week dates starting from a specific date
 */
export function getWeekDates(date: Date): Date[] {
	const dates = [];
	const startOfWeek = new Date(date);
	const day = startOfWeek.getDay();
	const diff = startOfWeek.getDate() - day;
	startOfWeek.setDate(diff);

	for (let i = 0; i < 7; i++) {
		const d = new Date(startOfWeek);
		d.setDate(startOfWeek.getDate() + i);
		dates.push(d);
	}
	return dates;
}

/**
 * Get month dates for calendar grid
 */
export function getMonthDates(date: Date): Date[] {
	const dates = [];
	const year = date.getFullYear();
	const month = date.getMonth();
	const firstDay = new Date(year, month, 1);
	const lastDay = new Date(year, month + 1, 0);

	// Start from Sunday of the week containing the first day
	const startDate = new Date(firstDay);
	startDate.setDate(startDate.getDate() - startDate.getDay());

	// End on Saturday of the week containing the last day
	const endDate = new Date(lastDay);
	endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

	for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
		dates.push(new Date(d));
	}
	return dates;
}

/**
 * Sort tasks by dependencies
 */
export function sortTasksByDependencies(tasks: any[]): any[] {
	const sorted: any[] = [];
	const visited = new Set<string>();

	function visit(task: any) {
		if (visited.has(task.id)) return;
		visited.add(task.id);

		// Visit dependencies first
		if (task.dependencies && Array.isArray(task.dependencies)) {
			for (const depId of task.dependencies) {
				const dep = tasks.find((t) => t.id === depId);
				if (dep) visit(dep);
			}
		}

		sorted.push(task);
	}

	// Visit all tasks
	for (const task of tasks) {
		visit(task);
	}

	return sorted;
}

/**
 * Calculate duration in minutes between two dates
 */
export function calculateDuration(start: Date, end: Date): number {
	return Math.round((end.getTime() - start.getTime()) / 60000);
}

/**
 * Check if a date is in the past
 */
export function isInPast(date: Date): boolean {
	return date < new Date();
}

/**
 * Get conflict severity color
 */
export function getConflictSeverityColor(severity: string): string {
	return severity === 'error'
		? 'text-red-600 dark:text-red-400'
		: 'text-amber-600 dark:text-amber-400';
}
