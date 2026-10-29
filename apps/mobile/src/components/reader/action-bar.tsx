// apps/mobile/src/components/reader/action-bar.tsx
import { type ComponentRef, type ReactNode, type Ref, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft, ChevronRight, Key, type KeyProps } from '@/components/kit';
import { useKeyboardOverlap } from '@/hooks/use-keyboard-inset';
import type { WalkPosition } from '@/lib/reader-walk';
import { useInk } from '@/providers/theme-provider';

import type { LeaveTarget } from './reader-handle';

export type ActionBarProps = {
	/** "task" or "doc", for VoiceOver ("Previous task"). */
	word: string;
	position: WalkPosition | null;
	/** The move saving first, if any: its key shows the bolt, the others wait. */
	leaving: LeaveTarget | null;
	onPrev: () => void;
	onNext: () => void;
	/** The two middle cells, as BarKeys. */
	children: ReactNode;
	/** Ride on top of the keyboard (the doc editor's Cancel and Save live here). */
	liftWithKeyboard?: boolean;
};

/**
 * The reader's bottom bar, as on the website's phone sheet: ‹ | two actions | ›, on the sheet
 * color with a hairline above and room for the home indicator.
 */
export function ActionBar({
	word,
	position,
	leaving,
	onPrev,
	onNext,
	children,
	liftWithKeyboard = false
}: ActionBarProps) {
	const cells = (
		<>
			<Key
				stacked
				variant="ghost"
				icon={ChevronLeft}
				accessibilityLabel={`Previous ${word}`}
				disabled={!position?.prev || (leaving !== null && leaving !== 'prev')}
				loading={leaving === 'prev'}
				haptic="selection"
				onPress={onPrev}
				style={styles.side}
			/>
			{children}
			<Key
				stacked
				variant="ghost"
				icon={ChevronRight}
				accessibilityLabel={`Next ${word}`}
				disabled={!position?.next || (leaving !== null && leaving !== 'next')}
				loading={leaving === 'next'}
				haptic="selection"
				onPress={onNext}
				style={styles.side}
			/>
		</>
	);
	return liftWithKeyboard ? <LiftedBar>{cells}</LiftedBar> : <BarFrame lift={0}>{cells}</BarFrame>;
}

/** A middle cell: a 20pt icon over an 11.5 label, filling its half of the bar. */
export function BarKey(props: KeyProps) {
	return <Key {...props} stacked style={[styles.middle, props.style]} />;
}

type ViewRef = ComponentRef<typeof View>;

function BarFrame({
	lift,
	frameRef,
	children
}: {
	/** How far the keyboard covers the bar; the bar rises by that much. */
	lift: number;
	frameRef?: Ref<ViewRef>;
	children: ReactNode;
}) {
	const { colors } = useInk();
	const insets = useSafeAreaInsets();
	return (
		<View
			ref={frameRef}
			style={[
				styles.bar,
				{
					borderTopColor: colors.border,
					backgroundColor: colors.background,
					// On the keyboard there is no home indicator to clear.
					paddingBottom: lift > 0 ? 6 : Math.max(insets.bottom, 8),
					marginBottom: lift
				}
			]}
		>
			{children}
		</View>
	);
}

/**
 * Mounted only while lifting, so the keyboard measurement starts fresh each time. The editor
 * holds the sheet at full height, so the bar rests on the screen's bottom edge; measuring it
 * would be sheet-relative inside the native form sheet and leave it under the keyboard.
 */
function LiftedBar({ children }: { children: ReactNode }) {
	const ref = useRef<ViewRef>(null);
	const overlap = useKeyboardOverlap(ref, { restsOnScreenBottom: true });
	return (
		<BarFrame lift={overlap} frameRef={ref}>
			{children}
		</BarFrame>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: 'row',
		alignItems: 'stretch',
		gap: 6,
		paddingTop: 6,
		paddingHorizontal: 10,
		borderTopWidth: 1
	},
	side: { width: 52 },
	middle: { flex: 1, minWidth: 0 }
});
