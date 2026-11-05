// apps/web/src/lib/components/today/today-picks.ts
// The one thing Today puts on top ("Start here" / "Next up"), with two runners-up behind
// "Not this". Plain rules, no model: due soonest, then what starts today, then someone
// waiting on you, then what you just added. At most one per project so the picks spread out.
import type { TodayTask, TodayWaitingItem } from '$lib/types/today';

export type TodayPickKind = 'due' | 'start' | 'waiting' | 'new' | 'agent' | 'progress';

export interface TodayPick {
	key: string;
	kind: TodayPickKind;
	title: string;
	projectId: string | null;
	projectName: string | null;
	why: string;
	task: TodayTask | null;
	waiting: TodayWaitingItem | null;
}

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

function sinceWords(since: string | null): string {
	if (!since) return '';
	const date = new Date(`${since}T12:00:00Z`);
	if (Number.isNaN(date.getTime())) return '';
	return ` since ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
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
		if (doneIds.has(task.id) || task.state_key === 'blocked' || task.state_key === 'done')
			continue;
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
		scored.push({
			score: 80,
			pick: {
				key: `waiting:${item.id}`,
				kind: 'waiting',
				title: item.what,
				projectId: item.project_id,
				projectName: item.project_name,
				why: `${item.who} is waiting on you${sinceWords(item.since)}.`,
				task,
				waiting: item
			}
		});
	}

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

/** What the person did with a suggestion the brief keeps repeating. */
export type RepeatedChoice = 'keep' | 'snooze' | 'let_go';
