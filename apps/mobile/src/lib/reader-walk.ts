// apps/mobile/src/lib/reader-walk.ts
/**
 * The list a reader walks with Prev and Next: Today's tasks in the order Today shows them,
 * or a project's tasks or docs. The screen that opens the reader sets it; the reader only reads
 * it. In memory only: a reader opened any other way simply has no Prev/Next.
 */

export type ReaderKind = 'task' | 'document';
export type ReaderItem = { kind: ReaderKind; id: string };
export type ReaderWalk = { label: string; items: ReaderItem[] };

let current: ReaderWalk | null = null;

export function setReaderWalk(walk: ReaderWalk | null): void {
	current = walk && walk.items.length ? { label: walk.label, items: [...walk.items] } : null;
}

export function getReaderWalk(): ReaderWalk | null {
	return current;
}

export type WalkPosition = {
	index: number;
	total: number;
	prev: ReaderItem | null;
	next: ReaderItem | null;
};

export function walkPosition(walk: ReaderWalk | null, item: ReaderItem): WalkPosition | null {
	if (!walk) return null;
	const index = walk.items.findIndex((entry) => entry.kind === item.kind && entry.id === item.id);
	if (index < 0) return null;
	return {
		index,
		total: walk.items.length,
		prev: walk.items[index - 1] ?? null,
		next: walk.items[index + 1] ?? null
	};
}
