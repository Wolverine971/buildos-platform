// apps/web/src/lib/components/workspace/workspace-model.ts
//
// The Workspace home (docs/specs/WORKSPACE_ARCHITECTURE_2026-10-23.md): one private
// holding ground per person for loose notes, docs and tasks, beside their projects.
// Pure shapes and helpers, shared by the server loader and the page. No fetches.

/** What a loose card shows. Notes are docs with type_key document.note. */
export type LooseKind = 'note' | 'doc' | 'task';
export type LooseEntity = 'document' | 'task';

export type LooseItem = {
	id: string;
	entity: LooseEntity;
	kind: LooseKind;
	title: string;
	/** A few lines of the body (notes, docs) or description (tasks), whitespace folded. */
	excerpt: string | null;
	created_at: string;
	updated_at: string;
	/** Tasks. */
	state_key?: string;
	due_at?: string | null;
	start_at?: string | null;
	/** Docs: how many docs sit inside it (a doc with children works as a folder). */
	children?: number;
};

export type SuggestionKind = 'file' | 'graduate' | 'fold';

export type WorkspaceSuggestion = {
	id: string;
	kind: SuggestionKind;
	reason: string;
	confidence: number | null;
	/** graduate: the name the agent proposes for the new project. */
	proposed_name: string | null;
	/** file: where the items would go. fold: the project that reads like loose notes. */
	target_project_id: string | null;
	items: { entity: LooseEntity; id: string }[];
	created_at: string;
};

export type WorkspaceHome = {
	workspaceId: string;
	items: LooseItem[];
	suggestions: WorkspaceSuggestion[];
	/** Open loose tasks beyond what the shelf loaded, for the label. */
	totals: { notes: number; docs: number; tasks: number };
};

/** What sorting a fresh capture did (POST /api/workspace/capture/sort). The receipt is
 * opaque to the page: it goes back as-is to undo. */
export type CaptureSortResult = {
	outcome: 'kept' | 'moved' | 'sorted' | 'partial' | 'skipped';
	lines: string[];
	/** New loose items now in the Workspace. */
	added: LooseItem[];
	/** Loose items that left the Workspace (the original note). */
	removed_ids: string[];
	receipt: unknown | null;
};

export type CaptureUndoResult = { restored: LooseItem | null; removed_ids: string[] };

export const NOTE_TYPE_KEY = 'document.note';
export const NOTE_TITLE_MAX = 80;
export const CAPTURE_TEXT_MAX = 20_000;
const EXCERPT_MAX = 220;

/** A note's title is its first line, like Apple Notes: trimmed, markdown heading marks
 * dropped, cut at a word near NOTE_TITLE_MAX. */
export function noteTitleFromText(text: string): string {
	const firstLine =
		text
			.split('\n')
			.map((line) => line.replace(/^#{1,6}\s+/, '').trim())
			.find((line) => line.length > 0) ?? '';
	if (!firstLine) return 'Untitled note';
	if (firstLine.length <= NOTE_TITLE_MAX) return firstLine;
	const cut = firstLine.slice(0, NOTE_TITLE_MAX);
	const lastSpace = cut.lastIndexOf(' ');
	return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** The body under the title line, for a card: whitespace folded, clipped. */
export function excerptOf(text: string | null | undefined, title?: string): string | null {
	if (!text) return null;
	let body = text.trim();
	if (title) {
		const lines = body.split('\n');
		const first = lines[0]?.replace(/^#{1,6}\s+/, '').trim();
		if (first && (first === title || title.startsWith(first.slice(0, 40))))
			body = lines.slice(1).join('\n');
	}
	const folded = body
		.replace(/[#>*_`~]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!folded) return null;
	return folded.length > EXCERPT_MAX ? `${folded.slice(0, EXCERPT_MAX).trimEnd()}…` : folded;
}

export function itemRef(item: Pick<LooseItem, 'entity' | 'id'>): string {
	return `${item.entity}:${item.id}`;
}

/** The suggestion's items still loose in the Workspace, in its order. */
export function liveSuggestionItems(
	suggestion: WorkspaceSuggestion,
	byRef: ReadonlyMap<string, LooseItem>
): LooseItem[] {
	return suggestion.items
		.map((ref) => byRef.get(`${ref.entity}:${ref.id}`))
		.filter((item): item is LooseItem => Boolean(item));
}

/** A suggestion still worth showing: a new project needs two items, filing needs one.
 * Folds don't depend on loose items. */
export function isLiveSuggestion(
	suggestion: WorkspaceSuggestion,
	byRef: ReadonlyMap<string, LooseItem>
): boolean {
	if (suggestion.kind === 'fold') return Boolean(suggestion.target_project_id);
	const live = liveSuggestionItems(suggestion, byRef).length;
	return suggestion.kind === 'graduate' ? live >= 2 : live >= 1;
}

/** Filing chips per item: the open "file" suggestion that names it. */
export function filingByItem(
	suggestions: readonly WorkspaceSuggestion[]
): Map<string, WorkspaceSuggestion> {
	const byItem = new Map<string, WorkspaceSuggestion>();
	for (const suggestion of suggestions) {
		if (suggestion.kind !== 'file') continue;
		for (const ref of suggestion.items) {
			const key = `${ref.entity}:${ref.id}`;
			if (!byItem.has(key)) byItem.set(key, suggestion);
		}
	}
	return byItem;
}

export type LooseFilter = 'all' | 'notes' | 'tasks' | 'docs';

export function matchesLooseFilter(item: LooseItem, filter: LooseFilter): boolean {
	if (filter === 'all') return true;
	if (filter === 'notes') return item.kind === 'note';
	if (filter === 'tasks') return item.kind === 'task';
	return item.kind === 'doc';
}
