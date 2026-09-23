// apps/web/src/lib/utils/calendar-item-timing.ts
import {
	addDays,
	differenceInCalendarDays,
	differenceInMinutes,
	format,
	formatDistanceStrict,
	isSameDay,
	startOfDay
} from 'date-fns';

/**
 * Human timing for a calendar item: when it is, how long it runs, and where it sits
 * relative to now. Pure so the side panel, tests, and any future surface agree.
 */

export type CalendarTimingKind = 'event' | 'range' | 'start' | 'due';
export type CalendarTimingTone = 'overdue' | 'now' | 'soon' | 'upcoming' | 'past' | 'done';

export interface CalendarTimingInput {
	kind: CalendarTimingKind;
	start: Date;
	/** Exclusive end. Ignored for start/due markers, whose 30-minute span is synthetic. */
	end?: Date | null;
	allDay?: boolean;
	completedAt?: Date | null;
}

export interface CalendarItemTiming {
	dateLabel: string;
	timeLabel: string;
	durationLabel: string | null;
	relativeLabel: string | null;
	tone: CalendarTimingTone;
}

const SOON_MS = 24 * 60 * 60 * 1000;

function formatDay(date: Date, now: Date): string {
	return date.getFullYear() === now.getFullYear()
		? format(date, 'EEE, MMM d')
		: format(date, 'EEE, MMM d, yyyy');
}

/** "45m", "2h", "1h 30m", "1d 4h". */
export function formatDurationMinutes(totalMinutes: number): string {
	const minutes = Math.max(0, Math.round(totalMinutes));
	if (minutes < 60) return `${minutes}m`;
	const days = Math.floor(minutes / (24 * 60));
	const hours = Math.floor((minutes % (24 * 60)) / 60);
	const rest = minutes % 60;
	if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
	return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

/** "2:00 – 3:30 PM" when both share a meridiem, else "11:00 AM – 1:00 PM". */
export function formatTimeRange(start: Date, end: Date): string {
	const sameMeridiem = format(start, 'a') === format(end, 'a');
	return sameMeridiem
		? `${format(start, 'h:mm')} – ${format(end, 'h:mm a')}`
		: `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`;
}

/**
 * Calendar-day wording: "in 4 hours" only on the same day, then "tomorrow" /
 * "in 3 days", so a deadline tomorrow night never reads as "in 2 days".
 */
function relativeDay(target: Date, now: Date, future: string, past: string): string {
	const days = differenceInCalendarDays(target, now);
	if (days === 0) {
		return target > now
			? `${future} in ${formatDistanceStrict(target, now)}`
			: `${past} ${formatDistanceStrict(target, now)} ago`;
	}
	if (days === 1) return `${future} tomorrow`;
	if (days === -1) return `${past} yesterday`;
	return days > 0 ? `${future} in ${days} days` : `${past} ${-days} days ago`;
}

function completedLabel(completedAt: Date, now: Date): string {
	return relativeDay(completedAt, now, 'Completes', 'Completed');
}

function describeAllDay(start: Date, end: Date | null, now: Date): CalendarItemTiming {
	// All-day ends are normally midnight-exclusive, but an event edited with the "All-day"
	// checkbox can keep a clock time; that end still covers its whole last day.
	const exclusiveEnd =
		end && end > start
			? end.getTime() === startOfDay(end).getTime()
				? end
				: addDays(startOfDay(end), 1)
			: addDays(startOfDay(start), 1);
	const days = Math.max(1, differenceInCalendarDays(exclusiveEnd, startOfDay(start)));
	const lastDay = addDays(startOfDay(exclusiveEnd), -1);
	const today = startOfDay(now);

	let relativeLabel: string;
	let tone: CalendarTimingTone;
	if (today < startOfDay(start)) {
		const inDays = differenceInCalendarDays(start, today);
		relativeLabel = inDays === 1 ? 'Tomorrow' : `Starts in ${inDays} days`;
		tone = inDays === 1 ? 'soon' : 'upcoming';
	} else if (today > lastDay) {
		relativeLabel = relativeDay(lastDay, now, 'Ends', 'Ended');
		tone = 'past';
	} else {
		relativeLabel =
			days > 1 ? `Day ${differenceInCalendarDays(today, start) + 1} of ${days}` : 'Today';
		tone = 'now';
	}

	return {
		dateLabel:
			days > 1
				? `${formatDay(start, now)} – ${formatDay(lastDay, now)}`
				: formatDay(start, now),
		timeLabel: 'All day',
		durationLabel: days > 1 ? `${days} days` : null,
		relativeLabel,
		tone
	};
}

export function describeCalendarItemTiming(
	input: CalendarTimingInput,
	now: Date = new Date()
): CalendarItemTiming {
	const { kind, start } = input;

	if (kind === 'due') {
		const timeLabel = `Due ${format(start, 'h:mm a')}`;
		if (input.completedAt) {
			return {
				dateLabel: formatDay(start, now),
				timeLabel,
				durationLabel: null,
				relativeLabel: completedLabel(input.completedAt, now),
				tone: 'done'
			};
		}
		const overdue = start.getTime() <= now.getTime();
		const daysLate = differenceInCalendarDays(now, start);
		return {
			dateLabel: formatDay(start, now),
			timeLabel,
			durationLabel: null,
			relativeLabel: !overdue
				? relativeDay(start, now, 'Due', 'Due')
				: daysLate === 0
					? `Overdue by ${formatDistanceStrict(now, start)}`
					: daysLate === 1
						? 'Overdue since yesterday'
						: `Overdue by ${daysLate} days`,
			tone: overdue
				? 'overdue'
				: start.getTime() - now.getTime() <= SOON_MS
					? 'soon'
					: 'upcoming'
		};
	}

	if (kind === 'start') {
		const started = start.getTime() <= now.getTime();
		return {
			dateLabel: formatDay(start, now),
			timeLabel: `Starts ${format(start, 'h:mm a')}`,
			durationLabel: null,
			relativeLabel: input.completedAt
				? completedLabel(input.completedAt, now)
				: relativeDay(start, now, 'Starts', 'Started'),
			tone: input.completedAt ? 'done' : started ? 'past' : 'upcoming'
		};
	}

	if (input.allDay) return describeAllDay(start, input.end ?? null, now);

	const end = input.end && input.end > start ? input.end : start;
	const sameDay = isSameDay(start, end);
	// Across days, pair each date with its own time so the span reads start → end.
	const dateLabel = sameDay
		? formatDay(start, now)
		: `${formatDay(start, now)}, ${format(start, 'h:mm a')}`;
	const timeLabel =
		end.getTime() === start.getTime()
			? format(start, 'h:mm a')
			: sameDay
				? formatTimeRange(start, end)
				: `to ${formatDay(end, now)}, ${format(end, 'h:mm a')}`;
	const minutes = differenceInMinutes(end, start);

	let relativeLabel: string;
	let tone: CalendarTimingTone;
	if (input.completedAt) {
		relativeLabel = completedLabel(input.completedAt, now);
		tone = 'done';
	} else if (now < start) {
		relativeLabel = relativeDay(start, now, 'Starts', 'Started');
		tone = start.getTime() - now.getTime() <= SOON_MS ? 'soon' : 'upcoming';
	} else if (now < end) {
		relativeLabel = `Happening now · ${formatDistanceStrict(end, now)} left`;
		tone = 'now';
	} else {
		relativeLabel = relativeDay(end, now, 'Ends', 'Ended');
		tone = 'past';
	}

	return {
		dateLabel,
		timeLabel,
		durationLabel: minutes > 0 ? formatDurationMinutes(minutes) : null,
		relativeLabel,
		tone
	};
}

export type QuickReschedulePreset = 'tomorrow' | 'nextWeek';

export interface QuickReschedulePlan {
	targetDay: Date;
	days: number;
	patch: { start_at?: string; due_at?: string };
}

type QuickRescheduleTask = { start_at?: string | null; due_at?: string | null };

function quickRescheduleTargetDay(preset: QuickReschedulePreset, now: Date): Date {
	return addDays(startOfDay(now), preset === 'tomorrow' ? 1 : 7);
}

/**
 * False when the task's deadline already falls after the preset's day: moving there would
 * pull the deadline earlier, so the action is not offered at all.
 */
export function offersQuickReschedule(
	task: QuickRescheduleTask,
	preset: QuickReschedulePreset,
	now: Date = new Date()
): boolean {
	const due = task.due_at ? new Date(task.due_at) : null;
	if (!due || Number.isNaN(due.getTime())) return true;
	return differenceInCalendarDays(quickRescheduleTargetDay(preset, now), due) >= 0;
}

/**
 * Move a task to tomorrow or a week out (same offsets the overdue triage uses) while
 * keeping its time of day and, when it has both dates, the span between them.
 * Returns null when the task has no dates, is already on the target day, or is due after
 * it. A deadline never moves earlier and a shifted start never lands before today.
 */
export function planQuickReschedule(
	task: QuickRescheduleTask,
	preset: QuickReschedulePreset,
	now: Date = new Date()
): QuickReschedulePlan | null {
	const due = task.due_at ? new Date(task.due_at) : null;
	const start = task.start_at ? new Date(task.start_at) : null;
	const anchor = due ?? start;
	if (!anchor || Number.isNaN(anchor.getTime())) return null;
	if (!offersQuickReschedule(task, preset, now)) return null;

	const today = startOfDay(now);
	const targetDay = quickRescheduleTargetDay(preset, now);
	const days = differenceInCalendarDays(targetDay, anchor);
	if (days === 0) return null;

	const patch: QuickReschedulePlan['patch'] = {};
	if (due) patch.due_at = addDays(due, days).toISOString();
	if (start && !Number.isNaN(start.getTime())) {
		const moved = addDays(start, days);
		// A long-overdue span keeps its deadline shift but restarts today, at its own time.
		patch.start_at = (
			moved < today ? addDays(moved, differenceInCalendarDays(today, moved)) : moved
		).toISOString();
	}
	return { targetDay, days, patch };
}

/** Google descriptions are HTML; show them as plain text without rendering markup. */
export function htmlToPlainText(value: string): string {
	const withBreaks = value
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
		.replace(/<li[^>]*>/gi, '• ');
	if (typeof DOMParser !== 'undefined') {
		const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
		return (doc.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
	}
	return withBreaks
		.replace(/<[^>]+>/g, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}
