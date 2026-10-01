// apps/web/src/lib/components/projects/desktop/desktop-signals.ts
//
// What a desktop tile says about a project, from what actually happened rather
// than the status field (which people rarely update):
// - its color is its pulse: moving, being shaped, gone quiet or parked;
// - its D bar is how many documents it has, ranked against the viewer's other projects;
// - its T bar is how many open tasks, ranked, split into overdue, in progress,
//   scheduled and backlog.
// Pure: the server loader counts with `taskBucket`, the client classifies and
// patches with the rest. Every color means one thing everywhere (see desktop-colors.css).
import { PROJECT_STATE_META, normalizeProjectState } from '$lib/config/project-states';

/** A finished task inside this window makes a project "moving"; a change inside it, "being shaped". */
export const RECENT_DAYS = 14;
/** No recorded change for this long and a project counts as parked. Also the log window read. */
export const PARKED_AFTER_DAYS = 60;

const DAY_MS = 86_400_000;

export type TaskBucket = 'overdue' | 'in_progress' | 'scheduled' | 'backlog';
export const TASK_BUCKETS: readonly TaskBucket[] = [
	'overdue',
	'in_progress',
	'scheduled',
	'backlog'
];
export const TASK_BUCKET_LABEL: Record<TaskBucket, string> = {
	overdue: 'Overdue',
	in_progress: 'In progress',
	scheduled: 'Scheduled',
	backlog: 'Backlog'
};

export type ProjectSignals = {
	/** Most recent recorded change (app, chat or agents) within PARKED_AFTER_DAYS; null when none. */
	last_touch_at: string | null;
	/** Tasks finished within RECENT_DAYS. */
	done_recent: number;
} & Record<TaskBucket, number>;

export function emptySignals(): ProjectSignals {
	return {
		last_touch_at: null,
		done_recent: 0,
		overdue: 0,
		in_progress: 0,
		scheduled: 0,
		backlog: 0
	};
}

type TaskFacts = {
	state_key: string | null;
	start_at: string | null;
	due_at: string | null;
	completed_at?: string | null;
};

function time(value: string | null | undefined): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Where an open task sits on the T bar; `done` for finished tasks. Overdue wins,
 * then in progress; blocked tasks wait with the backlog; a future start or due
 * date makes the rest scheduled.
 */
export function taskBucket(task: TaskFacts, now: number): TaskBucket | 'done' {
	if (task.state_key === 'done') return 'done';
	const due = time(task.due_at);
	if (due !== null && due < now) return 'overdue';
	if (task.state_key === 'in_progress') return 'in_progress';
	if (task.state_key === 'blocked') return 'backlog';
	const start = time(task.start_at);
	if ((start !== null && start >= now) || (due !== null && due >= now)) return 'scheduled';
	return 'backlog';
}

export function openTaskCount(signals: ProjectSignals): number {
	return TASK_BUCKETS.reduce((total, bucket) => total + signals[bucket], 0);
}

/** Moves one task's count between projects' signals, as a task move does. */
export function shiftTask(
	signals: ProjectSignals | null | undefined,
	task: TaskFacts,
	delta: 1 | -1,
	now: number
): ProjectSignals | null {
	if (!signals) return null;
	const bucket = taskBucket(task, now);
	if (bucket === 'done') {
		const completed = time(task.completed_at);
		if (completed === null || now - completed > RECENT_DAYS * DAY_MS) return signals;
		return { ...signals, done_recent: Math.max(0, signals.done_recent + delta) };
	}
	return { ...signals, [bucket]: Math.max(0, signals[bucket] + delta) };
}

export type Pulse = 'moving' | 'shaping' | 'quiet' | 'parked';
export const PULSES: readonly Pulse[] = ['moving', 'shaping', 'quiet', 'parked'];
export const PULSE_META: Record<Pulse, { label: string; rule: string }> = {
	moving: { label: 'Moving', rule: `finished a task in the last ${RECENT_DAYS} days` },
	shaping: {
		label: 'Being shaped',
		rule: `worked on in the last ${RECENT_DAYS} days, nothing finished yet`
	},
	quiet: { label: 'Gone quiet', rule: `no changes for ${RECENT_DAYS}+ days` },
	parked: {
		label: 'Parked',
		rule: `marked paused or done, or no changes for ${PARKED_AFTER_DAYS}+ days`
	}
};

type PulseInput = { state_key: string | null; signals?: ProjectSignals | null };

function plural(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** `null` when there is no history to judge (the signals didn't load). */
export function projectPulse(
	project: PulseInput,
	now: number
): { pulse: Pulse; reason: string } | null {
	const state = normalizeProjectState(project.state_key);
	if (state === 'paused' || state === 'completed' || state === 'cancelled')
		return {
			pulse: 'parked',
			reason: `Marked ${PROJECT_STATE_META[state].label.toLowerCase()}`
		};
	const signals = project.signals;
	if (!signals) return null;
	if (signals.done_recent > 0)
		return {
			pulse: 'moving',
			reason: `Finished ${plural(signals.done_recent, 'task')} in the last ${RECENT_DAYS} days`
		};
	const touched = time(signals.last_touch_at);
	const days = touched === null ? null : Math.max(0, Math.floor((now - touched) / DAY_MS));
	if (days === null || days > PARKED_AFTER_DAYS)
		return {
			pulse: 'parked',
			reason:
				days === null
					? `No changes in ${PARKED_AFTER_DAYS} days`
					: `No changes for ${days} days`
		};
	if (days <= RECENT_DAYS)
		return {
			pulse: 'shaping',
			reason: `Worked on ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}, nothing finished yet`
		};
	return { pulse: 'quiet', reason: `Last change ${days} days ago` };
}

/**
 * 0 for nothing; otherwise 0.18–1 by rank among the non-zero values, so one huge
 * project (85 open tasks) doesn't flatten everyone else's bar.
 */
export function rankScale(values: readonly number[]): (value: number) => number {
	const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
	return (value) => {
		if (value <= 0 || sorted.length === 0) return 0;
		let atOrBelow = 0;
		for (const candidate of sorted) if (candidate <= value) atOrBelow++;
		return 0.18 + 0.82 * (atOrBelow / sorted.length);
	};
}

/** START HERE is made with every project, so a lone document counts as none. */
export function meaningfulDocs(documentCount: number): number {
	return Math.max(0, documentCount - 1);
}

export type TileLook = {
	pulse: Pulse | null;
	reason: string;
	/** Bar lengths, 0–1. */
	docs: number;
	tasks: number;
	/** Open tasks by bucket, for the T bar's segments and the hover card. */
	mix: Record<TaskBucket, number>;
	open: number;
};

type LookInput = PulseInput & { id: string; document_count: number; task_count: number };

export function buildLooks(projects: readonly LookInput[], now: number): Map<string, TileLook> {
	const openOf = (project: LookInput) =>
		project.signals ? openTaskCount(project.signals) : project.task_count;
	const docsScale = rankScale(projects.map((project) => meaningfulDocs(project.document_count)));
	const tasksScale = rankScale(projects.map(openOf));
	return new Map(
		projects.map((project) => {
			const pulse = projectPulse(project, now);
			const open = openOf(project);
			const signals = project.signals;
			return [
				project.id,
				{
					pulse: pulse?.pulse ?? null,
					reason: pulse?.reason ?? '',
					docs: docsScale(meaningfulDocs(project.document_count)),
					tasks: tasksScale(open),
					mix: signals
						? {
								overdue: signals.overdue,
								in_progress: signals.in_progress,
								scheduled: signals.scheduled,
								backlog: signals.backlog
							}
						: { overdue: 0, in_progress: 0, scheduled: 0, backlog: open },
					open
				}
			];
		})
	);
}
