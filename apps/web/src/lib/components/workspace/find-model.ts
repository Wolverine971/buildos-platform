// apps/web/src/lib/components/workspace/find-model.ts
//
// Workspace search (tasker 159): one search over the Workspace and every project the person
// can open, behind the search box on /projects and ⌘K anywhere. Two lanes:
//   - word matches (GET /api/workspace/find): instant, free, prefix words, note text included;
//   - best match (POST /api/workspace/find/best): Jev reads what the person meant, only for
//     longer queries or thin word matches, and adds on top when it lands (fail-open).
// Pure shapes and helpers, shared by the endpoints, the pane and the palette. No fetches.

export type FindKind = 'project' | 'document' | 'task' | 'goal';

export type FindItem = {
	kind: FindKind;
	id: string;
	project_id: string;
	/** The project's name; the Workspace's own name for loose items. */
	project_name: string | null;
	/** Loose: it lives in the person's Workspace. */
	in_workspace: boolean;
	title: string;
	/** Text around the match, matched words wrapped in MARK_OPEN / MARK_CLOSE. Null when the
	 * match is in the title only. */
	snippet: string | null;
	state_key: string | null;
	type_key: string | null;
	due_at: string | null;
	updated_at: string | null;
};

export type FindResponse = { query: string; items: FindItem[] };

export type BestMatchItem = FindItem & {
	/** Jev's relevance, 0–1. */
	p: number;
};

export type BestMatchStatus = 'selected' | 'empty' | 'unavailable' | 'skipped';

export type BestMatchResponse = {
	query: string;
	status: BestMatchStatus;
	items: BestMatchItem[];
	ms: number;
};

/** Snippet markers from onto_find_items (chr(2) / chr(3)); never markup. */
export const MARK_OPEN = '\u0002';
export const MARK_CLOSE = '\u0003';

export const FIND_QUERY_MAX = 200;
/** Shorter queries search nothing (one letter matches everything). */
export const FIND_QUERY_MIN = 2;
/** Best match runs for queries of this many words… */
export const BEST_MATCH_MIN_WORDS = 3;
/** …or when word matches come back fewer than this, for a query at least this long. */
export const BEST_MATCH_THIN_RESULTS = 3;
export const BEST_MATCH_THIN_MIN_CHARS = 4;
export const BEST_MATCH_MAX_ITEMS = 5;

export const NOTE_TYPE_KEY = 'document.note';

export function normalizeFindQuery(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value.replace(/\s+/g, ' ').trim().slice(0, FIND_QUERY_MAX);
}

/** Whitespace-separated words: a length gate, not a reading of what the query means. */
export function findWordCount(query: string): number {
	const trimmed = query.trim();
	return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Whether to ask for a best match (about $0.0008 each): 3+ word queries, or a query of a few
 * characters whose word matches came back thin.
 */
export function shouldAskBestMatch(query: string, wordMatches: number): boolean {
	const normalized = normalizeFindQuery(query);
	if (normalized.length < FIND_QUERY_MIN) return false;
	if (findWordCount(normalized) >= BEST_MATCH_MIN_WORDS) return true;
	return normalized.length >= BEST_MATCH_THIN_MIN_CHARS && wordMatches < BEST_MATCH_THIN_RESULTS;
}

export type FindSegment = { text: string; mark: boolean };

/** Split marked text into plain and matched runs (stray markers are dropped). */
export function splitMarks(text: string | null | undefined): FindSegment[] {
	if (!text) return [];
	const segments: FindSegment[] = [];
	let mark = false;
	let current = '';
	for (const char of text) {
		if (char === MARK_OPEN || char === MARK_CLOSE) {
			if (current) segments.push({ text: current, mark });
			current = '';
			mark = char === MARK_OPEN;
			continue;
		}
		current += char;
	}
	if (current) segments.push({ text: current, mark });
	// Markdown marks (headings, quotes, emphasis) read as noise in a one-line excerpt.
	return segments
		.map((segment) => ({
			...segment,
			text: segment.text.replace(/[#>*_`~]+/g, ' ').replace(/\s+/g, ' ')
		}))
		.filter((segment) => segment.text.trim().length > 0);
}

export function hasMarks(text: string | null | undefined): boolean {
	return Boolean(text && text.includes(MARK_OPEN));
}

export type FindDisplayKind = 'note' | 'doc' | 'task' | 'goal' | 'project';

export function displayKind(item: Pick<FindItem, 'kind' | 'type_key'>): FindDisplayKind {
	if (item.kind === 'document') return item.type_key === NOTE_TYPE_KEY ? 'note' : 'doc';
	return item.kind;
}

export const DISPLAY_KIND_LABEL: Record<FindDisplayKind, string> = {
	note: 'Note',
	doc: 'Doc',
	task: 'Task',
	goal: 'Goal',
	project: 'Project'
};

const DONE_STATES = new Set(['done', 'completed', 'closed', 'cancelled', 'canceled']);

export function isDone(item: Pick<FindItem, 'kind' | 'state_key'>): boolean {
	return item.kind !== 'project' && DONE_STATES.has(item.state_key ?? '');
}

/** Results for the pane and the palette: the best match first, then the Workspace, then
 * projects and what's inside them. An item never shows twice. */
export type FindGroups = {
	best: BestMatchItem[];
	workspace: FindItem[];
	projects: FindItem[];
	inProjects: FindItem[];
};

export function groupFindResults(
	items: readonly FindItem[],
	best: readonly BestMatchItem[] = []
): FindGroups {
	const shown = new Set(best.map((item) => `${item.kind}:${item.id}`));
	const rest = items.filter((item) => !shown.has(`${item.kind}:${item.id}`));
	return {
		best: [...best],
		workspace: rest.filter((item) => item.in_workspace && item.kind !== 'project'),
		projects: rest.filter((item) => item.kind === 'project'),
		inProjects: rest.filter((item) => !item.in_workspace && item.kind !== 'project')
	};
}

// ---------- Item links: /projects?open=kind:id ----------

export type OpenRef = { kind: FindKind; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN_KINDS: Record<string, FindKind> = {
	project: 'project',
	document: 'document',
	doc: 'document',
	note: 'document',
	task: 'task',
	goal: 'goal'
};

/** `task:<uuid>` → { kind, id }; anything else → null. */
export function parseOpenParam(value: string | null | undefined): OpenRef | null {
	if (!value) return null;
	const at = value.indexOf(':');
	if (at <= 0) return null;
	const kind = OPEN_KINDS[value.slice(0, at).toLowerCase()];
	const id = value.slice(at + 1).toLowerCase();
	if (!kind || !UUID.test(id)) return null;
	return { kind, id };
}

export function openParam(ref: OpenRef): string {
	return `${ref.kind}:${ref.id}`;
}

/** The link that opens an item on /projects (search results, ⌘K, chat). */
export function openHref(ref: OpenRef): string {
	return `/projects?open=${openParam(ref)}`;
}

/** Where an item lives, for its row: "Workspace" or the project's name. */
export function whereLabel(item: Pick<FindItem, 'in_workspace' | 'project_name'>): string {
	return item.in_workspace ? 'Workspace' : (item.project_name ?? 'A project');
}

// ---------- What shows ----------

export type FindLimits = { best: number; workspace: number; projects: number; inProjects: number };
/** The /projects pane: a few of each, "Show more" for the rest. */
export const PANE_LIMITS: FindLimits = { best: 5, workspace: 6, projects: 4, inProjects: 6 };
/** ⌘K: one screen, arrow keys walk it in this order. */
export const PALETTE_LIMITS: FindLimits = { best: 5, workspace: 5, projects: 3, inProjects: 6 };

export const FIND_GROUP_ORDER = ['best', 'workspace', 'projects', 'inProjects'] as const;
export type FindGroupKey = (typeof FIND_GROUP_ORDER)[number];

/** The rows on screen, top to bottom, for keyboard selection. */
export function visibleFindItems(groups: FindGroups, limits: FindLimits): FindItem[] {
	return FIND_GROUP_ORDER.flatMap((key) => groups[key].slice(0, limits[key]));
}

export function findItemKey(item: Pick<FindItem, 'kind' | 'id'>): string {
	return `${item.kind}:${item.id}`;
}
