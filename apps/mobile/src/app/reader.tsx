// apps/mobile/src/app/reader.tsx
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { DocReader } from '@/components/reader/doc-reader';
import type { ReaderHandle } from '@/components/reader/reader-handle';
import { TaskReader } from '@/components/reader/task-reader';
import { AppText } from '@/components/text';
import { getReaderWalk, type ReaderItem, walkPosition } from '@/lib/reader-walk';
import { useTheme } from '@/providers/theme-provider';

/**
 * The one reader for tasks and docs, opened as a sheet from Today or a project. Prev and Next
 * walk the list it was opened from, swapping the item in place. Done, Prev and Next first save
 * whatever is still being typed; while something is unsaved the sheet cannot be swiped away.
 */
export default function ReaderScreen() {
	const colors = useTheme();
	const params = useLocalSearchParams<{ kind?: string; id?: string }>();
	const kind: ReaderItem['kind'] = params.kind === 'document' ? 'document' : 'task';
	const id = typeof params.id === 'string' ? params.id : '';
	const walk = getReaderWalk();
	const position = id ? walkPosition(walk, { kind, id }) : null;

	const reader = useRef<ReaderHandle>(null);
	const [dirty, setDirty] = useState(false);
	const [leaving, setLeaving] = useState(false);
	const onDirtyChange = useCallback((next: boolean) => setDirty(next), []);

	/** Saves what is open, then moves on; stays (showing the error) when a save fails. */
	const leave = async (then: () => void) => {
		if (leaving) return;
		setLeaving(true);
		try {
			const ok = (await reader.current?.flush()) ?? true;
			if (ok) then();
		} finally {
			setLeaving(false);
		}
	};

	const go = (item: ReaderItem | null | undefined) => {
		if (!item) return;
		void leave(() => {
			void Haptics.selectionAsync().catch(() => {});
			router.setParams({ kind: item.kind, id: item.id });
		});
	};

	const title = position
		? `${walk?.label ? `${walk.label} · ` : ''}${position.index + 1} of ${position.total}`
		: kind === 'task'
			? 'Task'
			: 'Doc';

	return (
		<>
			<Stack.Screen
				options={{
					title,
					gestureEnabled: !dirty,
					headerRight: () => (
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={dirty ? 'Save and close' : 'Close'}
							hitSlop={8}
							disabled={leaving}
							onPress={() => void leave(() => router.back())}
						>
							{leaving ? (
								<ActivityIndicator color={colors.accent} />
							) : (
								<AppText variant="heading" style={{ color: colors.accent }}>
									Done
								</AppText>
							)}
						</Pressable>
					)
				}}
			/>
			{kind === 'task' ? (
				<TaskReader
					ref={reader}
					taskId={id}
					position={position}
					onPrev={() => go(position?.prev)}
					onNext={() => go(position?.next)}
					onDirtyChange={onDirtyChange}
				/>
			) : (
				<DocReader
					ref={reader}
					documentId={id}
					position={position}
					onPrev={() => go(position?.prev)}
					onNext={() => go(position?.next)}
					onDirtyChange={onDirtyChange}
				/>
			)}
		</>
	);
}
