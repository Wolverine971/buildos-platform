// apps/mobile/src/app/reader.tsx
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { DocReader } from '@/components/reader/doc-reader';
import type {
	LeaveTarget,
	ReaderChromeProps,
	ReaderHandle
} from '@/components/reader/reader-handle';
import { READER_DETENTS, READER_DETENTS_EDITING } from '@/components/reader/sheet';
import { TaskReader } from '@/components/reader/task-reader';
import { getReaderWalk, type ReaderItem, walkPosition } from '@/lib/reader-walk';

/**
 * The one reader for tasks and docs, an iOS sheet opened from Today or a project. Prev and Next
 * walk the list it was opened from, swapping the item in place. Close, Prev and Next first save
 * whatever is still being typed; while something is unsaved the sheet cannot be swiped away,
 * and while a description or doc body is being edited the sheet stays at full height.
 */
export default function ReaderScreen() {
	const params = useLocalSearchParams<{ kind?: string; id?: string }>();
	const kind: ReaderItem['kind'] = params.kind === 'document' ? 'document' : 'task';
	const id = typeof params.id === 'string' ? params.id : '';
	const walk = getReaderWalk();
	const position = id ? walkPosition(walk, { kind, id }) : null;
	const walkLabel = position
		? `${walk?.label ? `${walk.label} · ` : ''}${position.index + 1} of ${position.total}`
		: null;

	const reader = useRef<ReaderHandle>(null);
	const [dirty, setDirty] = useState(false);
	const [editing, setEditing] = useState(false);
	const [leaving, setLeaving] = useState<LeaveTarget | null>(null);
	// A ref, so two quick taps in one frame cannot both start leaving.
	const busy = useRef(false);
	const onDirtyChange = useCallback((next: boolean) => setDirty(next), []);
	const onEditingChange = useCallback((next: boolean) => setEditing(next), []);

	/** Saves what is open, then moves on; stays (showing the error) when a save fails. */
	const leave = async (target: LeaveTarget, then: () => void) => {
		if (busy.current) return;
		busy.current = true;
		setLeaving(target);
		try {
			const ok = (await reader.current?.flush()) ?? true;
			if (ok) then();
		} finally {
			busy.current = false;
			setLeaving(null);
		}
	};

	const step = (target: 'prev' | 'next') => {
		const item = target === 'prev' ? position?.prev : position?.next;
		if (!item) return;
		void leave(target, () => router.setParams({ kind: item.kind, id: item.id }));
	};

	const close = () => {
		void leave('close', () => {
			// Opened from a link with nothing underneath: land on Today.
			if (router.canGoBack()) router.back();
			else router.replace('/');
		});
	};

	const chrome: Omit<ReaderChromeProps, 'ref'> = {
		position,
		walkLabel,
		leaving,
		onPrev: () => step('prev'),
		onNext: () => step('next'),
		onClose: close,
		onDirtyChange,
		onEditingChange
	};

	return (
		<>
			<Stack.Screen
				options={{
					gestureEnabled: !dirty,
					sheetAllowedDetents: editing ? READER_DETENTS_EDITING : READER_DETENTS
				}}
			/>
			{kind === 'task' ? (
				<TaskReader ref={reader} taskId={id} {...chrome} />
			) : (
				<DocReader ref={reader} documentId={id} {...chrome} />
			)}
		</>
	);
}
