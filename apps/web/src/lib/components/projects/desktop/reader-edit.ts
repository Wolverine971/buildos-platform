// apps/web/src/lib/components/projects/desktop/reader-edit.ts
//
// Pure rules for editing in the reader: the one-click chips (priority, dates,
// state) and what Archive/Delete means for each kind. The reader owns the
// requests; this owns the values.
import type { ReaderKind } from './reader-model';
import type { RemovalRequest } from './reader-removals.svelte';

export type ChipOption<T extends string | number> = { value: T; label: string; note?: string };

export const TASK_PRIORITIES: ChipOption<number>[] = [
	{ value: 1, label: 'P1', note: 'Critical' },
	{ value: 2, label: 'P2', note: 'High' },
	{ value: 3, label: 'P3', note: 'Medium' },
	{ value: 4, label: 'P4', note: 'Low' },
	{ value: 5, label: 'P5', note: 'Nice to have' }
];

export const GOAL_PRIORITIES: ChipOption<string>[] = [
	{ value: 'high', label: 'High' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'low', label: 'Low' }
];

export const GOAL_STATES: ChipOption<string>[] = [
	{ value: 'draft', label: 'Draft' },
	{ value: 'active', label: 'Active' },
	{ value: 'achieved', label: 'Achieved' },
	{ value: 'abandoned', label: 'Abandoned' }
];

/** Archived is its own action (bottom left), not a state to pick. */
export const DOC_STATES: ChipOption<string>[] = [
	{ value: 'draft', label: 'Draft' },
	{ value: 'in_review', label: 'In review' },
	{ value: 'ready', label: 'Ready' },
	{ value: 'published', label: 'Published' }
];

export function taskPriorityLabel(value: number | null | undefined): string {
	const entry = TASK_PRIORITIES.find((option) => option.value === value);
	return entry ? `${entry.label} · ${entry.note}` : 'Priority';
}

export function optionLabel<T extends string | number>(
	options: readonly ChipOption<T>[],
	value: T | null | undefined,
	fallback: string
): string {
	return options.find((option) => option.value === value)?.label ?? fallback;
}

export type DatePreset = 'today' | 'tomorrow' | 'next_week';
export const DATE_PRESETS: { key: DatePreset; label: string; days: number }[] = [
	{ key: 'today', label: 'Today', days: 0 },
	{ key: 'tomorrow', label: 'Tomorrow', days: 1 },
	{ key: 'next_week', label: 'Next week', days: 7 }
];

function pad(value: number): string {
	return String(value).padStart(2, '0');
}

/** A local calendar day as YYYY-MM-DD. */
export function localDay(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The local day of a stored timestamp, for a date input ('' when unset). */
export function dayOf(value: string | null | undefined): string {
	if (!value) return '';
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? '' : localDay(date);
}

/**
 * The value to send when a day is picked. A task that already has a time keeps
 * it on the new day; otherwise a bare YYYY-MM-DD goes, and the server closes
 * (due, target) or opens (start) that day in the user's timezone.
 */
export function valueForDay(day: string, current: string | null | undefined): string {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
	const existing = current ? new Date(current) : null;
	if (!existing || Number.isNaN(existing.getTime())) return day;
	const [year, month, date] = day.split('-').map(Number) as [number, number, number];
	const next = new Date(existing.getTime());
	next.setFullYear(year, month - 1, date);
	return next.toISOString();
}

/** The day a preset lands on, counted from today. */
export function presetDay(preset: DatePreset, now: Date = new Date()): string {
	const days = DATE_PRESETS.find((entry) => entry.key === preset)?.days ?? 0;
	const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
	return localDay(target);
}

/**
 * How a sent value shows until the server answers: a bare day reads as that
 * local day (end of it for due and target dates, start for a start date).
 */
export function optimisticTimestamp(value: string | null, edge: 'start' | 'end'): string | null {
	if (!value) return null;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
	const [year, month, date] = value.split('-').map(Number) as [number, number, number];
	const local =
		edge === 'end'
			? new Date(year, month - 1, date, 23, 59, 0)
			: new Date(year, month - 1, date, 0, 0, 0);
	return local.toISOString();
}

/** The bottom-left action for each kind, and what it sends. */
export function removalFor(
	kind: ReaderKind,
	id: string
): { label: string; /** Past tense, for the Undo toast. */ done: string; request: RemovalRequest } {
	if (kind === 'task') {
		return {
			label: 'Archive',
			done: 'Archived',
			request: { url: `/api/onto/tasks/${id}`, method: 'DELETE', body: { archive: true } }
		};
	}
	if (kind === 'document') {
		// Only the doc goes: docs nested under it move up a level.
		return {
			label: 'Archive',
			done: 'Archived',
			request: {
				url: `/api/onto/documents/${id}`,
				method: 'PATCH',
				body: { action: 'archive', archive_children_mode: 'promote_children' }
			}
		};
	}
	return {
		label: 'Delete',
		done: 'Deleted',
		request: { url: `/api/onto/goals/${id}`, method: 'DELETE' }
	};
}
