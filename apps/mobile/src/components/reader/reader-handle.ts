// apps/mobile/src/components/reader/reader-handle.ts
import type { Ref } from 'react';

import type { WalkPosition } from '@/lib/reader-walk';

/** What the reader screen asks of a task or doc reader before it moves on or closes. */
export type ReaderHandle = {
	/**
	 * Saves anything still being typed (a title, a description, a doc body). Resolves to false
	 * when a save failed or needs the person's attention, so the reader stays put.
	 */
	flush: () => Promise<boolean>;
};

/** Which way the reader is leaving while it saves first. */
export type LeaveTarget = 'prev' | 'next' | 'close';

/** What the reader route hands a task or doc reader. */
export type ReaderChromeProps = {
	ref?: Ref<ReaderHandle>;
	/** Where this item sits in the list it was opened from; null outside a walk. */
	position: WalkPosition | null;
	/** "BuildOS · 9 of 11", or null outside a walk. */
	walkLabel: string | null;
	/** The move that is saving before it happens, if any. */
	leaving: LeaveTarget | null;
	onPrev: () => void;
	onNext: () => void;
	/** Saves what is open, then closes the sheet. */
	onClose: () => void;
	onDirtyChange: (dirty: boolean) => void;
	/** True while a body editor is open; the sheet then pins itself to full height. */
	onEditingChange: (editing: boolean) => void;
};
