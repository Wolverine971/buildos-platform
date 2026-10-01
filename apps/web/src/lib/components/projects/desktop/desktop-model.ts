// apps/web/src/lib/components/projects/desktop/desktop-model.ts
//
// Pure shaping for the Projects desktop: which projects sit on the desktop and
// which live inside a parent, their order, and how a tile is labeled. No fetches.
import type { ProjectListSummary } from '../project-list';
import { PULSES, PULSE_META, type Pulse } from './desktop-signals';

/** Recent: one group, most recently active first. By activity: one group per pulse. */
export type DesktopSort = 'recent' | 'activity';

const MONOGRAM_SKIP = new Set(['the', 'a', 'an', 'of', 'for', 'and', 'to', 'with', 'in', 'on']);

/** Two letters from the first two meaningful words ("The Cadre Content Ops" → "CC"). */
export function monogram(name: string): string {
	const words = name
		.replace(/[—–:()/]/g, ' ')
		.split(/\s+/)
		.map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
		.filter((word) => word && !MONOGRAM_SKIP.has(word.toLowerCase()));
	const first = words[0];
	if (!first) return '·';
	const second = words[1]?.[0] ?? first[1] ?? '';
	return `${first[0]}${second}`.toUpperCase();
}

/** A project name short enough for a sentence ("Specialist Pilot Smoke — Synthetic…" → "Specialist Pilot Smoke"). */
export function shortName(name: string, max = 36): string {
	const trimmed = name.replace(/\s+[—–]\s+.*$/, '').trim() || name.trim();
	return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

function time(value: string | null | undefined): number {
	const parsed = value ? Date.parse(value) : NaN;
	return Number.isNaN(parsed) ? 0 : parsed;
}

export type DesktopIndex = {
	byId: Map<string, ProjectListSummary>;
	/** Sub-projects per parent, most recently active first. */
	children: Map<string, ProjectListSummary[]>;
	/** A parent's activity includes its sub-projects', so busy folders stay near the front. */
	activity: (project: ProjectListSummary) => number;
};

export function indexProjects(projects: readonly ProjectListSummary[]): DesktopIndex {
	const byId = new Map(projects.map((project) => [project.id, project]));
	const children = new Map<string, ProjectListSummary[]>();
	for (const project of projects) {
		const parentId = project.parent_project_id;
		if (!parentId || !byId.has(parentId)) continue;
		children.set(parentId, [...(children.get(parentId) ?? []), project]);
	}
	const activity = (project: ProjectListSummary) =>
		Math.max(
			time(project.updated_at),
			...(children.get(project.id) ?? []).map((child) => time(child.updated_at))
		);
	for (const list of children.values()) list.sort((a, b) => byRecent(a, b, activity));
	return { byId, children, activity };
}

function byRecent(
	a: ProjectListSummary,
	b: ProjectListSummary,
	activity: (project: ProjectListSummary) => number
): number {
	return activity(b) - activity(a) || a.name.localeCompare(b.name);
}

/** A project sits on the desktop unless its parent is one the viewer can see. */
export function isOnDesktop(project: ProjectListSummary, index: DesktopIndex): boolean {
	return !project.parent_project_id || !index.byId.has(project.parent_project_id);
}

export function sortRecent(
	projects: readonly ProjectListSummary[],
	index: DesktopIndex
): ProjectListSummary[] {
	return [...projects].sort((a, b) => byRecent(a, b, index.activity));
}

export type DesktopGroup = { key: string; label: string; projects: ProjectListSummary[] };

const ACTIVITY_GROUPS: { key: Pulse | 'unknown'; label: string }[] = [
	...PULSES.map((pulse) => ({ key: pulse, label: PULSE_META[pulse].label })),
	{ key: 'unknown', label: 'No history yet' }
];

/** Recent: one group. By activity: Moving, Being shaped, Gone quiet, Parked; empty groups dropped. */
export function groupDesktop(
	projects: readonly ProjectListSummary[],
	index: DesktopIndex,
	sort: DesktopSort,
	pulseOf: (project: ProjectListSummary) => Pulse | null = () => null
): DesktopGroup[] {
	const ordered = sortRecent(projects, index);
	if (sort === 'recent') return [{ key: 'all', label: 'Recent', projects: ordered }];
	return ACTIVITY_GROUPS.map((group) => ({
		key: group.key,
		label: group.label,
		projects: ordered.filter((project) => (pulseOf(project) ?? 'unknown') === group.key)
	})).filter((group) => group.projects.length > 0);
}

/** "today", "yesterday", "5 days ago", "3 weeks ago", "4 months ago". */
export function relativeDay(value: string | null | undefined, now = Date.now()): string {
	const then = time(value);
	if (!then) return 'a while ago';
	const days = Math.floor((now - then) / 86_400_000);
	if (days <= 0) return 'today';
	if (days === 1) return 'yesterday';
	if (days < 14) return `${days} days ago`;
	if (days < 60) return `${Math.round(days / 7)} weeks ago`;
	if (days < 730) return `${Math.round(days / 30)} months ago`;
	return `${Math.round(days / 365)} years ago`;
}
