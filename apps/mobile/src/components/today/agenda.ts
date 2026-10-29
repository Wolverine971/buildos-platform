// apps/mobile/src/components/today/agenda.ts
// How Today lays out its feed: all-day events, the timed schedule, then the anytime groups.
// Ported from apps/web/src/routes/today/+page.svelte and
// apps/web/src/lib/components/today/today-task-order.ts. No React Native imports, so it runs
// in node tests.
import type {
	TodayFeed,
	TodayFeedDegradedSection,
	TodayProject,
	TodayTask,
	TodayTaskBucket
} from '@buildos/api-client';

export const TODAY_TASK_BUCKETS: { key: TodayTaskBucket; label: string }[] = [
	{ key: 'due_today', label: 'Due today' },
	{ key: 'starts_today', label: 'Starts today' },
	{ key: 'in_progress', label: 'In progress' }
];

const BUCKET_RANK: Record<TodayTaskBucket, number> = {
	due_today: 0,
	starts_today: 1,
	in_progress: 2
};

/** An all-day event, shown as a pill above the schedule. */
export type AllDayEntry = {
	key: string;
	title: string;
	projectId: string | null;
	/** The task the event is linked to, when it is in today's feed. */
	task: TodayTask | null;
};

/** One timed line in the schedule: an event, or a task due or starting at a set time. */
export type ScheduleEntry = {
	key: string;
	kind: 'event' | 'task';
	sortMs: number;
	endMs: number | null;
	title: string;
	/** Rail label, e.g. "12:00 PM". */
	timeLabel: string;
	/** "12:00 PM – 1:00 PM" for events, "Due 3:00 PM" / "Starts 9:00 AM" for tasks. */
	metaLabel: string;
	projectId: string | null;
	/** What the row opens: the timed task itself, or the task an event is linked to. */
	task: TodayTask | null;
};

export type TodayAgenda = {
	allDay: AllDayEntry[];
	schedule: ScheduleEntry[];
	/** Tasks with no set time today, by bucket then title. */
	anytime: TodayTask[];
};

export type TodayTaskGroup = {
	key: TodayTaskBucket;
	label: string;
	projects: { id: string; name: string; tasks: TodayTask[] }[];
};

export function isDone(task: Pick<TodayTask, 'state_key'> | null | undefined): boolean {
	return task?.state_key === 'done';
}

// ---------------------------------------------------------------------------------------------
// Clock and calendar helpers

let localZone: string | null = null;

/** The phone's IANA timezone ('' when Intl can't say). */
export function localTimeZone(): string {
	if (localZone === null) {
		try {
			localZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
		} catch {
			localZone = '';
		}
	}
	return localZone;
}

const clockFormats = new Map<string, Intl.DateTimeFormat>();

function clockFormat(timezone: string | null | undefined): Intl.DateTimeFormat {
	const key = timezone ?? '';
	let format = clockFormats.get(key);
	if (!format) {
		try {
			format = new Intl.DateTimeFormat(undefined, {
				hour: 'numeric',
				minute: '2-digit',
				...(timezone ? { timeZone: timezone } : {})
			});
		} catch {
			// Unknown zone: the phone's clock is the best guess (the feed asks in its zone).
			format = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
		}
		clockFormats.set(key, format);
	}
	return format;
}

/** "12:00 PM" (or "12:00" on a 24-hour phone) in `timezone`; '' for a bad date. */
export function formatClock(value: string | number, timezone?: string | null): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return clockFormat(timezone).format(date);
}

// A formatted clock time with its day period after it: "12:00 PM", "9:05 a.m.".
const CLOCK_WITH_PERIOD = /^([\d:.]+)[\s  ]*([^\d\s  :.]\D*)$/;

/** Splits "12:00 PM" into its time and day period, so the rail can stack them. */
export function splitClock(label: string): { time: string; period: string | null } {
	const match = CLOCK_WITH_PERIOD.exec(label.trim());
	if (!match) return { time: label.trim(), period: null };
	return { time: match[1]!, period: match[2]!.trim() };
}

/** "Thursday, October 29" from a `YYYY-MM-DD` day. */
export function formatDay(isoDate: string): string {
	const [year, month, day] = isoDate.split('-').map(Number);
	if (!year || !month || !day) return isoDate;
	return new Date(year, month - 1, day).toLocaleDateString(undefined, {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});
}

const wallFormats = new Map<string, Intl.DateTimeFormat>();
const pad2 = (n: number) => String(n).padStart(2, '0');

/** `HH:MM:SS` on the wall clock in `timezone` (the phone's clock when that is the zone). */
function wallClock(value: string, timezone: string | null | undefined): string | null {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	if (timezone && timezone !== localTimeZone()) {
		try {
			let format = wallFormats.get(timezone);
			if (!format) {
				format = new Intl.DateTimeFormat('en-US', {
					timeZone: timezone,
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit',
					hourCycle: 'h23'
				});
				wallFormats.set(timezone, format);
			}
			const parts = format.formatToParts(date);
			const part = (type: Intl.DateTimeFormatPartTypes) =>
				Number(parts.find((entry) => entry.type === type)?.value ?? NaN);
			const [h, m, s] = [part('hour') % 24, part('minute'), part('second')];
			if (![h, m, s].some(Number.isNaN)) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
		} catch {
			// Fall through to the phone's clock.
		}
	}
	return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

// Legacy date-only boundaries were stored as UTC sentinels (see the web's date-only-semantics.ts).
const DATE_ONLY_START = /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?(?:Z|\+00(?::00)?)$/;
const DATE_ONLY_END = /^\d{4}-\d{2}-\d{2}T23:59:59(?:\.0+)?(?:Z|\+00(?::00)?)$/;

/**
 * True when a task boundary means a whole day, not a clock time: a legacy UTC sentinel, or the
 * day's first (start) or last (due) second in the person's timezone.
 */
export function isDateOnly(
	value: string,
	boundary: 'start' | 'end',
	timezone: string | null | undefined
): boolean {
	if ((boundary === 'start' ? DATE_ONLY_START : DATE_ONLY_END).test(value)) return true;
	return wallClock(value, timezone) === (boundary === 'start' ? '00:00:00' : '23:59:59');
}

// ---------------------------------------------------------------------------------------------
// Layout

function parseMs(value: string | null | undefined): number | null {
	if (!value) return null;
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : ms;
}

/** Splits the feed into all-day events, the timed schedule and anytime tasks, like the web. */
export function buildAgenda(feed: TodayFeed): TodayAgenda {
	const time = (value: string) => formatClock(value, feed.timezone);
	const taskById = new Map(feed.tasks.map((task) => [task.id, task]));
	// A task with a calendar event shows once, on the event's line.
	const linked = new Set<string>();
	for (const event of feed.events) {
		if (event.task_id && taskById.has(event.task_id)) linked.add(event.task_id);
	}

	const allDay: AllDayEntry[] = [];
	const schedule: ScheduleEntry[] = [];

	for (const event of feed.events) {
		const task = event.task_id ? (taskById.get(event.task_id) ?? null) : null;
		const title = event.title?.trim() || 'Untitled event';
		const key = `event-${event.calendar_item_id}`;
		const projectId = event.project_id ?? task?.project_id ?? null;
		const startMs = parseMs(event.start_at);
		if (event.all_day || startMs === null) {
			allDay.push({ key, title, projectId, task });
			continue;
		}
		const endMs = parseMs(event.end_at);
		const start = time(event.start_at);
		schedule.push({
			key,
			kind: 'event',
			sortMs: startMs,
			endMs,
			title,
			timeLabel: start,
			metaLabel: endMs !== null && event.end_at ? `${start} – ${time(event.end_at)}` : start,
			projectId,
			task
		});
	}

	const anytime: TodayTask[] = [];
	for (const task of feed.tasks) {
		if (linked.has(task.id)) continue;
		const dueMs = parseMs(task.due_at);
		const startMs = parseMs(task.start_at);
		if (
			task.bucket === 'due_today' &&
			task.due_at &&
			dueMs !== null &&
			!isDateOnly(task.due_at, 'end', feed.timezone)
		) {
			schedule.push(timedTask(task, dueMs, `Due ${time(task.due_at)}`, time(task.due_at)));
		} else if (
			task.bucket === 'starts_today' &&
			task.start_at &&
			startMs !== null &&
			!isDateOnly(task.start_at, 'start', feed.timezone)
		) {
			schedule.push(
				timedTask(task, startMs, `Starts ${time(task.start_at)}`, time(task.start_at))
			);
		} else {
			anytime.push(task);
		}
	}

	schedule.sort((a, b) => a.sortMs - b.sortMs);
	anytime.sort(
		(a, b) => BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket] || a.title.localeCompare(b.title)
	);
	return { allDay, schedule, anytime };
}

function timedTask(
	task: TodayTask,
	sortMs: number,
	metaLabel: string,
	timeLabel: string
): ScheduleEntry {
	return {
		key: `task-${task.id}`,
		kind: 'task',
		sortMs,
		endMs: null,
		title: task.title,
		timeLabel,
		metaLabel,
		projectId: task.project_id,
		task
	};
}

/** Urgency first, then project (by id, so equally named projects stay apart); tasks keep order. */
export function groupTodayTasks(tasks: readonly TodayTask[]): TodayTaskGroup[] {
	const byBucket = new Map(
		TODAY_TASK_BUCKETS.map((bucket) => [bucket.key, new Map<string, TodayTask[]>()])
	);
	for (const task of tasks) {
		const projects = byBucket.get(task.bucket);
		if (!projects) continue;
		const list = projects.get(task.project_id);
		if (list) list.push(task);
		else projects.set(task.project_id, [task]);
	}
	return TODAY_TASK_BUCKETS.map((bucket) => {
		const projects = byBucket.get(bucket.key);
		return {
			...bucket,
			projects: projects
				? Array.from(projects, ([id, items]) => ({
						id,
						name: items[0]?.project_name ?? '',
						tasks: items
					}))
				: []
		};
	}).filter((bucket) => bucket.projects.length > 0);
}

/** Task ids as they read down the page, for the reader's Prev and Next. */
export function walkOrder(agenda: TodayAgenda, groups: readonly TodayTaskGroup[]): string[] {
	const ids: string[] = [];
	const seen = new Set<string>();
	const add = (task: TodayTask | null) => {
		if (!task || seen.has(task.id)) return;
		seen.add(task.id);
		ids.push(task.id);
	};
	for (const entry of agenda.allDay) add(entry.task);
	for (const entry of agenda.schedule) add(entry.task);
	for (const bucket of groups) {
		for (const project of bucket.projects) for (const task of project.tasks) add(task);
	}
	return ids;
}

// ---------------------------------------------------------------------------------------------
// Now

const HOUR_MS = 60 * 60 * 1000;

/** Where the "now" line goes: before the first later entry, or after the last (-1 when empty). */
export function nowMarkerIndex(schedule: readonly ScheduleEntry[], nowMs: number): number {
	if (schedule.length === 0) return -1;
	const index = schedule.findIndex((entry) => entry.sortMs > nowMs);
	return index === -1 ? schedule.length : index;
}

/** An event under way (an event with no end counts as an hour long). */
export function isCurrent(entry: ScheduleEntry, nowMs: number): boolean {
	if (entry.kind !== 'event') return false;
	return entry.sortMs <= nowMs && (entry.endMs ?? entry.sortMs + HOUR_MS) > nowMs;
}

export function isPast(entry: ScheduleEntry, nowMs: number): boolean {
	if (entry.kind !== 'event') return false;
	return (entry.endMs ?? entry.sortMs + HOUR_MS) <= nowMs;
}

/** The next thing on the schedule that hasn't started (skipping timed tasks already done). */
export function nextEntry(schedule: readonly ScheduleEntry[], nowMs: number): ScheduleEntry | null {
	return (
		schedule.find(
			(entry) => entry.sortMs > nowMs && !(entry.kind === 'task' && isDone(entry.task))
		) ?? null
	);
}

// ---------------------------------------------------------------------------------------------
// The rest of the page

/** Same split as the web's isActiveFacing(): only completed, cancelled and paused are inactive. */
export function isActiveFacing(state: string | null | undefined): boolean {
	const key = state?.trim().toLowerCase();
	return key !== 'completed' && key !== 'cancelled' && key !== 'paused';
}

/** Real projects (the Workspace rides in the list for names but isn't one). */
export function hasProjects(feed: TodayFeed): boolean {
	return feed.projects.some((project) => project.kind !== 'workspace');
}

/** For a day with nothing dated: each active project's next move. */
export function waitingProjects(feed: TodayFeed, limit = 6): TodayProject[] {
	return feed.projects
		.filter(
			(project) =>
				project.kind !== 'workspace' &&
				isActiveFacing(project.state_key) &&
				Boolean(project.next_step_short?.trim())
		)
		.slice(0, limit);
}

export function isClearDay(feed: TodayFeed, agenda: TodayAgenda): boolean {
	return (
		feed.degradedSections.length === 0 &&
		agenda.allDay.length === 0 &&
		agenda.schedule.length === 0 &&
		agenda.anytime.length === 0
	);
}

const DEGRADED_LABEL: Record<TodayFeedDegradedSection, string> = {
	events: 'calendar events',
	tasks: 'tasks',
	overdue: 'overdue count'
};

/** "Calendar events, tasks may be incomplete." */
export function describeDegraded(sections: readonly TodayFeedDegradedSection[]): string {
	if (sections.length === 0) return '';
	const text = `${sections.map((section) => DEGRADED_LABEL[section] ?? section).join(', ')} may be incomplete.`;
	return text.charAt(0).toUpperCase() + text.slice(1);
}

