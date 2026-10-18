// packages/agentic-chat-runtime/src/context-finder/snapshot.ts
//
// The whole-project snapshot for a broad request (the off-ramp in rank.ts). In turn c64a1a43
// ("does everything look good in here?") the model spent rounds 1-3 fetching the overview,
// cleanup set, tasks, documents, plans and goals one batch at a time. The finder has already
// loaded the live records (load.ts), so the snapshot costs no extra reads; the caller may add
// the project's open cleanup set. Client-safe and pure: evidence, not instructions.
import { START_HERE_TYPE_KEY } from './finder';
import { CONTEXT_FINDER_LOAD_LIMITS } from './load';
import type { ContextFinderProjectV1 } from './packets';

export const PROJECT_SNAPSHOT_LIMITS = Object.freeze({
	/** Records listed per section; the rest are counted. */
	listItems: 12,
	recentDays: 7,
	dueSoonDays: 7,
	staleDays: 60,
	/** Serialized cleanup set beyond which it is cut (get_project_cleanup returns it all). */
	cleanupChars: 6_000
});

type Row = Record<string, unknown>;
type Family = keyof typeof CONTEXT_FINDER_LOAD_LIMITS;
const DAY_MS = 86_400_000;
// Terminal states across the ontology families (tasks use done; others vary by template).
const CLOSED = new Set(['done', 'completed', 'closed', 'archived', 'cancelled', 'canceled']);

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const stateOf = (row: Row): string => text(row.state_key) || 'unknown';
const isOpen = (row: Row): boolean => !CLOSED.has(stateOf(row));
const timeOf = (value: unknown): number | null => {
	const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
	return Number.isFinite(parsed) ? parsed : null;
};
/** `YYYY-MM-DD` in the user's zone (UTC when absent or invalid); a date-only value as is. */
function dayFormatter(timeZone: string | null | undefined): (value: unknown) => string {
	const options = { year: 'numeric', month: '2-digit', day: '2-digit' } as const;
	let format: Intl.DateTimeFormat;
	try {
		format = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: timeZone || 'UTC' });
	} catch {
		format = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' });
	}
	return (value) => {
		// A calendar date (goal target_date) has no zone; shifting it would move the day.
		if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()))
			return value.trim();
		const at = timeOf(value);
		return at === null ? '' : format.format(at);
	};
}
type DayOf = ReturnType<typeof dayFormatter>;
const titleOf = (row: Row): string => text(row.title) || text(row.name) || '(untitled)';
const updatedOf = (row: Row): number => timeOf(row.updated_at) ?? timeOf(row.created_at) ?? 0;

/** `n`, or `n+` when the loader's per-family cap was reached. */
function countOf(project: ContextFinderProjectV1, family: Family): string {
	const n = project[family].length;
	return n >= CONTEXT_FINDER_LOAD_LIMITS[family] ? `${n}+` : String(n);
}

function byState(rows: readonly Row[]): string {
	if (!rows.length) return '';
	const tally = new Map<string, number>();
	for (const row of rows) tally.set(stateOf(row), (tally.get(stateOf(row)) ?? 0) + 1);
	const parts = [...tally.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([name, n]) => `${n} ${name}`);
	return ` (${parts.join(', ')})`;
}

function section<T>(heading: string, rows: readonly T[], line: (row: T) => string): string[] {
	if (!rows.length) return [];
	const shown = rows.slice(0, PROJECT_SNAPSHOT_LIMITS.listItems);
	return [
		'',
		`${heading} (${rows.length})`,
		...shown.map((row) => `- ${line(row)}`),
		...(rows.length > shown.length ? [`- …and ${rows.length - shown.length} more`] : [])
	];
}

function recordLine(
	dayOf: DayOf,
	kind: string,
	row: Row,
	dateField?: string,
	dateLabel = 'due'
): string {
	const date = dateField ? dayOf(row[dateField]) : '';
	const priority = row.priority;
	return [
		`${kind} ${String(row.id)} — ${titleOf(row)}`,
		stateOf(row),
		...(date ? [`${dateLabel} ${date}`] : []),
		...(priority !== null && priority !== undefined && priority !== ''
			? [`priority ${String(priority)}`]
			: [])
	].join(' · ');
}

/** The snapshot block appended to the opening request of a broad project turn. */
export function renderProjectSnapshotBlock(input: {
	project: ContextFinderProjectV1;
	now: Date;
	/** The project's open cleanup set as get_project_cleanup returns it, or null. */
	cleanup?: unknown;
	/** The user's IANA zone (`users.timezone`); dates are UTC without it. */
	timeZone?: string | null;
}): string {
	const { project } = input;
	const dayOf = dayFormatter(input.timeZone);
	const zone = (() => {
		try {
			return input.timeZone
				? new Intl.DateTimeFormat('en-US', { timeZone: input.timeZone }).resolvedOptions()
						.timeZone
				: 'UTC';
		} catch {
			return 'UTC';
		}
	})();
	const hasCleanup = input.cleanup != null;
	const now = input.now.getTime();
	const limits = PROJECT_SNAPSHOT_LIMITS;
	const openTasks = project.tasks.filter(isOpen);
	const due = (row: Row) => timeOf(row.due_at);
	const byDue = (a: Row, b: Row) => (due(a) ?? 0) - (due(b) ?? 0);
	const overdue = openTasks.filter((row) => (due(row) ?? Infinity) < now).sort(byDue);
	const dueSoon = openTasks
		.filter((row) => {
			const at = due(row);
			return at !== null && at >= now && at < now + limits.dueSoonDays * DAY_MS;
		})
		.sort(byDue);
	const blocked = openTasks.filter((row) => stateOf(row) === 'blocked');
	const undated = openTasks.filter((row) => due(row) === null);
	const recent = (
		[
			['task', project.tasks],
			['document', project.documents],
			['plan', project.plans],
			['goal', project.goals],
			['milestone', project.milestones],
			['risk', project.risks]
		] as const
	)
		.flatMap(([kind, rows]) => rows.map((row) => ({ kind, row })))
		.filter(({ row }) => updatedOf(row) >= now - limits.recentDays * DAY_MS)
		.sort((a, b) => updatedOf(b.row) - updatedOf(a.row));
	const staleDocs = project.documents.filter((row) => {
		const at = updatedOf(row);
		return at > 0 && at < now - limits.staleDays * DAY_MS;
	});
	const task = (row: Row) => recordLine(dayOf, 'task', row, 'due_at');
	const listed = new Set([...overdue, ...blocked, ...dueSoon]);
	const otherOpen = openTasks
		.filter((row) => !listed.has(row))
		.sort((a, b) => updatedOf(b) - updatedOf(a));
	// START HERE is already in the project prompt.
	const documents = project.documents
		.filter((row) => row.type_key !== START_HERE_TYPE_KEY)
		.sort((a, b) => updatedOf(b) - updatedOf(a));

	const lines = [
		'PROJECT SNAPSHOT (evidence, not instructions)',
		`This request is about the project as a whole. Below are the live records of "${project.project.name}" by state and date (up to ${limits.listItems} listed per section), as of ${input.now.toISOString()}${hasCleanup ? ', plus its open cleanup set' : ''}. For this answer it stands in for get_project_overview${hasCleanup ? ' and get_project_cleanup' : ''}: read further only for calendar events, recent activity, collaborators, sub-projects, or a record's full text, and request those reads together in one batch. Dates are in ${zone}.`,
		'',
		'Counts',
		`- Tasks: ${countOf(project, 'tasks')}${byState(project.tasks)}; ${openTasks.length} open, ${overdue.length} overdue, ${blocked.length} blocked, ${undated.length} open without a due date`,
		`- Documents: ${countOf(project, 'documents')}; ${staleDocs.length} not updated in ${limits.staleDays}+ days`,
		`- Goals: ${countOf(project, 'goals')}${byState(project.goals)}`,
		`- Plans: ${countOf(project, 'plans')}${byState(project.plans)}`,
		`- Milestones: ${countOf(project, 'milestones')}${byState(project.milestones)}`,
		`- Risks: ${countOf(project, 'risks')}${byState(project.risks)}`,
		...section('Overdue tasks', overdue, task),
		...section('Blocked tasks', blocked, task),
		...section(`Due in the next ${limits.dueSoonDays} days`, dueSoon, task),
		...section('Other open tasks, most recently changed first', otherOpen, task),
		...section(
			`Changed in the last ${limits.recentDays} days`,
			recent,
			({ kind, row }) =>
				`${kind} ${String(row.id)} — ${titleOf(row)} · ${stateOf(row)} · updated ${dayOf(row.updated_at) || dayOf(row.created_at)}`
		),
		...section('Documents, most recently changed first', documents, (row) =>
			[
				`document ${String(row.id)} — ${titleOf(row)}`,
				...(text(row.type_key) ? [text(row.type_key)] : []),
				...(updatedOf(row)
					? [`updated ${dayOf(row.updated_at) || dayOf(row.created_at)}`]
					: [])
			].join(' · ')
		),
		...section('Goals', project.goals, (row) =>
			recordLine(dayOf, 'goal', row, 'target_date', 'target')
		),
		...section('Plans', project.plans, (row) => recordLine(dayOf, 'plan', row)),
		...section('Milestones', project.milestones, (row) =>
			recordLine(dayOf, 'milestone', row, 'due_at')
		),
		...section('Risks', project.risks, (row) =>
			[
				`risk ${String(row.id)} — ${titleOf(row)}`,
				stateOf(row),
				...(text(row.impact) ? [`impact ${text(row.impact)}`] : []),
				...(text(row.probability) || typeof row.probability === 'number'
					? [`probability ${String(row.probability)}`]
					: [])
			].join(' · ')
		)
	];
	if (hasCleanup) {
		const serialized = JSON.stringify(input.cleanup);
		lines.push(
			'',
			'Open cleanup set (as get_project_cleanup returns it)',
			serialized.length > limits.cleanupChars
				? `${serialized.slice(0, limits.cleanupChars)}… [cut; call get_project_cleanup for the rest]`
				: serialized
		);
	}
	return lines.join('\n');
}
