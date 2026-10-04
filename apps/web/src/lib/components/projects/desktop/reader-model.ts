// apps/web/src/lib/components/projects/desktop/reader-model.ts
//
// Pure rules for the card's reader. Three depths everywhere: Peek (beside the
// list, or a sheet over it on phones), Focus (the whole card, or a full-height
// sheet) and Page (the item's own route). Chat opens beside the reader and
// takes the list's place unless the list is asked back.
export type ReaderKind = 'document' | 'task' | 'goal';
export type ReaderItem = { kind: ReaderKind; id: string };
export type ReaderLayout = 'peek' | 'focus';
export type ChatScope = 'item' | 'project';
export type SheetDetent = 'peek' | 'full';

/** The card body's columns, left to right. */
export type PaneMode =
	| 'list' // list only
	| 'peek' // list | reader
	| 'focus' // reader
	| 'reader-chat' // reader | chat
	| 'all' // list | reader | chat
	| 'list-chat'; // list | chat (chat about the project, nothing open)

export function paneMode(state: {
	reading: boolean;
	layout: ReaderLayout;
	chat: boolean;
	listWithChat: boolean;
}): PaneMode {
	if (state.chat) {
		if (!state.reading) return 'list-chat';
		return state.listWithChat ? 'all' : 'reader-chat';
	}
	return state.reading ? state.layout : 'list';
}

export function showsList(mode: PaneMode): boolean {
	return mode === 'list' || mode === 'peek' || mode === 'all' || mode === 'list-chat';
}

/** Where Prev/Next go within the item's own list. */
export function neighbors(
	ids: readonly string[],
	id: string
): { index: number; total: number; prev: string | null; next: string | null } {
	const index = ids.indexOf(id);
	return {
		index,
		total: ids.length,
		prev: index > 0 ? ids[index - 1]! : null,
		next: index >= 0 && index < ids.length - 1 ? ids[index + 1]! : null
	};
}

const DRAG_OPEN_PX = 48;
const DRAG_CLOSE_PX = 64;
const DRAG_DISMISS_FROM_FULL_PX = 320;

/**
 * Where the phone sheet lands after a drag on its handle. A tap toggles Peek
 * and Full; up opens to Full; down steps back one depth (Full → Peek), or
 * closes from Peek or after a long pull from Full.
 */
export function sheetAfterDrag(
	detent: SheetDetent,
	dy: number,
	moved: boolean
): SheetDetent | 'closed' {
	if (!moved) return detent === 'full' ? 'peek' : 'full';
	if (dy <= -DRAG_OPEN_PX) return 'full';
	if (dy >= DRAG_CLOSE_PX) {
		return detent === 'full' && dy < DRAG_DISMISS_FROM_FULL_PX ? 'peek' : 'closed';
	}
	return detent;
}

const LAYOUT_KEY = 'projects-reader-layout';

/** Peek or Focus, remembered per browser. */
export function loadReaderLayout(): ReaderLayout {
	try {
		return localStorage.getItem(LAYOUT_KEY) === 'focus' ? 'focus' : 'peek';
	} catch {
		return 'peek';
	}
}

export function saveReaderLayout(layout: ReaderLayout): void {
	try {
		localStorage.setItem(LAYOUT_KEY, layout);
	} catch {
		// Storage can be off (private mode); the choice holds for this visit.
	}
}

export const TASK_STATES = [
	{ key: 'todo', label: 'To do' },
	{ key: 'in_progress', label: 'In progress' },
	{ key: 'blocked', label: 'Blocked' },
	{ key: 'done', label: 'Done' }
] as const;

export const KIND_WORD: Record<ReaderKind, string> = {
	document: 'doc',
	task: 'task',
	goal: 'goal'
};
