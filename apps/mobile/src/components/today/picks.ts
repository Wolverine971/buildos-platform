// apps/mobile/src/components/today/picks.ts
// The one thing Today puts on top ("Start here" / "Next up") with two runners-up behind
// "Not this", the evening close-out's answers, and the suggestions the brief keeps repeating.
// Ported from apps/web/src/lib/components/today/today-picks.ts and the web Today page; plain
// rules, no model. No React Native imports, so it runs in node tests.
import type { TodayTask, TodayWaitingItem, WhatChangedEntry } from '@buildos/api-client';

export type TodayPickKind = 'due' | 'start' | 'waiting' | 'new' | 'agent' | 'progress';

export type TodayPick = {
	key: string;
	kind: TodayPickKind;
	title: string;
	projectId: string | null;
	projectName: string | null;
	why: string;
	task: TodayTask | null;
	waiting: TodayWaitingItem | null;
};

export const PICK_TAGS: Record<TodayPickKind, string> = {
	due: 'Due soon',
	start: 'Starts today',
	waiting: 'Waiting on you',
	new: 'You just added this',
	agent: 'An agent made this',
	progress: 'In progress'
};

const MAX_PICKS = 3;

export function dueWords(days: number, weekday: string | null): string {
	if (days < -1) return 'Overdue';
	if (days === -1) return 'Was due yesterday';
	if (days === 0) return 'Due today';
	if (days === 1) return 'Due tomorrow';
	return weekday ? `Due ${weekday}` : `Due in ${days} days`;
}

/** "since Nov 3" for a YYYY-MM-DD, or '' when unknown. */
export function sinceLabel(since: string | null): string {
	if (!since) return '';
	const date = new Date(`${since}T12:00:00Z`);
	if (Number.isNaN(date.getTime())) return '';
	return `since ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
}

/** "Fri" for a due instant, read in the feed's timezone (a bare date reads as itself). */
export function dueWeekday(dueAt: string, timezone: string): string | null {
	const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dueAt);
	const instant = new Date(dateOnly ? `${dueAt}T12:00:00Z` : dueAt);
	if (Number.isNaN(instant.getTime())) return null;
	try {
		return instant.toLocaleDateString('en-US', {
			weekday: 'short',
			timeZone: dateOnly ? 'UTC' : timezone
		});
	} catch {
		return instant.toLocaleDateString('en-US', { weekday: 'short' });
	}
}

/** The row's second line on the web: "Due Fri", "You added this", "Added by one of your agents". */
export function taskMeta(task: TodayTask, timezone: string): string | null {
	if (task.bucket === 'due_soon' && task.due_in_days != null && task.due_at)
		return dueWords(task.due_in_days, dueWeekday(task.due_at, timezone));
	if (task.bucket === 'new')
		return task.created_by_you ? 'You added this' : 'Added by one of your agents';
	return null;
}

function isClosed(task: TodayTask): boolean {
	return task.state_key === 'done' || task.state_key === 'blocked';
}

export function pickTodayFocus({
	tasks,
	waiting,
	doneIds,
	weekdayOf
}: {
	tasks: readonly TodayTask[];
	waiting: readonly TodayWaitingItem[];
	/** Tasks finished this visit; they leave the picks at once. */
	doneIds: ReadonlySet<string>;
	/** Short weekday of a due date ("Fri") in the person's timezone. */
	weekdayOf: (dueAt: string) => string | null;
}): TodayPick[] {
	const scored: { score: number; pick: TodayPick }[] = [];
	const taskById = new Map(tasks.map((task) => [task.id, task]));

	for (const task of tasks) {
		if (doneIds.has(task.id) || isClosed(task)) continue;
		const base = {
			key: `task:${task.id}`,
			title: task.title,
			projectId: task.project_id,
			projectName: task.project_name,
			task,
			waiting: null
		};
		const days = task.due_in_days ?? null;
		if (days !== null && days >= -1 && days <= 7) {
			const score = days <= 2 ? 100 - days : days <= 4 ? 75 - days : 60 - days;
			const why = `${dueWords(days, task.due_at ? weekdayOf(task.due_at) : null)}.`;
			scored.push({ score, pick: { ...base, kind: 'due', why } });
		} else if (task.bucket === 'starts_today') {
			scored.push({
				score: 90,
				pick: { ...base, kind: 'start', why: 'You set it to start today.' }
			});
		} else if (task.bucket === 'new') {
			scored.push(
				task.created_by_you
					? {
							score: 70,
							pick: {
								...base,
								kind: 'new',
								why: 'You added this in the last few days.'
							}
						}
					: {
							score: 50,
							pick: {
								...base,
								kind: 'agent',
								why: 'One of your agents made this for you to look at.'
							}
						}
			);
		} else if (task.bucket === 'in_progress') {
			scored.push({
				score: 40,
				pick: { ...base, kind: 'progress', why: 'You were in the middle of this.' }
			});
		}
	}

	for (const item of waiting) {
		if (item.direction !== 'on_you') continue;
		const task = item.task_id ? (taskById.get(item.task_id) ?? null) : null;
		if (task && doneIds.has(task.id)) continue;
		const since = sinceLabel(item.since);
		scored.push({
			score: 80,
			pick: {
				key: `waiting:${item.id}`,
				kind: 'waiting',
				title: item.what,
				projectId: item.project_id,
				projectName: item.project_name,
				why: `${item.who} is waiting on you${since ? ` ${since}` : ''}.`,
				task,
				waiting: item
			}
		});
	}

	// Stable: equal scores keep feed order, as the web's Array.sort does.
	scored.sort((a, b) => b.score - a.score);
	const picks: TodayPick[] = [];
	const usedProjects = new Set<string>();
	const usedTasks = new Set<string>();
	for (const { pick } of scored) {
		if (pick.projectId && usedProjects.has(pick.projectId)) continue;
		if (pick.task && usedTasks.has(pick.task.id)) continue;
		if (pick.projectId) usedProjects.add(pick.projectId);
		if (pick.task) usedTasks.add(pick.task.id);
		picks.push(pick);
		if (picks.length === MAX_PICKS) break;
	}
	return picks;
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export function timeOfDay(hour: number): TimeOfDay {
	if (hour < 12) return 'morning';
	if (hour < 17) return 'afternoon';
	return 'evening';
}

/** The person's answer for one pick in the evening close-out. */
export type CloseOutAnswer = 'done' | 'progress' | 'not_today' | 'let_go';

export const CLOSE_OUT_OPTIONS: { value: CloseOutAnswer; label: string }[] = [
	{ value: 'done', label: 'Done' },
	{ value: 'progress', label: 'Some progress' },
	{ value: 'not_today', label: 'Not today' },
	{ value: 'let_go', label: 'Let it go' }
];

/** What the person did with a suggestion the brief keeps repeating. */
export type RepeatedChoice = 'keep' | 'snooze' | 'let_go';

export const REPEATED_DONE_LABEL: Record<RepeatedChoice, string> = {
	keep: 'Kept. Hidden here for two weeks.',
	snooze: 'Snoozed a month',
	let_go: 'Let go. It moved to the archive.'
};

/** Snooze moves the due date a month out: the end of that day on this phone. */
export function snoozeDueAt(today: string): string {
	const [y, m, d] = today.split('-').map(Number);
	return new Date(y!, m! - 1, d! + 30, 23, 59, 59).toISOString();
}

/** The close-out's "What BuildOS saw today". */
export type DaySeen = { you: number; agents: string[] };

/**
 * BuildOS chat is the person talking, so it counts as "you"; connected agents (Claude Code,
 * Codex) and project members get one line each.
 */
export function summarizeDay(entries: readonly WhatChangedEntry[]): DaySeen {
	const you = entries.filter(
		(entry) => entry.actor_kind === 'you' || entry.actor_kind === 'agent'
	).length;
	const byActor = new Map<string, { count: number; projects: Set<string> }>();
	for (const entry of entries) {
		if (entry.actor_kind !== 'external_agent' && entry.actor_kind !== 'member') continue;
		const row = byActor.get(entry.actor_label) ?? { count: 0, projects: new Set<string>() };
		row.count += 1;
		row.projects.add(entry.project_name);
		byActor.set(entry.actor_label, row);
	}
	const agents = [...byActor].map(
		([label, row]) =>
			`${label}: ${row.count} change${row.count === 1 ? '' : 's'} in ${[...row.projects].slice(0, 3).join(', ')}`
	);
	return { you, agents };
}

export function seenYouLine(you: number | null): string {
	if (you === null) return 'Checking…';
	if (you === 0) return "You didn't change anything in BuildOS today.";
	return `You changed ${you} thing${you === 1 ? '' : 's'} in BuildOS.`;
}

/** The close-out's chat draft; the person says the rest (the web sends its text box with it). */
export const CLOSE_OUT_DRAFT = "Closing out my day. Here's what happened: ";

/** The draft a waiting row's follow-up key puts in chat (not sent). */
export function nudgeDraft(item: Pick<TodayWaitingItem, 'who' | 'what'>): string {
	return `Help me follow up with ${item.who}. I'm waiting on: ${item.what}`;
}

/** "Talk it through": the day written out for Workspace chat to help plan (the web's draft). */
export function buildDayDraft(input: {
	dateLabel: string;
	allDay: readonly { title: string }[];
	schedule: readonly {
		timeLabel: string;
		title: string;
		kind: 'event' | 'task';
		projectId: string | null;
	}[];
	anytime: readonly Pick<TodayTask, 'title' | 'project_name' | 'bucket'>[];
	overdueCount: number;
	projectName: (projectId: string | null) => string | null;
}): string {
	const lines: string[] = [`Here's my day (${input.dateLabel}):`];
	if (input.allDay.length > 0) {
		lines.push('', 'All day:');
		for (const event of input.allDay.slice(0, 6))
			lines.push(`- ${event.title || 'Untitled event'}`);
	}
	if (input.schedule.length > 0) {
		lines.push('', 'Schedule:');
		for (const entry of input.schedule.slice(0, 14)) {
			const project = input.projectName(entry.projectId);
			lines.push(
				`- ${entry.timeLabel}: ${entry.title}${project ? ` (${project})` : ''}${entry.kind === 'task' ? ' [task]' : ''}`
			);
		}
	}
	if (input.anytime.length > 0) {
		lines.push('', 'Tasks for today (anytime):');
		for (const task of input.anytime.slice(0, 14)) {
			const status = task.bucket === 'in_progress' ? ' — in progress' : '';
			lines.push(`- ${task.title} (${task.project_name})${status}`);
		}
	}
	if (input.overdueCount > 0) {
		lines.push(
			'',
			`I also have ${input.overdueCount} overdue task${input.overdueCount === 1 ? '' : 's'}.`
		);
	}
	lines.push('', 'Help me review my day and figure out what to focus on.');
	return lines.join('\n').slice(0, 2300);
}
