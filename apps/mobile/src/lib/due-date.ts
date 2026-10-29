// apps/mobile/src/lib/due-date.ts
/**
 * Due dates on the phone. A pick is sent as the end of that day on this phone (an instant), not
 * as a bare `YYYY-MM-DD`: the server would read a bare day in the account's saved timezone, and
 * when that differs from the phone's, "Today" would come back labelled "Due tomorrow".
 */

export function civilDay(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/** 23:59:59 on that day in this phone's timezone, as an ISO instant. */
export function endOfDay(date: Date): string {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59).toISOString();
}

function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

export type DuePick = {
	key: 'today' | 'tomorrow' | 'next_week';
	label: string;
	/** The civil day, for matching against a stored due date. */
	day: string;
	/** What to send as `due_at`. */
	value: string;
};

/** Today, Tomorrow, and next Monday (never the same day as Tomorrow). */
function pickFor(key: DuePick['key'], label: string, date: Date): DuePick {
	return { key, label, day: civilDay(date), value: endOfDay(date) };
}

export function duePicks(now: Date): DuePick[] {
	const day = now.getDay(); // 0 Sunday … 6 Saturday
	const untilMonday = (8 - day) % 7 || 7;
	const toMonday = untilMonday === 1 ? 8 : untilMonday;
	return [
		pickFor('today', 'Today', now),
		pickFor('tomorrow', 'Tomorrow', addDays(now, 1)),
		pickFor('next_week', 'Next week', addDays(now, toMonday))
	];
}

function startOfDay(date: Date): number {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** `Due today`, `Due tomorrow`, `Due Fri, Oct 31`, `Overdue · Oct 27`, or null when unset. */
export function describeDue(dueAt: string | null | undefined, now: Date): string | null {
	if (!dueAt) return null;
	const due = new Date(dueAt);
	if (Number.isNaN(due.getTime())) return null;
	const days = Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000);
	const short = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	if (days < 0) return `Overdue · ${short}`;
	if (days === 0) return 'Due today';
	if (days === 1) return 'Due tomorrow';
	if (days < 7) {
		return `Due ${due.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
	}
	return `Due ${short}`;
}

/** Whether a stored due date falls on the civil day `value` (`YYYY-MM-DD`). */
export function isDueOn(dueAt: string | null | undefined, value: string): boolean {
	if (!dueAt) return false;
	const due = new Date(dueAt);
	return !Number.isNaN(due.getTime()) && civilDay(due) === value;
}
