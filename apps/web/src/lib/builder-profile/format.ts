// apps/web/src/lib/builder-profile/format.ts
//
// Display helpers for builder profiles, shared by the public page, the editor preview,
// the JSON view and tests. Pure functions only.

import type { BuilderProfileActivity, BuilderProfileProjectCard } from './types';

const STAGE_LABELS: Record<string, string> = {
	discovery: 'Exploring',
	research: 'Exploring',
	planning: 'Planning',
	execution: 'Building',
	launch: 'Launching',
	growth: 'Growing',
	operations: 'Running',
	maintenance: 'Maintaining',
	complete: 'Done'
};

const STATE_LABELS: Record<string, string> = {
	paused: 'Paused',
	completed: 'Done',
	cancelled: 'Stopped'
};

/** "Building", "Planning"…; a paused or finished project says so instead. */
export function stageLabel(card: Pick<BuilderProfileProjectCard, 'stage' | 'state'>): string {
	return (
		(card.state ? STATE_LABELS[card.state] : undefined) ??
		(card.stage ? STAGE_LABELS[card.stage] : undefined) ??
		'Building'
	);
}

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** "active today", "active 5 days ago", "quiet since July", "no activity yet". */
export function activeLabel(
	lastActiveAt: string | null | undefined,
	now: Date = new Date()
): string {
	if (!lastActiveAt) return 'no activity yet';
	const then = new Date(lastActiveAt);
	if (Number.isNaN(then.getTime())) return 'no activity yet';
	const startOfDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
	const days = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);
	if (days <= 0) return 'active today';
	if (days === 1) return 'active yesterday';
	if (days < 14) return `active ${days} days ago`;
	if (days < 45) return `active ${Math.round(days / 7)} weeks ago`;
	const sameYear = then.getFullYear() === now.getFullYear();
	return `quiet since ${MONTHS[then.getMonth()]}${sameYear ? '' : ` ${then.getFullYear()}`}`;
}

/** "May 2025" */
export function monthYear(iso: string | null | undefined): string | null {
	if (!iso) return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Nov 1" (or "Nov 1, 2027" in another year) for a due date. */
export function shortDate(iso: string | null | undefined, now: Date = new Date()): string | null {
	if (!iso) return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	const base = `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
	return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

export function initialsOf(name: string | null | undefined, handle: string): string {
	const source = (name ?? '').trim() || handle;
	const parts = source.split(/\s+/).filter(Boolean);
	const letters = parts.length > 1 ? [parts[0]?.[0], parts[1]?.[0]] : [source[0], source[1]];
	return letters.filter(Boolean).join('').toUpperCase();
}

// ---- Build log grid ---------------------------------------------------------

export interface BuildLogCell {
	date: string;
	changes: number;
	byAgents: number;
	/** 0 (none) to 4 (busiest). */
	level: 0 | 1 | 2 | 3 | 4;
	/** 0–100: share of the day's changes made by agents (0 when the split is off). */
	agentPercent: number;
	future: boolean;
}

export interface BuildLogGrid {
	weeks: BuildLogCell[][];
	/** Index of the week where each month label goes. */
	months: { index: number; label: string }[];
	activeDays: number;
	changes: number;
	byAgents: number;
	agentPercent: number;
}

function parseDay(day: string): number {
	const [y, m, d] = day.split('-').map(Number);
	return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function dayKey(t: number): string {
	return new Date(t).toISOString().slice(0, 10);
}

export function levelFor(changes: number): 0 | 1 | 2 | 3 | 4 {
	if (changes <= 0) return 0;
	if (changes < 4) return 1;
	if (changes < 10) return 2;
	if (changes < 25) return 3;
	return 4;
}

/**
 * The last 53 weeks as columns of 7 days (Sunday first), ending on the owner's today.
 * Totals cover the last 365 days.
 */
export function buildLogGrid(activity: BuilderProfileActivity): BuildLogGrid {
	const DAY = 86_400_000;
	const today = parseDay(activity.today);
	const byDay = new Map<string, [number, number]>();
	for (const [day, changes, agents] of activity.days) byDay.set(day, [changes, agents]);

	const startRaw = today - 364 * DAY;
	const start = startRaw - new Date(startRaw).getUTCDay() * DAY;
	const weeks: BuildLogCell[][] = [];
	const months: { index: number; label: string }[] = [];
	let activeDays = 0;
	let changes = 0;
	let byAgents = 0;
	let previousMonth = -1;

	for (let weekStart = start, index = 0; weekStart <= today; weekStart += 7 * DAY, index++) {
		const month = new Date(weekStart).getUTCMonth();
		if (month !== previousMonth && index > 0)
			months.push({ index, label: MONTHS_SHORT[month] ?? '' });
		previousMonth = month;
		const week: BuildLogCell[] = [];
		for (let d = 0; d < 7; d++) {
			const t = weekStart + d * DAY;
			const date = dayKey(t);
			const [c, a] = byDay.get(date) ?? [0, 0];
			const future = t > today;
			if (!future && t > today - 365 * DAY && c > 0) {
				activeDays++;
				changes += c;
				byAgents += a;
			}
			week.push({
				date,
				changes: future ? 0 : c,
				byAgents: future ? 0 : a,
				level: future ? 0 : levelFor(c),
				agentPercent:
					activity.show_agent_split && c > 0 ? Math.round((100 * Math.min(a, c)) / c) : 0,
				future
			});
		}
		weeks.push(week);
	}

	return {
		weeks,
		months,
		activeDays,
		changes,
		byAgents,
		agentPercent: changes > 0 ? Math.round((100 * byAgents) / changes) : 0
	};
}

export function cellLabel(cell: BuildLogCell): string {
	const d = new Date(parseDay(cell.date));
	const when = `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
	if (cell.changes === 0) return `${when}: no updates`;
	const agents =
		cell.byAgents > 0 ? `, ${Math.min(cell.byAgents, cell.changes)} by AI agents` : '';
	return `${when}: ${cell.changes} update${cell.changes === 1 ? '' : 's'}${agents}`;
}

/** Headline numbers for some weeks of the grid (a phone shows the last 6 months). */
export function buildLogTotals(weeks: BuildLogCell[][]): {
	activeDays: number;
	changes: number;
	byAgents: number;
	agentPercent: number;
} {
	let activeDays = 0;
	let changes = 0;
	let byAgents = 0;
	for (const week of weeks) {
		for (const cell of week) {
			if (cell.future || cell.changes <= 0) continue;
			activeDays++;
			changes += cell.changes;
			byAgents += Math.min(cell.byAgents, cell.changes);
		}
	}
	return {
		activeDays,
		changes,
		byAgents,
		agentPercent: changes > 0 ? Math.round((100 * byAgents) / changes) : 0
	};
}

/**
 * The line sign-up shows when a visitor tapped Follow or Ask to join on a builder page and
 * was sent to create an account. Read from the redirect path (a URL, not prose): "/@djwayne
 * ?intent=follow" → "Create a free account to follow @djwayne." Null for any other path.
 */
export function signupContextLine(redirectPath: string | null | undefined): string | null {
	if (!redirectPath || !redirectPath.startsWith('/@')) return null;
	let url: URL;
	try {
		url = new URL(redirectPath, 'https://build-os.com');
	} catch {
		return null;
	}
	const [first = '', second] = url.pathname.split('/').filter(Boolean);
	const handle = first.slice(1).toLowerCase();
	if (!/^[a-z0-9-]{3,24}$/.test(handle)) return null;
	if (url.searchParams.has('ask')) {
		return `Create a free account to ask @${handle} about joining. Already on BuildOS? Sign in below.`;
	}
	if (url.searchParams.get('intent') === 'follow') {
		const what =
			url.searchParams.has('project') || second ? `@${handle}’s project` : `@${handle}`;
		return `Create a free account to follow ${what}. Updates show up in your daily brief.`;
	}
	return null;
}

/**
 * A short tag for a builder page's link preview image that changes when what the image
 * shows changes (name, photo, headline, projects, the day of the build log), so link
 * previews pick up edits instead of a cached old card.
 */
export function shareCardVersion(view: {
	profile: {
		handle: string;
		name?: string;
		headline?: string;
		location?: string;
		avatar_url?: string;
		now_text?: string;
		bio?: string;
	};
	projects: { name: string; audience: string }[];
	activity?: { today: string; show_agent_split: boolean; days: unknown[] } | null;
}): string {
	const source = JSON.stringify([
		view.profile.handle,
		view.profile.name,
		view.profile.headline,
		view.profile.location,
		view.profile.avatar_url,
		view.profile.now_text,
		view.profile.bio,
		view.projects.filter((p) => p.audience === 'anyone').map((p) => p.name),
		view.activity
			? [view.activity.today, view.activity.show_agent_split, view.activity.days.length]
			: null
	]);
	let hash = 5381;
	for (let i = 0; i < source.length; i++) hash = ((hash * 33) ^ source.charCodeAt(i)) >>> 0;
	return hash.toString(36);
}
