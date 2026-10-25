// apps/web/src/lib/components/builder-profile/editor/builder-editor.ts
//
// Pure logic behind the "Your page" editor (Profile > People & agents): turning the
// editor's rows into the PUT payloads the API takes, the Hidden / Listed / Live ladder
// and its ordering, the "Preview as: Anyone" filter, and small display helpers.
// No Svelte, no fetch: everything here is unit-tested in builder-editor.test.ts.

import type {
	BuilderAudience,
	BuilderEditorLink,
	BuilderEditorProject,
	BuilderLinkKind,
	BuilderProfileLink,
	BuilderProfileProjectCard,
	BuilderProfileSettings,
	BuilderProfileView,
	BuilderProjectLevel
} from '$lib/builder-profile/types';
import { normalizeLinkUrl } from '$lib/builder-profile/links';
import { normalizeReplyUrl, projectSlug, replyDisplay } from '$lib/builder-profile/project-pages';
import { activeLabel } from '$lib/builder-profile/format';

/** Mirrors the server's limits (builder-profile.service.ts) so inputs stop where the API does. */
export const LIMITS = {
	name: 80,
	headline: 120,
	location: 80,
	bio: 280,
	now_text: 160,
	public_name: 80,
	pitch: 200,
	looking_for: 200,
	this_week: 220,
	link_label: 80,
	link_note: 120,
	links: 30,
	projects: 24,
	goals: 3
} as const;

export const URL_ERROR = 'Needs a web address that starts with https://';
export const REPLY_ERROR = 'Needs a web address or an email address';

// ---- Header ---------------------------------------------------------------------

export type HeaderField = 'name' | 'headline' | 'location' | 'bio' | 'now_text';
export const HEADER_FIELDS: HeaderField[] = ['name', 'headline', 'location', 'bio', 'now_text'];

/** The server collapses runs of whitespace and trims; compare the same way. */
export function normalizeText(value: string | null | undefined): string {
	return (value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * What to PATCH for one header field after a blur: the cleaned value (null clears it),
 * or undefined when nothing changed, so no request goes out.
 */
export function headerChange(
	draft: string,
	saved: string | null | undefined
): string | null | undefined {
	const next = normalizeText(draft);
	if (next === normalizeText(saved)) return undefined;
	return next || null;
}

export function headerDraftsFrom(
	settings: BuilderProfileSettings,
	name: string | null = null
): Record<HeaderField, string> {
	return {
		name: name ?? '',
		headline: settings.headline ?? '',
		location: settings.location ?? '',
		bio: settings.bio ?? '',
		now_text: settings.now_text ?? ''
	};
}

// ---- Links ----------------------------------------------------------------------

export interface EditorLinkRow {
	/** Stable key for the list; not sent. */
	key: string;
	kind: BuilderLinkKind;
	url: string;
	label: string;
	note: string;
	audience: BuilderAudience;
}

export interface LinkPayloadItem {
	kind: BuilderLinkKind;
	url: string;
	label?: string;
	note?: string;
	audience: BuilderAudience;
}

let linkKeySeed = 0;
export function newLinkKey(): string {
	linkKeySeed += 1;
	return `link-${Date.now().toString(36)}-${linkKeySeed}`;
}

export function blankLinkRow(kind: BuilderLinkKind, key: string = newLinkKey()): EditorLinkRow {
	return { key, kind, url: '', label: '', note: '', audience: 'anyone' };
}

export function linkRowsFrom(
	links: BuilderEditorLink[],
	makeKey: () => string = newLinkKey
): { socials: EditorLinkRow[]; links: EditorLinkRow[] } {
	const toRow = (link: BuilderEditorLink): EditorLinkRow => ({
		key: link.id ?? makeKey(),
		kind: link.kind,
		// "x.com/you" reads better than "https://x.com/you"; saving puts https:// back.
		url: link.url.replace(/^https:\/\//i, ''),
		label: link.label ?? '',
		note: link.note ?? '',
		audience: link.audience
	});
	return {
		socials: links.filter((l) => l.kind === 'social').map(toRow),
		links: links.filter((l) => l.kind === 'link').map(toRow)
	};
}

/** A row the owner added and never filled in. Dropped on save instead of failing it. */
export function isBlankLinkRow(row: EditorLinkRow): boolean {
	return !row.url.trim() && !row.label.trim() && !row.note.trim();
}

/** Why this row can't be saved, or null. Blank rows are fine (they're skipped). */
export function linkRowError(row: EditorLinkRow): string | null {
	if (isBlankLinkRow(row)) return null;
	if (!row.url.trim()) return 'Add a web address, or delete this link.';
	return normalizeLinkUrl(row.url) ? null : URL_ERROR;
}

/** The PUT /api/profile/builder/links body: socials first, then links, in on-screen order. */
export function buildLinksPayload(
	socials: EditorLinkRow[],
	links: EditorLinkRow[]
): { links: LinkPayloadItem[] } {
	const items: LinkPayloadItem[] = [];
	for (const row of [...socials, ...links]) {
		if (isBlankLinkRow(row)) continue;
		const item: LinkPayloadItem = {
			kind: row.kind,
			url: normalizeLinkUrl(row.url) ?? row.url.trim(),
			audience: row.audience
		};
		const label = normalizeText(row.label);
		const note = normalizeText(row.note);
		if (label) item.label = label;
		if (note && row.kind === 'link') item.note = note;
		items.push(item);
	}
	return { links: items };
}

// ---- Projects -------------------------------------------------------------------

export type EditorLevel = 'hidden' | BuilderProjectLevel;

export interface EditorProjectRow {
	project: BuilderEditorProject;
	level: EditorLevel;
	public_name: string;
	pitch: string;
	link_url: string;
	audience: BuilderAudience;
	goal_ids: string[];
	show_next_milestone: boolean;
	looking_for: string;
	/** Where "I'm interested" goes, as typed: a link or an email address. */
	reply_url: string;
	this_week: string;
}

export interface ProjectPayloadItem {
	project_id: string;
	level: BuilderProjectLevel;
	public_name?: string;
	pitch?: string;
	link_url?: string;
	audience: BuilderAudience;
	goal_ids?: string[];
	show_next_milestone?: boolean;
	looking_for?: string;
	reply_url?: string;
	this_week?: string;
}

/** Editor rows from GET /api/profile/builder (already sorted: placed first, by position). */
export function rowsFromProjects(projects: BuilderEditorProject[]): EditorProjectRow[] {
	const rows = projects.map((project): EditorProjectRow => {
		const p = project.placement;
		const goalIds = new Set(project.goals.map((g) => g.id));
		return {
			project,
			level: p?.level ?? 'hidden',
			public_name: p?.public_name ?? '',
			pitch: p?.pitch ?? '',
			link_url: p?.link_url ?? '',
			audience: p?.audience ?? 'anyone',
			goal_ids: (p?.goal_ids ?? []).filter((id) => goalIds.has(id)).slice(0, LIMITS.goals),
			show_next_milestone: p?.show_next_milestone ?? true,
			looking_for: p?.looking_for ?? '',
			reply_url: replyDisplay(p?.reply_url),
			this_week: p?.this_week ?? ''
		};
	});
	// Keep the invariant the editor relies on: placed rows first, in page order.
	const placed = rows
		.filter((r) => r.level !== 'hidden')
		.sort(
			(a, b) => (a.project.placement?.position ?? 0) - (b.project.placement?.position ?? 0)
		);
	return [...placed, ...rows.filter((r) => r.level === 'hidden')];
}

export function isPlaced(row: EditorProjectRow): boolean {
	return row.level !== 'hidden';
}

export function placedCount(rows: EditorProjectRow[]): number {
	return rows.filter(isPlaced).length;
}

/**
 * Change one project's level. Placed rows stay together at the top in page order: a
 * project you put on the page joins the end of that group; one you hide goes back to
 * the top of the hidden ones. Listed <-> Live stays in place. Refuses (returns the
 * same array) past the 24-project limit.
 */
export function setRowLevel(
	rows: EditorProjectRow[],
	projectId: string,
	level: EditorLevel
): EditorProjectRow[] {
	const index = rows.findIndex((r) => r.project.project_id === projectId);
	if (index < 0) return rows;
	const row = rows[index];
	if (!row || row.level === level) return rows;
	const wasPlaced = isPlaced(row);
	const willBePlaced = level !== 'hidden';
	if (wasPlaced === willBePlaced) {
		return rows.map((r, i) => (i === index ? { ...r, level } : r));
	}
	if (willBePlaced && placedCount(rows) >= LIMITS.projects) return rows;
	const rest = rows.filter((_, i) => i !== index);
	const boundary = placedCount(rest);
	const next = { ...row, level };
	return [...rest.slice(0, boundary), next, ...rest.slice(boundary)];
}

/** Move a placed project up (-1) or down (+1) among the placed ones. */
export function movePlacedRow(
	rows: EditorProjectRow[],
	projectId: string,
	delta: -1 | 1
): EditorProjectRow[] {
	const count = placedCount(rows);
	const index = rows.findIndex((r) => r.project.project_id === projectId);
	if (index < 0 || index >= count) return rows;
	const target = index + delta;
	if (target < 0 || target >= count) return rows;
	return moveItem(rows, index, delta);
}

export function toggleGoal(row: EditorProjectRow, goalId: string): string[] {
	if (row.goal_ids.includes(goalId)) return row.goal_ids.filter((id) => id !== goalId);
	if (row.goal_ids.length >= LIMITS.goals) return row.goal_ids;
	return [...row.goal_ids, goalId];
}

/** Why a placed row can't be saved, keyed by project id. */
export function projectRowErrors(rows: EditorProjectRow[]): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const row of rows) {
		if (!isPlaced(row)) continue;
		if (row.link_url.trim() && !normalizeLinkUrl(row.link_url)) {
			errors[row.project.project_id] = URL_ERROR;
		}
	}
	return errors;
}

/** Live rows whose "I'm interested" address can't be used, keyed by project id. */
export function projectReplyErrors(rows: EditorProjectRow[]): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const row of rows) {
		if (row.level !== 'live') continue;
		if (row.reply_url.trim() && !normalizeReplyUrl(row.reply_url)) {
			errors[row.project.project_id] = REPLY_ERROR;
		}
	}
	return errors;
}

/**
 * A website from your links that looks like this project's (same name as the link's
 * title, or as its domain), offered as a one-tap fill for the project's link. Null when
 * the project already has a link or nothing matches. Compares names and host names,
 * structured strings; a wrong guess is only a suggestion the owner can ignore.
 */
export function suggestProjectLink(
	row: EditorProjectRow,
	links: Pick<EditorLinkRow, 'kind' | 'url' | 'label'>[]
): string | null {
	if (row.link_url.trim()) return null;
	const key = (value: string) => projectSlug(value).replace(/-/g, '');
	const wanted = key(row.public_name.trim() || row.project.name);
	if (!wanted) return null;
	for (const link of links) {
		if (link.kind !== 'link') continue;
		const url = normalizeLinkUrl(link.url);
		if (!url) continue;
		const host = new URL(url).hostname.replace(/^www\./, '');
		const stem = host.split('.').slice(0, -1).join('.');
		if (key(link.label) === wanted || key(stem) === wanted) return url;
	}
	return null;
}

/**
 * The PUT /api/profile/builder/projects body: every placed row in page order. Hidden
 * rows are left out (which hides them). The Live-only parts (goals, milestone,
 * looking for, this week) go out only for Live cards, so a Listed card never carries
 * them.
 */
export function buildProjectsPayload(rows: EditorProjectRow[]): { projects: ProjectPayloadItem[] } {
	const projects: ProjectPayloadItem[] = [];
	for (const row of rows) {
		if (row.level === 'hidden') continue;
		const item: ProjectPayloadItem = {
			project_id: row.project.project_id,
			level: row.level,
			audience: row.audience
		};
		const publicName = normalizeText(row.public_name);
		const pitch = normalizeText(row.pitch);
		const link = row.link_url.trim();
		if (publicName) item.public_name = publicName;
		if (pitch) item.pitch = pitch;
		if (link) item.link_url = normalizeLinkUrl(link) ?? link;
		if (row.level === 'live') {
			const known = new Set(row.project.goals.map((g) => g.id));
			item.goal_ids = row.goal_ids.filter((id) => known.has(id)).slice(0, LIMITS.goals);
			item.show_next_milestone = row.show_next_milestone;
			const lookingFor = normalizeText(row.looking_for);
			const thisWeek = normalizeText(row.this_week);
			const reply = row.reply_url.trim();
			if (lookingFor) item.looking_for = lookingFor;
			if (reply) item.reply_url = normalizeReplyUrl(reply) ?? reply;
			if (thisWeek) item.this_week = thisWeek;
		}
		projects.push(item);
	}
	return { projects };
}

/** Same payload, as a string, for "unsaved changes" checks. */
export function projectsKey(rows: EditorProjectRow[]): string {
	return JSON.stringify(buildProjectsPayload(rows));
}

export function linksKey(socials: EditorLinkRow[], links: EditorLinkRow[]): string {
	return JSON.stringify(buildLinksPayload(socials, links));
}

/**
 * Which projects "Draft my page" writes from: the ones on the page, or else the five
 * most recently active (the API reads at most 8).
 */
export function draftProjectIds(rows: EditorProjectRow[], fallbackCount = 5): string[] {
	const placed = rows.filter(isPlaced).map((r) => r.project.project_id);
	if (placed.length) return placed.slice(0, 8);
	return [...rows]
		.filter((r) => r.project.last_active_at)
		.sort((a, b) =>
			(b.project.last_active_at ?? '').localeCompare(a.project.last_active_at ?? '')
		)
		.slice(0, fallbackCount)
		.map((r) => r.project.project_id);
}

/**
 * Accept a drafted pitch: it becomes that project's pitch. A hidden project goes on
 * the page as Listed, since accepting its pitch is choosing to show it.
 */
export function applySuggestedPitch(
	rows: EditorProjectRow[],
	projectId: string,
	pitch: string
): EditorProjectRow[] {
	const clean = normalizeText(pitch).slice(0, LIMITS.pitch);
	let next = rows;
	const row = next.find((r) => r.project.project_id === projectId);
	if (!row) return rows;
	if (row.level === 'hidden') next = setRowLevel(next, projectId, 'listed');
	return next.map((r) => (r.project.project_id === projectId ? { ...r, pitch: clean } : r));
}

// ---- Display --------------------------------------------------------------------

/** "128 changes this year, 40% by agents · active 3 days ago" for a project row. */
export function projectActivityLine(project: BuilderEditorProject, now: Date = new Date()): string {
	const parts: string[] = [];
	if (project.changes_year > 0) {
		const changes = `${project.changes_year} change${project.changes_year === 1 ? '' : 's'} this year`;
		const pct = Math.round(
			(100 * Math.min(project.by_agents_year, project.changes_year)) / project.changes_year
		);
		parts.push(project.by_agents_year > 0 ? `${changes}, ${pct}% by agents` : changes);
	}
	parts.push(activeLabel(project.last_active_at, now));
	return parts.join(' · ');
}

/** Other people in the project (member_count includes the owner). */
export function sharedWithCount(project: BuilderEditorProject): number {
	return Math.max(0, project.member_count - 1);
}

export function sharedWithLabel(project: BuilderEditorProject): string | null {
	const n = sharedWithCount(project);
	if (n === 0) return null;
	return `Shared with ${n} ${n === 1 ? 'person' : 'people'}. Check the public name.`;
}

// ---- Preview --------------------------------------------------------------------

export type PreviewAudience = 'anyone' | 'collaborators';

/**
 * The saved page with the editor's unsaved edits laid over it, so the card on the
 * canvas changes as you type: header text, photo and cover, links, which projects show
 * and in what order, their text, goals and milestone, and the section switches. A
 * project just added has no weekly bars until it saves and the page reloads.
 */
export function overlayView(
	base: BuilderProfileView,
	draft: {
		header: Record<HeaderField, string>;
		settings: BuilderProfileSettings;
		socials: EditorLinkRow[];
		links: EditorLinkRow[];
		rows: EditorProjectRow[];
		audience: PreviewAudience;
	}
): BuilderProfileView {
	const { header, settings, audience } = draft;
	const text = (value: string) => normalizeText(value) || undefined;
	const visible = (who: BuilderAudience) => audience === 'collaborators' || who === 'anyone';

	const links: BuilderProfileLink[] = [];
	for (const row of [...draft.socials, ...draft.links]) {
		const url = normalizeLinkUrl(row.url);
		if (!url || !visible(row.audience)) continue;
		links.push({
			id: row.key,
			kind: row.kind,
			url,
			label: text(row.label),
			note: row.kind === 'link' ? text(row.note) : undefined,
			audience: row.audience
		});
	}

	const saved = new Map(base.projects.map((card) => [card.id, card]));
	const projects: BuilderProfileProjectCard[] = [];
	for (const row of draft.rows) {
		if (row.level === 'hidden' || !visible(row.audience)) continue;
		const p = row.project;
		const live = row.level === 'live';
		const card: BuilderProfileProjectCard = {
			...(saved.get(p.project_id) ?? {
				id: p.project_id,
				stage: p.stage ?? undefined,
				state: p.state ?? undefined,
				glyphs: p.glyphs,
				last_active_at: p.last_active_at ?? undefined,
				member_count: p.member_count
			}),
			id: p.project_id,
			level: row.level,
			name: text(row.public_name) ?? p.name,
			pitch: text(row.pitch),
			link_url: normalizeLinkUrl(row.link_url) ?? undefined,
			audience: row.audience
		};
		if (live) {
			const names = new Map(p.goals.map((g) => [g.id, g.name]));
			const goals = row.goal_ids.map((id) => names.get(id)).filter((n): n is string => !!n);
			card.goals = goals.length ? goals : undefined;
			card.next_milestone = row.show_next_milestone
				? (p.next_milestone ?? undefined)
				: undefined;
			card.looking_for = text(row.looking_for);
			card.reply_url = normalizeReplyUrl(row.reply_url) ?? undefined;
			card.this_week = text(row.this_week);
		} else {
			for (const key of [
				'goals',
				'next_milestone',
				'looking_for',
				'reply_url',
				'this_week',
				'weekly'
			] as const) {
				delete card[key];
			}
		}
		projects.push(card);
	}
	// The page shows Live cards first, then Listed, each in the order you set.
	projects.sort((a, b) => Number(b.level === 'live') - Number(a.level === 'live'));

	const activity =
		settings.show_build_log && base.activity
			? { ...base.activity, show_agent_split: settings.show_agent_split }
			: undefined;

	return {
		...base,
		profile: {
			...base.profile,
			name: text(header.name) ?? base.profile.name,
			headline: text(header.headline),
			location: text(header.location),
			bio: text(header.bio),
			now_text: text(header.now_text),
			avatar_url: settings.avatar_url ?? undefined,
			cover_url: settings.cover_url ?? undefined
		},
		settings: {
			show_build_log: settings.show_build_log,
			show_agent_split: settings.show_agent_split,
			show_writing: settings.show_writing,
			show_builds_with: settings.show_builds_with
		},
		links,
		projects,
		activity
	};
}

// ---- Lists ----------------------------------------------------------------------

/** A copy of `items` with the item at `index` moved by `delta` (no-op at the ends). */
export function moveItem<T>(items: T[], index: number, delta: number): T[] {
	const target = index + delta;
	if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
	const next = [...items];
	const item = next.splice(index, 1)[0] as T;
	next.splice(target, 0, item);
	return next;
}
