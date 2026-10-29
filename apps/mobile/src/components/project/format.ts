// apps/mobile/src/components/project/format.ts
// Pure helpers for the project screen: labels, dates, counts, row glyphs, the header tile and
// where the back control goes. No React Native imports, so tests can load this file.
import type { DesktopProject, ProjectTaskBucket, ProjectTasksCoverage } from '@buildos/api-client';

import { PROJECT_ROUTE, type TabStack } from '@/lib/routes';

/** The reader's walk label and the back label for a project: names over 18 chars are cut. */
export function shortLabel(name: string): string {
	return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}

function startOfDay(date: Date): number {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function parse(value: string | null | undefined): Date | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/** "Oct 28", or "Oct 28, 2025" outside the current year. */
export function shortDate(date: Date, now: Date = new Date()): string {
	return date.toLocaleDateString(
		undefined,
		date.getFullYear() === now.getFullYear()
			? { month: 'short', day: 'numeric' }
			: { month: 'short', day: 'numeric', year: 'numeric' }
	);
}

/** "Edited Oct 28", or '' when the date is missing or bad. */
export function editedLabel(updatedAt: string | null | undefined, now: Date = new Date()): string {
	const date = parse(updatedAt);
	return date ? `Edited ${shortDate(date, now)}` : '';
}

/** The task row's date chip: "Today", "Tomorrow" or "Oct 30"; null when there is no due date. */
export function shortDue(dueAt: string | null | undefined, now: Date): string | null {
	const due = parse(dueAt);
	if (!due) return null;
	const days = Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000);
	if (days === 0) return 'Today';
	if (days === 1) return 'Tomorrow';
	return shortDate(due, now);
}

// ---------------------------------------------------------------------------------------------
// Counts

export type TaskCounts = { open: number; done: number; total: number };

const OPEN_BUCKETS: readonly ProjectTaskBucket[] = [
	'overdue',
	'in_progress',
	'scheduled',
	'backlog',
	'blocked'
];

type CountedGroup = { bucket: ProjectTaskBucket; tasks: readonly unknown[] };

/**
 * "N open · N done" and the Tasks tab count. Server totals per bucket when the read has them
 * (the first read loads at most a page per group), otherwise what is loaded.
 */
export function taskCounts(
	coverage: ProjectTasksCoverage | null | undefined,
	groups: readonly CountedGroup[]
): TaskCounts {
	const count = (bucket: ProjectTaskBucket) =>
		coverage?.buckets?.[bucket]?.total ??
		groups.find((group) => group.bucket === bucket)?.tasks.length ??
		0;
	const open = OPEN_BUCKETS.reduce((sum, bucket) => sum + count(bucket), 0);
	const done = count('done');
	return { open, done, total: coverage?.total ?? open + done };
}

/** "11 open · 43 done". */
export function countsStamp(counts: TaskCounts): string {
	return `${counts.open} open · ${counts.done} done`;
}

// ---------------------------------------------------------------------------------------------
// Row glyphs (ReaderTaskList.svelte): the shape follows the task's state, the color its group.

export type GlyphShape = 'circle' | 'dot' | 'check' | 'slash';
export type GlyphTone = 'destructive' | 'success' | 'info' | 'warning' | 'muted';

const BUCKET_TONE: Record<ProjectTaskBucket, GlyphTone> = {
	overdue: 'destructive',
	in_progress: 'success',
	scheduled: 'info',
	backlog: 'muted',
	blocked: 'warning',
	done: 'success'
};

export function taskGlyph(
	bucket: ProjectTaskBucket,
	stateKey: string | null | undefined
): { shape: GlyphShape; tone: GlyphTone } {
	const shape: GlyphShape =
		bucket === 'done' || stateKey === 'done'
			? 'check'
			: stateKey === 'in_progress'
				? 'dot'
				: stateKey === 'blocked'
					? 'slash'
					: 'circle';
	return { shape, tone: BUCKET_TONE[bucket] };
}

/** Date chips are tinted red when overdue and blue when scheduled; plain otherwise. */
export function dueTone(bucket: ProjectTaskBucket): 'destructive' | 'info' | 'muted' {
	return bucket === 'overdue' ? 'destructive' : bucket === 'scheduled' ? 'info' : 'muted';
}

const BUCKET_SPOKEN: Record<ProjectTaskBucket, string> = {
	overdue: 'overdue',
	in_progress: 'in progress',
	scheduled: 'scheduled',
	backlog: 'to do',
	blocked: 'blocked',
	done: 'done'
};

/** VoiceOver label for a task row: "Ship the deck, overdue, due Oct 27". */
export function taskRowLabel(title: string, bucket: ProjectTaskBucket, due: string | null): string {
	return [title, BUCKET_SPOKEN[bucket], due ? `due ${due}` : ''].filter(Boolean).join(', ');
}

// ---------------------------------------------------------------------------------------------
// Header tile

/** The project row fields the header tile needs (from the project read). */
export type ProjectRowLike = {
	id: string;
	name: string;
	kind: string;
	state_key: string;
	updated_at: string;
	next_step_short: string | null;
	parent_project_id: string | null;
	icon_emoji: unknown;
};

/** `icon_emoji.glyphs` from the project row: up to two non-empty strings, or null. */
export function emojiGlyphs(iconEmoji: unknown): string[] | null {
	if (!iconEmoji || typeof iconEmoji !== 'object') return null;
	const glyphs = (iconEmoji as { glyphs?: unknown }).glyphs;
	if (!Array.isArray(glyphs)) return null;
	const list = glyphs
		.filter((glyph): glyph is string => typeof glyph === 'string')
		.map((glyph) => glyph.trim())
		.filter((glyph) => glyph.length > 0 && glyph.length <= 16)
		.slice(0, 2);
	return list.length ? list : null;
}

/** A plain tile (monogram or emoji, no pulse) for a project the Workspace data doesn't list. */
export function fallbackTile(row: ProjectRowLike): DesktopProject {
	return {
		id: row.id,
		name: row.name,
		kind: row.kind === 'workspace' ? 'workspace' : 'project',
		state_key: row.state_key,
		updated_at: row.updated_at,
		last_touch_at: null,
		next_step_short: row.next_step_short,
		emoji: emojiGlyphs(row.icon_emoji),
		parent_project_id: row.parent_project_id,
		pulse: null,
		pulse_reason: '',
		bars: { docs: 0, tasks: 0 },
		mix: { overdue: 0, in_progress: 0, scheduled: 0, backlog: 0 },
		open_tasks: 0,
		document_count: 0,
		task_count: 0
	};
}

/**
 * The header's tile: the Workspace tab's entry for this project when there is one (pulse,
 * emoji), else a plain tile from the project row. Null for the Workspace itself.
 */
export function headerTile(
	row: ProjectRowLike | null | undefined,
	entry: DesktopProject | null | undefined
): DesktopProject | null {
	const kind = row?.kind ?? entry?.kind;
	if (kind === 'workspace') return null;
	if (entry) {
		const emoji = entry.emoji ?? (row ? emojiGlyphs(row.icon_emoji) : null);
		return row ? { ...entry, name: row.name, emoji } : entry;
	}
	return row ? fallbackTile(row) : null;
}

// ---------------------------------------------------------------------------------------------
// Back control: where the project was opened from

type NavRouteLike = {
	key?: string;
	name: string;
	params?: unknown;
	isPreloaded?: boolean;
};

type NavStateLike = { index?: number; routes: readonly NavRouteLike[] } | null | undefined;

export type BackTarget = { kind: 'today' } | { kind: 'workspace' } | { kind: 'project'; id: string };

/**
 * What sits under this project in its tab's stack: the parent project (a sub-project opened from
 * it), else the tab's own root (`tab`: Today or Workspace). Preloaded routes (link previews) are
 * skipped, and a screen that is itself preloaded counts as sitting on top of the stack.
 */
export function backTarget(state: NavStateLike, ownKey: string, tab: TabStack): BackTarget {
	const routes = state?.routes ?? [];
	// Preloaded routes wait past the focused one (`index`) and carry `isPreloaded`.
	const active = routes
		.slice(0, (state?.index ?? routes.length - 1) + 1)
		.filter((route) => !route.isPreloaded);
	const own = active.findIndex((route) => route.key === ownKey);
	const previous = (own >= 0 ? active.slice(0, own) : active).at(-1);
	if (previous?.name === PROJECT_ROUTE) {
		const id = (previous.params as { id?: unknown } | undefined)?.id;
		if (typeof id === 'string' && id) return { kind: 'project', id };
	}
	return { kind: tab };
}

/** The web page for a project. */
export function webProjectUrl(origin: string, projectId: string): string {
	return `${origin.replace(/\/+$/, '')}/projects/${encodeURIComponent(projectId)}`;
}
