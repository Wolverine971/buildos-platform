// apps/mobile/src/components/reader/fact-tag.tsx
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChevronDown, ChevronUp, type Icon } from '@/components/kit';
import { useInk } from '@/providers/theme-provider';
import { typeScale, withAlpha } from '@/theme';

export type FactTone = 'muted' | 'danger';

/**
 * A bordered mono tag in the reader's fact row: "Priority 2", "Updated Oct 28". With `onPress`
 * it becomes a control with a disclosure chevron (the due date opens its menu).
 */
export function FactTag({
	label,
	icon: Glyph,
	tone = 'muted',
	onPress,
	open = false,
	accessibilityLabel,
	accessibilityHint
}: {
	label: string;
	icon?: Icon;
	tone?: FactTone;
	onPress?: () => void;
	/** Flips the chevron up while what it opened is showing. */
	open?: boolean;
	accessibilityLabel?: string;
	accessibilityHint?: string;
}) {
	const { colors } = useInk();
	const color = tone === 'danger' ? colors.destructive : colors.mutedForeground;
	const borderColor = tone === 'danger' ? withAlpha(colors.destructive, 0.5) : colors.border;
	const Chevron = open ? ChevronUp : ChevronDown;

	const content = (
		<>
			{Glyph ? <Glyph size={13} color={color} strokeWidth={2} /> : null}
			<Text
				numberOfLines={1}
				maxFontSizeMultiplier={1.3}
				style={[typeScale.stamp, styles.text, { color }]}
			>
				{label}
			</Text>
			{onPress ? <Chevron size={13} color={color} strokeWidth={2} /> : null}
		</>
	);

	if (!onPress) {
		return (
			<View
				accessible
				accessibilityLabel={accessibilityLabel ?? label}
				style={[styles.tag, { borderColor }]}
			>
				{content}
			</View>
		);
	}

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel ?? label}
			accessibilityHint={accessibilityHint}
			accessibilityState={{ expanded: open }}
			hitSlop={{ top: 7, bottom: 7, left: 2, right: 2 }}
			onPress={onPress}
			style={({ pressed }) => [
				styles.tag,
				{ borderColor, backgroundColor: pressed ? colors.muted : 'transparent' }
			]}
		>
			{content}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	tag: {
		minHeight: 30,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 5,
		paddingHorizontal: 9,
		borderRadius: 7,
		borderWidth: 1,
		maxWidth: '100%'
	},
	text: { fontWeight: '500', flexShrink: 1 }
});
