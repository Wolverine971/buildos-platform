// apps/web/src/lib/components/knowledge/knowledge-sort.ts
// The knowledge list's sort: one state the column headers and the Sort menu share. The server
// orders the paged list (knowledge_list); sortKnowledgeRows orders a list the browser already
// holds whole ("Everything in <project>") the same way.

import {
	knowledgeSortDefaultDir,
	type KnowledgeListSort,
	type KnowledgeSortDir
} from '@buildos/shared-agent-ops/knowledge';
import type { KnowledgeWhere } from './where-types';

export interface KnowledgeSortState {
	key: KnowledgeListSort;
	dir: KnowledgeSortDir;
}

/** The table's columns, left to right, each sortable from its header. */
export const KNOWLEDGE_SORT_COLUMNS = [
	{ key: 'name', label: 'Name' },
	{ key: 'projects', label: 'Projects' },
	{ key: 'tasks', label: 'Tasks' },
	{ key: 'documents', label: 'Docs' }
] as const satisfies ReadonlyArray<{ key: KnowledgeListSort; label: string }>;

/** The Sort menu's order (phones have no column headers, so every sort is here too). */
export const KNOWLEDGE_SORT_MENU: readonly KnowledgeListSort[] = [
	'recent',
	'connected',
	'name',
	'researched',
	'projects',
	'tasks',
	'documents'
];

/** A header press: a new column starts in its usual direction; the same column flips. */
export function nextKnowledgeSort(
	current: KnowledgeSortState,
	key: KnowledgeListSort
): KnowledgeSortState {
	if (current.key !== key) return { key, dir: knowledgeSortDefaultDir(key) };
	return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
}

const LABELS: Record<KnowledgeListSort, Record<KnowledgeSortDir, string>> = {
	recent: { desc: 'Recently updated', asc: 'Least recently updated' },
	connected: { desc: 'Most recently connected', asc: 'Earliest connected' },
	name: { asc: 'Name A–Z', desc: 'Name Z–A' },
	researched: { desc: 'Recently researched', asc: 'Researched longest ago' },
	projects: { desc: 'Most projects', asc: 'Fewest projects' },
	tasks: { desc: 'Most tasks', asc: 'Fewest tasks' },
	documents: { desc: 'Most docs', asc: 'Fewest docs' }
};

/** "Most tasks", "Name Z–A": the sort in words, for the menu and screen readers. */
export function knowledgeSortLabel(
	key: KnowledgeListSort,
	dir: KnowledgeSortDir = knowledgeSortDefaultDir(key)
): string {
	return LABELS[key][dir];
}

interface SortableRow {
	id: string;
	name: string;
	updated_at: string;
	researched_at?: string | null;
}

const byName = (a: SortableRow, b: SortableRow) =>
	a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/**
 * Order rows the browser already has, matching knowledge_list: the chosen column in the chosen
 * direction; same count → A–Z; never researched → last either way; then newest first.
 * "Connected" needs dates this list doesn't carry, so it falls back to names A–Z.
 */
export function sortKnowledgeRows<T extends SortableRow>(
	rows: readonly T[],
	sort: KnowledgeSortState,
	where: ReadonlyMap<string, KnowledgeWhere>
): T[] {
	const flip = sort.dir === 'asc' ? 1 : -1;
	const count = (row: T) =>
		sort.key === 'projects' || sort.key === 'tasks' || sort.key === 'documents'
			? (where.get(row.id)?.[sort.key].length ?? 0)
			: 0;
	const newestFirst = (a: T, b: T) =>
		b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id);

	const compare = (a: T, b: T): number => {
		switch (sort.key) {
			case 'name':
				return flip * byName(a, b) || newestFirst(a, b);
			case 'projects':
			case 'tasks':
			case 'documents':
				return flip * (count(a) - count(b)) || byName(a, b) || newestFirst(a, b);
			case 'researched': {
				const [ra, rb] = [a.researched_at ?? null, b.researched_at ?? null];
				if (ra === null || rb === null)
					return Number(ra === null) - Number(rb === null) || newestFirst(a, b);
				return flip * ra.localeCompare(rb) || newestFirst(a, b);
			}
			case 'recent':
				return flip * a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id);
			case 'connected':
				return byName(a, b) || newestFirst(a, b);
		}
	};
	return [...rows].sort(compare);
}
