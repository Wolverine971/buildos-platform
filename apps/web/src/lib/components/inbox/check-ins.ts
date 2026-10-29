// apps/web/src/lib/components/inbox/check-ins.ts
// Pure helpers and the small fetch client for AI Inbox check-ins ("Did this happen?" /
// "Still on?"). No Svelte or DOM state here, so the server can reuse the date labels.
import type {
	CheckInAnswer,
	CheckInAnswerResult,
	CheckInAnswersPayload,
	CheckInChatPayload,
	CheckInGroup,
	CheckInProject,
	CheckInsPayload
} from '$lib/types/inbox-check-ins';

const DAY_MS = 86_400_000;

/** What InboxCheckIns reports after each saved answer or Undo. */
export type CheckInChangeSummary = {
	projectId: string;
	/** Net answers saved by this action (negative after an Undo). */
	handled: number;
	/** Tasks (or the "Still on?" question) still waiting on this card. */
	remaining: number;
};

function parseCivilDate(value: string): { year: number; month: number; day: number } | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
	if (!match) return null;
	return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** "Oct 7" for a YYYY-MM-DD civil date; adds the year when it differs from `today`'s. */
export function formatCheckInDayLabel(dueDate: string, today?: string | null): string {
	const parts = parseCivilDate(dueDate);
	if (!parts) return dueDate;
	const sameYear = !today || today.slice(0, 4) === dueDate.slice(0, 4);
	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		...(sameYear ? {} : { year: 'numeric' }),
		timeZone: 'UTC'
	}).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)));
}

/** Whole days between two civil dates (b - a). */
export function civilDaysBetween(a: string, b: string): number | null {
	const from = parseCivilDate(a);
	const to = parseCivilDate(b);
	if (!from || !to) return null;
	return Math.round(
		(Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) /
			DAY_MS
	);
}

/** Local calendar date as YYYY-MM-DD (what an <input type="date"> holds). */
export function toDateInputValue(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The next Monday–Friday after `from`, in local time. */
export function nextWeekday(from: Date = new Date()): Date {
	const next = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
	while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
	return next;
}

/** A picked YYYY-MM-DD as an ISO instant at `hour` o'clock local time. */
export function dueAtFromDateInput(value: string, hour = 9): string | null {
	const parts = parseCivilDate(value);
	if (!parts) return null;
	const local = new Date(parts.year, parts.month - 1, parts.day, hour, 0, 0, 0);
	return Number.isNaN(local.getTime()) ? null : local.toISOString();
}

/** "Mon, Nov 2" for a picked YYYY-MM-DD. */
export function formatMoveDate(value: string): string {
	const parts = parseCivilDate(value);
	if (!parts) return value;
	return new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)));
}

export function formatCheckInGroupTitle(group: Pick<CheckInGroup, 'label' | 'task_count'>): string {
	return `${group.label} · ${group.task_count} task${group.task_count === 1 ? '' : 's'}`;
}

/** "22 days ago, none marked yet" under a group title. */
export function formatCheckInGroupAge(
	dueDate: string,
	today: string,
	answered: number,
	total: number
): string {
	const days = civilDaysBetween(dueDate, today);
	const age = days === null || days <= 0 ? null : days === 1 ? 'Yesterday' : `${days} days ago`;
	const status =
		answered === 0
			? total === 1
				? 'not marked yet'
				: 'none marked yet'
			: answered >= total
				? 'all answered'
				: `${total - answered} left`;
	return age ? `${age}, ${status}` : status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatCheckInTally(answered: number, total: number): string {
	return `${answered} of ${total} answered`;
}

/** The "Still on?" detail line for a quiet project. */
export function formatQuietDetail(
	project: Pick<CheckInProject, 'overdue_count' | 'oldest_due_date' | 'last_touched_date'>,
	today?: string | null
): string {
	const count = project.overdue_count;
	const tasks = `${count} task${count === 1 ? ' has' : 's have'} been overdue`;
	const since = project.oldest_due_date
		? ` since ${formatCheckInDayLabel(project.oldest_due_date, today)}`
		: '';
	const touched = project.last_touched_date;
	const quietSince =
		touched && parseCivilDate(touched)
			? `nothing has changed since ${formatCheckInDayLabel(touched, today)}`
			: 'nothing here has changed in over six weeks';
	return `${tasks}${since} and ${quietSince}.`;
}

/** Tasks still waiting for an answer across a project's groups. */
export function checkInTaskCount(project: Pick<CheckInProject, 'groups'>): number {
	return project.groups.reduce((total, group) => total + group.tasks.length, 0);
}

export function browserTimeZone(): string | null {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
	} catch {
		return null;
	}
}

type FetchLike = typeof fetch;

async function readApi<T>(response: Response, fallback: string): Promise<T> {
	const json = (await response.json().catch(() => null)) as {
		success?: boolean;
		data?: T;
		error?: string;
	} | null;
	if (!response.ok || !json?.success || json.data === undefined) {
		throw new Error(json?.error || fallback);
	}
	return json.data;
}

export async function fetchCheckIns(
	timeZone: string | null,
	fetchFn: FetchLike = fetch
): Promise<CheckInsPayload> {
	const query = timeZone ? `?tz=${encodeURIComponent(timeZone)}` : '';
	const response = await fetchFn(`/api/inbox/check-ins${query}`, {
		headers: { accept: 'application/json' }
	});
	return readApi<CheckInsPayload>(response, 'Failed to load check-ins');
}

export async function postCheckInAnswers(
	answers: CheckInAnswer[],
	fetchFn: FetchLike = fetch
): Promise<CheckInAnswerResult[]> {
	const response = await fetchFn('/api/inbox/check-ins', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ answers })
	});
	const payload = await readApi<CheckInAnswersPayload>(response, 'Could not save that answer');
	return payload.results;
}

export async function requestCheckInChat(
	params: { projectId: string; taskIds: string[]; timeZone: string | null },
	fetchFn: FetchLike = fetch
): Promise<CheckInChatPayload> {
	const response = await fetchFn('/api/inbox/check-ins/chat', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			project_id: params.projectId,
			task_ids: params.taskIds,
			...(params.timeZone ? { tz: params.timeZone } : {})
		})
	});
	return readApi<CheckInChatPayload>(response, 'Failed to open chat');
}
