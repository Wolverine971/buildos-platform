// apps/mobile/src/components/inbox/parts.tsx
// Small pieces the inbox cards share: the card frame, a block head ("TIDY-UPS (4) · Safe filing
// and archiving…"), a note line (why something came back), and a text link key.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import {
	AlertTriangle,
	hitSlopFor,
	type Icon,
	MessageCircle,
	MicroLabel,
	playHaptic,
	Stamp
} from '@/components/kit';
import type { InboxNote } from '@/lib/inbox/inbox-store';
import { useInk } from '@/providers/theme-provider';
import { typeScale, withAlpha } from '@/theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
	const ink = useInk();
	return (
		<View
			style={[
				styles.card,
				{
					backgroundColor: ink.colors.card,
					borderColor: ink.colors.border,
					boxShadow: ink.shadows.ink
				},
				style
			]}
		>
			{children}
		</View>
	);
}

export function BlockHead({ label, count, hint }: { label: string; count: number; hint?: string }) {
	const { colors } = useInk();
	return (
		<View
			accessible
			accessibilityRole="header"
			accessibilityLabel={`${label}, ${count}`}
			style={styles.blockHead}
		>
			<View style={styles.blockTitle}>
				<MicroLabel>{label}</MicroLabel>
				<Stamp>{count}</Stamp>
			</View>
			{hint ? (
				<Text
					maxFontSizeMultiplier={1.4}
					style={[typeScale.small, { color: colors.mutedForeground }]}
				>
					{hint}
				</Text>
			) : null}
		</View>
	);
}

export function NoteLine({ note }: { note: InboxNote | null | undefined }) {
	const { colors } = useInk();
	if (!note) return null;
	const warn = note.tone === 'warn';
	const color = warn ? colors.warning : colors.accent;
	const Glyph = warn ? AlertTriangle : MessageCircle;
	return (
		<View
			accessibilityRole="alert"
			style={[
				styles.note,
				{ borderColor: withAlpha(color, 0.4), backgroundColor: withAlpha(color, 0.1) }
			]}
		>
			<Glyph size={13} strokeWidth={2.25} color={color} style={styles.noteIcon} />
			<Text style={[typeScale.small, styles.flex, { color: colors.foreground }]}>
				{note.text}
			</Text>
		</View>
	);
}

/** A quiet text key ("Talk it through", "Snooze"), 44pt tall for the thumb. */
export function TextKey({
	label,
	icon: Glyph,
	onPress,
	disabled = false,
	accessibilityLabel,
	tone = 'accent'
}: {
	label: string;
	icon?: Icon;
	onPress: () => void;
	disabled?: boolean;
	accessibilityLabel?: string;
	tone?: 'accent' | 'muted';
}) {
	const { colors } = useInk();
	const color = tone === 'accent' ? colors.accent : colors.mutedForeground;
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel ?? label}
			accessibilityState={{ disabled }}
			disabled={disabled}
			hitSlop={hitSlopFor(44, 32)}
			onPress={() => {
				playHaptic('light');
				onPress();
			}}
			style={({ pressed }) => [
				styles.textKey,
				{ opacity: disabled ? 0.5 : pressed ? 0.6 : 1 }
			]}
		>
			{Glyph ? <Glyph size={14} strokeWidth={2.25} color={color} /> : null}
			<Text maxFontSizeMultiplier={1.4} style={[styles.textKeyLabel, { color }]}>
				{label}
			</Text>
		</Pressable>
	);
}

export const styles = StyleSheet.create({
	card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
	blockHead: { gap: 2, paddingTop: 4 },
	blockTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	note: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 6,
		borderWidth: 1,
		borderRadius: 8,
		paddingHorizontal: 8,
		paddingVertical: 6
	},
	noteIcon: { marginTop: 2 },
	flex: { flex: 1, minWidth: 0 },
	textKey: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32 },
	textKeyLabel: { fontSize: 13.5, fontWeight: '600' }
});
