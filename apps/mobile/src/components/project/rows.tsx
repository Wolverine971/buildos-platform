// apps/mobile/src/components/project/rows.tsx
// The rows of the project's lists, after the website's ReaderTaskList: a small glyph square,
// a one-line title and an optional mono chip on the right. Plain rows, no cards.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { Circle, CircleCheck, CircleDot, CircleSlash, type Icon } from '@/components/kit';
import { useInk } from '@/providers/theme-provider';
import { fontFamily, type ThemeColors, typeScale, withAlpha } from '@/theme';

import type { GlyphShape, GlyphTone } from './format';

export const GLYPH_SIZE = 28;

const SHAPES: Record<GlyphShape, Icon> = {
	circle: Circle,
	dot: CircleDot,
	check: CircleCheck,
	slash: CircleSlash
};

export function toneColor(colors: ThemeColors, tone: GlyphTone): string {
	return tone === 'muted' ? colors.mutedForeground : colors[tone];
}

/** The 28pt glyph square: muted fill, radius 8, a 15pt icon. */
export function Glyph({
	icon,
	shape,
	tone = 'muted',
	color,
	background
}: {
	icon?: Icon;
	shape?: GlyphShape;
	tone?: GlyphTone;
	/** Overrides the tone's color. */
	color?: string;
	background?: string;
}) {
	const { colors } = useInk();
	const IconGlyph = icon ?? SHAPES[shape ?? 'circle'];
	return (
		<View style={[styles.glyph, { backgroundColor: background ?? colors.muted }]}>
			<IconGlyph size={15} strokeWidth={2} color={color ?? toneColor(colors, tone)} />
		</View>
	);
}

/** Mono date chip: red tint when overdue, blue when scheduled, plain otherwise. */
export function DateChip({
	label,
	tone
}: {
	label: string;
	tone: 'destructive' | 'info' | 'muted';
}) {
	const { colors } = useInk();
	const ink = tone === 'muted' ? null : colors[tone];
	return (
		<View
			style={[
				styles.chip,
				ink
					? { borderColor: withAlpha(ink, 0.45), backgroundColor: withAlpha(ink, 0.1) }
					: { borderColor: colors.border }
			]}
		>
			<Text
				numberOfLines={1}
				maxFontSizeMultiplier={1.3}
				style={[styles.chipText, { color: ink ?? colors.mutedForeground }]}
			>
				{label}
			</Text>
		</View>
	);
}

export type ListRowProps = {
	glyph: ReactNode;
	title: string;
	titleStyle?: StyleProp<TextStyle>;
	/** A second line under the title (doc rows). */
	meta?: ReactNode;
	/** Right side, e.g. a DateChip. */
	trailing?: ReactNode;
	/** Left indent in points (doc tree depth). */
	indent?: number;
	onPress: () => void;
	accessibilityLabel: string;
	accessibilityHint?: string;
};

/** One tappable row: glyph, title (single line), optional meta line and trailing chip. */
export function ListRow({
	glyph,
	title,
	titleStyle,
	meta,
	trailing,
	indent = 0,
	onPress,
	accessibilityLabel,
	accessibilityHint
}: ListRowProps) {
	const { colors } = useInk();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			accessibilityHint={accessibilityHint}
			onPress={onPress}
			style={({ pressed }) => [
				styles.row,
				{
					marginLeft: indent - ROW_BLEED,
					backgroundColor: pressed ? withAlpha(colors.muted, 0.85) : 'transparent'
				}
			]}
		>
			{glyph}
			<View style={styles.text}>
				<Text
					numberOfLines={1}
					maxFontSizeMultiplier={1.4}
					style={[typeScale.row, styles.title, { color: colors.foreground }, titleStyle]}
				>
					{title}
				</Text>
				{meta}
			</View>
			{trailing}
		</Pressable>
	);
}

// Rows reach 6pt past the content edge so the glyph lines up with the headings above.
const ROW_BLEED = 6;

const styles = StyleSheet.create({
	glyph: {
		width: GLYPH_SIZE,
		height: GLYPH_SIZE,
		borderRadius: 8,
		borderCurve: 'continuous',
		alignItems: 'center',
		justifyContent: 'center'
	},
	chip: {
		borderWidth: 1,
		borderRadius: 6,
		paddingHorizontal: 6,
		paddingVertical: 2,
		flexShrink: 0
	},
	chipText: {
		fontFamily: fontFamily.mono,
		fontSize: 11.5,
		lineHeight: 15,
		fontVariant: ['tabular-nums']
	},
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		minHeight: 46,
		paddingVertical: 4,
		paddingHorizontal: ROW_BLEED,
		marginRight: -ROW_BLEED,
		borderRadius: 9,
		borderCurve: 'continuous'
	},
	text: { flex: 1, minWidth: 0, gap: 2 },
	title: { fontWeight: '400' }
});
