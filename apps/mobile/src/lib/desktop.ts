// apps/mobile/src/lib/desktop.ts
//
// Pure shaping for the Workspace tab's project tiles, ported from the website's
// desktop-model.ts and desktop-signals.ts: which projects sit on the grid, their order and
// groups, what a tile says, its colors and the peek card's size. No fetches and no
// react-native imports, so vitest can load it.
import type { DesktopProject, ProjectPulse, TaskMix } from '@buildos/api-client';

import { colorMix, type PulseColors, readableMix, type ThemeColors, withAlpha } from '@/theme';

// ---------------------------------------------------------------------------------------------
// Pulse and task buckets (copied from apps/web/.../desktop/desktop-signals.ts)

/** A finished task inside this window makes a project "moving"; a change inside it, "being shaped". */
export const RECENT_DAYS = 14;
/** No recorded change for this long and a project counts as parked. */
export const PARKED_AFTER_DAYS = 60;

export const PULSES: readonly ProjectPulse[] = ['moving', 'shaping', 'quiet', 'parked'];

export const PULSE_META: Record<ProjectPulse, { label: string; rule: string }> = {
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

export type TaskBucket = keyof TaskMix;

/** T bar segment order, left to right. */
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

// ---------------------------------------------------------------------------------------------
// Which projects are tiles, and where they sit

/** The Workspace row holds loose items; it is never drawn as a tile. */
export function isTile(project: DesktopProject): boolean {
	return project.kind !== 'workspace';
}

function tileIds(projects: readonly DesktopProject[]): Set<string> {
	return new Set(projects.filter(isTile).map((project) => project.id));
}

/** Tiles on the grid: everything but the Workspace and projects whose parent is also a tile. */
export function topLevel(projects: readonly DesktopProject[]): DesktopProject[] {
	const ids = tileIds(projects);
	return projects.filter(
		(project) =>
			isTile(project) && !(project.parent_project_id && ids.has(project.parent_project_id))
	);
}

/** Direct sub-projects per parent ("N NESTED"); only parents that are tiles count. */
export function nestedCounts(projects: readonly DesktopProject[]): Map<string, number> {
	const ids = tileIds(projects);
	const counts = new Map<string, number>();
	for (const project of projects) {
		const parentId = project.parent_project_id;
		if (!isTile(project) || !parentId || !ids.has(parentId)) continue;
		counts.set(parentId, (counts.get(parentId) ?? 0) + 1);
	}
	return counts;
}

function time(value: string | null | undefined): number {
	const parsed = value ? Date.parse(value) : NaN;
	return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Most recently active first by `updated_at`, the same order as the website's Recent and the
 * desktop route (desktop-model.ts, desktop-response.ts byRecentActivity). `last_touch_at`
 * stays out: a rename or a delete is logged there but doesn't move a project on the website.
 * A parent counts its sub-projects' activity, so busy folders stay near the front; `all` is
 * where sub-projects are looked up (pass the full list when sorting a filtered one). Ties
 * sort by name.
 */
export function sortRecent(
	projects: readonly DesktopProject[],
	all: readonly DesktopProject[] = projects
): DesktopProject[] {
	const own = new Map<string, number>();
	for (const project of [...all, ...projects]) own.set(project.id, time(project.updated_at));
	const activity = new Map(own);
	for (const child of all) {
		const parentId = child.parent_project_id;
		if (!isTile(child) || !parentId || !activity.has(parentId)) continue;
		activity.set(parentId, Math.max(activity.get(parentId) ?? 0, own.get(child.id) ?? 0));
	}
	return [...projects].sort(
		(a, b) =>
			(activity.get(b.id) ?? 0) - (activity.get(a.id) ?? 0) || a.name.localeCompare(b.name)
	);
}

export type DesktopSort = 'recent' | 'activity';
export type TileGroupKey = ProjectPulse | 'unknown' | 'all';
export type TileGroup = { key: TileGroupKey; label: string; projects: DesktopProject[] };

const ACTIVITY_GROUPS: { key: ProjectPulse | 'unknown'; label: string }[] = [
	...PULSES.map((pulse) => ({ key: pulse, label: PULSE_META[pulse].label })),
	{ key: 'unknown', label: 'No history yet' }
];

/**
 * By activity: Moving, Being shaped, Gone quiet, Parked, then No history yet; empty groups
 * dropped. Keeps the order it is given (pass `sortRecent` output).
 */
export function groupByPulse(projects: readonly DesktopProject[]): TileGroup[] {
	return ACTIVITY_GROUPS.map((group) => ({
		key: group.key,
		label: group.label,
		projects: projects.filter((project) => (project.pulse ?? 'unknown') === group.key)
	})).filter((group) => group.projects.length > 0);
}

/** Case-insensitive substring match on the project name (a search box, not a classifier). */
export function filterByName(projects: readonly DesktopProject[], query: string): DesktopProject[] {
	const needle = query.trim().toLocaleLowerCase();
	if (!needle) return [...projects];
	return projects.filter((project) => project.name.toLocaleLowerCase().includes(needle));
}

export type DesktopArrangement = {
	/** Recent: one 'all' group (none when empty). By activity: one group per pulse. */
	groups: TileGroup[];
	/** Tiles shown across the groups. */
	shown: number;
	/** Finished top-level projects for the folded Completed section (empty while searching). */
	completed: DesktopProject[];
	/** Every project tile, sub-projects included (the Workspace row excluded). */
	total: number;
	nestedCounts: Map<string, number>;
	/** Only while searching: tile id → its parent's name, for the "in Parent" line. */
	parentNames: Map<string, string>;
	searching: boolean;
};

/** Unknown or missing states count as planning, like the website's normalizeProjectState. */
function stateOf(project: DesktopProject): string {
	const state = project.state_key?.trim().toLowerCase();
	return state === 'active' ||
		state === 'paused' ||
		state === 'completed' ||
		state === 'cancelled'
		? state
		: 'planning';
}

/** The website's default "current" scope: planning and active. Paused, completed and
 * cancelled leave the grid (completed folds into its own section); search still finds them. */
export function isCurrent(project: DesktopProject): boolean {
	const state = stateOf(project);
	return state === 'planning' || state === 'active';
}

/**
 * Everything the Workspace grid needs in one call, matching the website's desktop. Without a
 * query: top-level tiles in the current scope (a folder stays when anything inside it is
 * current), plus finished top-level projects for the folded Completed section. With a query:
 * matches across every state, laid out flat, sub-projects included.
 */
export function arrangeDesktop(
	projects: readonly DesktopProject[],
	{ sort = 'recent', query = '' }: { sort?: DesktopSort; query?: string } = {}
): DesktopArrangement {
	const tiles = projects.filter(isTile);
	const searching = query.trim().length > 0;
	const currentChild = new Set(
		tiles
			.filter((project) => project.parent_project_id && isCurrent(project))
			.map((project) => project.parent_project_id as string)
	);
	const desk = topLevel(projects);
	const shown = sortRecent(
		searching
			? filterByName(tiles, query)
			: desk.filter((project) => isCurrent(project) || currentChild.has(project.id)),
		projects
	);
	const placed = new Set(shown.map((project) => project.id));
	const completed = searching
		? []
		: sortRecent(
				desk.filter(
					(project) => stateOf(project) === 'completed' && !placed.has(project.id)
				),
				projects
			);
	const groups: TileGroup[] =
		sort === 'activity'
			? groupByPulse(shown)
			: shown.length
				? [{ key: 'all', label: 'Recent', projects: shown }]
				: [];
	const parentNames = new Map<string, string>();
	if (searching) {
		const byId = new Map(tiles.map((project) => [project.id, project]));
		for (const project of shown) {
			const parent = project.parent_project_id ? byId.get(project.parent_project_id) : null;
			if (parent) parentNames.set(project.id, parent.name);
		}
	}
	return {
		groups,
		shown: shown.length,
		completed,
		total: tiles.length,
		nestedCounts: nestedCounts(projects),
		parentNames,
		searching
	};
}

// ---------------------------------------------------------------------------------------------
// What a tile says

const MONOGRAM_SKIP = new Set(['the', 'a', 'an', 'of', 'for', 'and', 'to', 'with', 'in', 'on']);

// Built at runtime so an engine without Unicode property escapes falls back instead of
// failing to parse the module.
const LETTER_OR_DIGIT: RegExp | null = (() => {
	try {
		return new RegExp('[\\p{L}\\p{N}]', 'u');
	} catch {
		return null;
	}
})();

function isLetterOrDigit(char: string): boolean {
	if (LETTER_OR_DIGIT) return LETTER_OR_DIGIT.test(char);
	return /[0-9]/.test(char) || char.toLowerCase() !== char.toUpperCase();
}

/**
 * Two letters from the first two meaningful words ("The Cadre Content Ops" → "CC"), as the
 * website's tiles show before a project has emoji. Display formatting only.
 */
export function monogram(name: string): string {
	const words = name
		.replace(/[—–:()/]/g, ' ')
		.split(/\s+/)
		.map((word) => Array.from(word).filter(isLetterOrDigit).join(''))
		.filter((word) => word && !MONOGRAM_SKIP.has(word.toLowerCase()));
	const first = words[0];
	if (!first) return '·';
	const letters = Array.from(first);
	const second = (words[1] ? Array.from(words[1])[0] : letters[1]) ?? '';
	return `${letters[0]}${second}`.toUpperCase();
}

/**
 * True when the server computed this tile's look (pulse, bars, mix). The phone's fallback
 * read has none, so its tiles skip the meters rather than show empty bars.
 */
export function hasLook(project: DesktopProject): boolean {
	return project.pulse !== null || project.bars.docs > 0 || project.bars.tasks > 0;
}

export function openTaskCount(mix: TaskMix): number {
	return TASK_BUCKETS.reduce((total, bucket) => total + mix[bucket], 0);
}

/**
 * The T bar's colored segments as fractions of the whole track: `bars.tasks` long, split
 * by the open-task mix in TASK_BUCKETS order. Empty buckets are left out.
 */
export function taskSegments(project: DesktopProject): { bucket: TaskBucket; fraction: number }[] {
	const open = openTaskCount(project.mix);
	const length = clamp01(project.bars.tasks);
	if (open <= 0 || length <= 0) return [];
	return TASK_BUCKETS.filter((bucket) => project.mix[bucket] > 0).map((bucket) => ({
		bucket,
		fraction: (length * project.mix[bucket]) / open
	}));
}

/** The red badge's text: the overdue count, capped at "99+". */
export function overdueBadgeText(count: number): string {
	return count > 99 ? '99+' : String(Math.max(0, Math.floor(count)));
}

function plural(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * VoiceOver label for a tile: "BuildOS, moving, 11 open tasks, 3 overdue, holds 1 project".
 * Counts are left out when the tile has no look (they would read as zero).
 */
export function tileAccessibilityLabel(
	project: DesktopProject,
	nested = 0,
	parentName: string | null = null
): string {
	const look = hasLook(project);
	const open = openTaskCount(project.mix);
	return [
		project.name,
		project.pulse ? PULSE_META[project.pulse].label.toLowerCase() : '',
		look ? plural(open, 'open task') : '',
		look && project.mix.overdue > 0 ? `${project.mix.overdue} overdue` : '',
		nested > 0 ? `holds ${plural(nested, 'project')}` : '',
		parentName ? `inside ${parentName}` : ''
	]
		.filter(Boolean)
		.join(', ');
}

/** "3 NESTED". */
export function nestedStamp(count: number): string {
	return `${count} NESTED`;
}

// ---------------------------------------------------------------------------------------------
// Colors (desktop-colors.css + DesktopTile.svelte)

/** At this size and up a tile shows its D/T meters and overdue badge (the web's 'lg'). */
export const FULL_TILE = 56;

export const TILE_TINT = { pulse: 0.16, parked: 0.07, none: 0.05 } as const;

export type TilePalette = {
	/** The tile's ink: its pulse color, or borderStrong without a pulse. */
	ink: string;
	/** Card with the pulse tint, as one opaque color. */
	face: string;
	border: string;
	/** Halftone dot color; draw at `dotOpacity`. */
	dots: string;
	dotOpacity: number;
	/** The folder tab's fill (a stronger tint). */
	tab: string;
	/** Monogram color. Parked and pulse-less tiles use muted ink. */
	glyph: string;
	/** True for parked and pulse-less tiles (emoji fade). */
	faded: boolean;
};

export function tilePalette(
	pulse: ProjectPulse | null,
	colors: ThemeColors,
	pulses: PulseColors
): TilePalette {
	const ink = pulse ? pulses[pulse] : colors.borderStrong;
	const tint = pulse === 'parked' ? TILE_TINT.parked : pulse ? TILE_TINT.pulse : TILE_TINT.none;
	const faded = pulse === 'parked' || pulse === null;
	return {
		ink,
		face: colorMix(ink, colors.card, tint),
		border: withAlpha(ink, 0.5),
		dots: ink,
		dotOpacity: 0.16,
		tab: colorMix(ink, colors.card, 0.22),
		glyph: faded ? colors.mutedForeground : colorMix(ink, colors.foreground, 0.8),
		faded
	};
}

export type MeterColors = { track: string; docs: string } & Record<TaskBucket, string>;

/**
 * One meaning per color: ink = documents, red = overdue, green = in progress, blue =
 * scheduled, gray = backlog.
 */
export function meterColors(colors: ThemeColors): MeterColors {
	return {
		track: withAlpha(colors.foreground, 0.1),
		docs: withAlpha(colors.foreground, 0.75),
		overdue: colors.destructive,
		in_progress: colors.success,
		scheduled: colors.info,
		backlog: colors.borderStrong
	};
}

/** The pill's 14% tint, over the card it sits on. */
export const PULSE_PILL_TINT = 0.14;

/**
 * The pulse pill: tinted fill, half-strength border, text pulled 20% toward the foreground,
 * or further where that still reads under 4.5:1 on the tint (light "Gone quiet").
 */
export function pulsePillColors(
	pulse: ProjectPulse,
	colors: ThemeColors,
	pulses: PulseColors
): { text: string; fill: string; border: string } {
	const ink = pulses[pulse];
	return {
		text: readableMix(ink, colors.foreground, colorMix(ink, colors.card, PULSE_PILL_TINT), 0.8),
		fill: withAlpha(ink, PULSE_PILL_TINT),
		border: withAlpha(ink, 0.5)
	};
}

/** Grid columns for a width: 4 across on phones, fewer only when a cell would drop under `minCell`. */
export function gridColumns(width: number, minCell = 80, max = 4): number {
	if (!(width > 0)) return max;
	return Math.max(1, Math.min(max, Math.floor(width / minCell)));
}

function clamp01(n: number): number {
	return Math.min(1, Math.max(0, n));
}

// ---------------------------------------------------------------------------------------------
// The long-press peek card. iOS needs its size up front, so lines are estimated from text
// length; the card clamps each text to the estimate, so it never overflows.

export const PEEK = {
	width: 320,
	padX: 16,
	tile: 48,
	head: { top: 14, bottom: 12, gap: 8, rowGap: 12 },
	body: { top: 12, bottom: 14, gap: 12 },
	name: { size: 18, line: 22, max: 2 },
	pill: { height: 20, gap: 8 },
	/** `offset` drops the reason's first line to sit level with the pill text. */
	reason: { size: 12.5, line: 16, max: 2, offset: 2 },
	next: { size: 14.5, line: 19, max: 3, padX: 12, padY: 10, label: 14, labelGap: 4 },
	/** Micro-label, bar and a 2×2 grid of counts. */
	mix: { label: 14, labelGap: 6, bar: 6, barGap: 8, row: 17, rowGap: 4 }
} as const;

/** Lines a text needs at a font size and width, using a wide average glyph (errs long). */
export function estimateLines(text: string, fontSize: number, width: number, max: number): number {
	const perLine = Math.max(1, Math.floor((width * 0.9) / (fontSize * 0.56)));
	return Math.min(max, Math.max(1, Math.ceil(text.length / perLine)));
}

/** Width of a pulse pill: uppercase 10.5 with tracking, 7pt padding, 1pt border. */
export function pillWidth(label: string): number {
	return Math.ceil(label.length * 7.6 + 16);
}

export type PeekLayout = {
	width: number;
	height: number;
	nameLines: number;
	reasonLines: number;
	nextLines: number;
	/** Whether each part shows. */
	parts: { pulse: boolean; next: boolean; mix: boolean };
};

/** The next step as the peek shows it: trimmed, null when blank. */
export function peekNextStep(project: DesktopProject): string | null {
	const text = project.next_step_short?.trim();
	return text ? text : null;
}

export function peekLayout(project: DesktopProject): PeekLayout {
	const inner = PEEK.width - 2 * PEEK.padX;
	const nameWidth = inner - PEEK.tile - PEEK.head.rowGap;
	const nameLines = estimateLines(project.name, PEEK.name.size, nameWidth, PEEK.name.max);

	const pulse = project.pulse;
	const reason = pulse && project.pulse_reason ? `${project.pulse_reason}.` : '';
	const reasonWidth = pulse ? inner - pillWidth(PULSE_META[pulse].label) - PEEK.pill.gap : inner;
	const reasonLines = reason
		? estimateLines(reason, PEEK.reason.size, reasonWidth, PEEK.reason.max)
		: 0;

	const next = peekNextStep(project);
	const nextWidth = inner - 2 - 2 * PEEK.next.padX;
	const nextLines = next ? estimateLines(next, PEEK.next.size, nextWidth, PEEK.next.max) : 0;
	const mix = hasLook(project);

	let height =
		PEEK.head.top + Math.max(PEEK.tile, nameLines * PEEK.name.line) + PEEK.head.bottom + 1;
	if (pulse) {
		height +=
			PEEK.head.gap +
			Math.max(PEEK.pill.height, reasonLines * PEEK.reason.line + PEEK.reason.offset);
	}
	const body: number[] = [];
	if (next) {
		body.push(
			2 +
				2 * PEEK.next.padY +
				PEEK.next.label +
				PEEK.next.labelGap +
				nextLines * PEEK.next.line
		);
	}
	if (mix) {
		const m = PEEK.mix;
		body.push(m.label + m.labelGap + m.bar + m.barGap + 2 * m.row + m.rowGap);
	}
	if (body.length) {
		height +=
			PEEK.body.top +
			body.reduce((sum, part) => sum + part, 0) +
			PEEK.body.gap * (body.length - 1) +
			PEEK.body.bottom;
	}
	return {
		width: PEEK.width,
		height: Math.ceil(height),
		nameLines,
		reasonLines,
		nextLines,
		parts: { pulse: Boolean(pulse), next: Boolean(next), mix }
	};
}
