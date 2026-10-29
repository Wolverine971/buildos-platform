// apps/mobile/src/components/reader/reader-head.tsx
import { type ReactNode, useCallback, useRef, useState } from 'react';
import {
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	StyleSheet,
	Text,
	TextInput,
	View
} from 'react-native';

import { type Icon, Key, Stamp, X } from '@/components/kit';
import { useInk } from '@/providers/theme-provider';
import { colorMix, typeScale } from '@/theme';

export type HeadTitle = {
	value: string;
	onChange: (value: string) => void;
	/** Saves the title when editing ends (blur or Return). */
	onCommit: () => void;
	accessibilityLabel: string;
	placeholder?: string;
	/** Struck through, for a done task. */
	struck?: boolean;
};

export type ReaderHeadProps = {
	glyph: Icon;
	/** Glyph color; muted by default. */
	glyphColor?: string;
	/** The editable title, or null while the item loads. */
	title: HeadTitle | null;
	/** The state pill (task) or the "Edited Oct 28" stamp (doc). */
	badge?: ReactNode;
	/** "BuildOS · 9 of 11". */
	meta?: string | null;
	onClose: () => void;
	/** Shows the bolt in the close key while what is open saves. */
	closing?: boolean;
	/** "Close", or "Save and close" while something is unsaved. */
	closeLabel?: string;
	/** A hairline under the head once the body scrolls beneath it. */
	edge?: boolean;
};

/**
 * The top of the reader sheet: a 30pt glyph tile, the title (edit in place), a state pill or
 * edited stamp with the walk position in mono, and a close key that saves first.
 */
export function ReaderHead({
	glyph: Glyph,
	glyphColor,
	title,
	badge,
	meta,
	onClose,
	closing = false,
	closeLabel = 'Close',
	edge = false
}: ReaderHeadProps) {
	const { colors } = useInk();
	return (
		<View
			style={[styles.head, { borderBottomColor: edge ? colors.border : 'transparent' }]}
		>
			<View
				style={[styles.glyph, { backgroundColor: colors.muted }]}
				accessibilityElementsHidden
				importantForAccessibility="no-hide-descendants"
			>
				<Glyph size={16} color={glyphColor ?? colors.mutedForeground} strokeWidth={2} />
			</View>

			<View style={styles.main}>
				{title ? (
					<TextInput
						accessibilityLabel={title.accessibilityLabel}
						value={title.value}
						onChangeText={title.onChange}
						onEndEditing={title.onCommit}
						placeholder={title.placeholder}
						placeholderTextColor={colors.mutedForeground}
						selectionColor={colors.accent}
						multiline
						scrollEnabled={false}
						submitBehavior="blurAndSubmit"
						returnKeyType="done"
						maxFontSizeMultiplier={1.4}
						style={[
							typeScale.sheetTitle,
							styles.title,
							{
								color: colors.foreground,
								textDecorationLine: title.struck ? 'line-through' : 'none'
							}
						]}
					/>
				) : (
					<View style={[styles.titleBlank, { backgroundColor: colors.muted }]} />
				)}
				{badge || meta ? (
					<View style={styles.meta}>
						{badge}
						{meta ? (
							<Stamp size={11.5} numberOfLines={1} style={styles.metaText}>
								{meta}
							</Stamp>
						) : null}
					</View>
				) : null}
			</View>

			<Key
				icon={X}
				accessibilityLabel={closeLabel}
				size="sm"
				variant="outline"
				radius={10}
				loading={closing}
				onPress={onClose}
			/>
		</View>
	);
}

/**
 * The head's state pill: uppercase 10.5 bold on the muted tone, colored like the website's.
 * The color is pulled 30% toward the foreground: raw success and destructive read at under
 * 4.5:1 on muted.
 */
export function StatePill({ label, color }: { label: string; color: string }) {
	const { colors } = useInk();
	return (
		<View style={[styles.pill, { backgroundColor: colors.muted }]}>
			<Text
				maxFontSizeMultiplier={1.3}
				style={[styles.pillText, { color: colorMix(color, colors.foreground, 0.7) }]}
			>
				{label}
			</Text>
		</View>
	);
}

/** Whether a scroll view has left its top, for the head's hairline. `reset` on a new item. */
export function useScrolledPastTop() {
	const [scrolled, setScrolled] = useState(false);
	const last = useRef(false);
	const set = useCallback((next: boolean) => {
		if (next === last.current) return;
		last.current = next;
		setScrolled(next);
	}, []);
	const onScroll = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) =>
			set(event.nativeEvent.contentOffset.y > 2),
		[set]
	);
	const reset = useCallback(() => set(false), [set]);
	return { scrolled, onScroll, reset };
}

const styles = StyleSheet.create({
	head: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 10,
		// Room for the system grabber above.
		paddingTop: 20,
		paddingHorizontal: 14,
		paddingBottom: 12,
		borderBottomWidth: StyleSheet.hairlineWidth
	},
	glyph: {
		width: 30,
		height: 30,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center'
	},
	// Centers the title's first line on the 30pt glyph tile.
	main: { flex: 1, minWidth: 0, paddingTop: 4 },
	title: { padding: 0, paddingTop: 0, paddingBottom: 0, margin: 0 },
	titleBlank: { height: 14, width: '62%', borderRadius: 4, marginTop: 3.5, opacity: 0.7 },
	meta: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		alignItems: 'center',
		columnGap: 7,
		rowGap: 4,
		marginTop: 6
	},
	metaText: { flexShrink: 1 },
	pill: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
	pillText: {
		fontSize: 10.5,
		lineHeight: 14,
		fontWeight: '700',
		letterSpacing: 0.6,
		textTransform: 'uppercase'
	}
});
