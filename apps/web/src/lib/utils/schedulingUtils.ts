// apps/web/src/lib/utils/schedulingUtils.ts

import { format, startOfDay, getDay, setHours, setMinutes } from 'date-fns';
import type { TaskWithCalendarEvents } from '$lib/types/project-page.types';

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
		return new Date(year!, month! - 1, day!); // month is 0-indexed
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

	const dayStart = setMinutes(setHours(startOfDay(date), startHour!), startMin || 0);
	const dayEnd = setMinutes(setHours(startOfDay(date), endHour!), endMin || 0);

	return { start: dayStart, end: dayEnd };
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
 * Calculate duration in minutes between two dates
 */
export function calculateDuration(start: Date, end: Date): number {
	return Math.round((end.getTime() - start.getTime()) / 60000);
}
