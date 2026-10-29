// apps/mobile/src/components/today/today-header.tsx
// The top of Today, as on the website: "Today" with the date, "N events · N tasks", and a chip
// row that scrolls sideways (Up next, overdue) over a hairline.
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AlertTriangle, Clock, PageTitle, playHaptic, Stamp } from '@/components/kit';
import { SCREEN_PADDING } from '@/components/screen';
import { useInk } from '@/providers/theme-provider';
import { colorMix, typeScale, withAlpha } from '@/theme';

export type UpNext = {
	title: string;
	/** "2:30 PM" */
	time: string;
	/** Opens the task when the entry is (or is linked to) one. */
	onPress?: () => void;
};

export type TodayHeaderProps = {
	/** "Thursday, October 29" */
	dateLabel: string;
	/** Hidden until the feed loads. `tasks` counts open ones. */
	counts: { events: number; tasks: number } | null;
	overdueCount: number;
	upNext: UpNext | null;
};

export function TodayHeader({ dateLabel, counts, overdueCount, upNext }: TodayHeaderProps) {
	const { colors } = useInk();
	const hasChips = Boolean(upNext) || overdueCount > 0;

	return (
		<View>
			<PageTitle title="Today" aside={dateLabel} />
			{counts ? (
				<Text
					maxFontSizeMultiplier={1.6}
					style={[typeScale.meta, styles.counts, { color: colors.mutedForeground }]}
				>
					<Text style={[styles.count, { color: colors.foreground }]}>{counts.events}</Text>
					{counts.events === 1 ? ' event' : ' events'}
					<Text style={{ color: withAlpha(colors.mutedForeground, 0.5) }}>{'  ·  '}</Text>
					<Text style={[styles.count, { color: colors.foreground }]}>{counts.tasks}</Text>
					{counts.tasks === 1 ? ' task' : ' tasks'}
				</Text>
			) : null}
			{hasChips ? (
				<ScrollView
					horizontal
					showsHorizontalScrollIndicator={false}
					keyboardShouldPersistTaps="handled"
					style={[styles.chipRow, { borderBottomColor: withAlpha(colors.border, 0.7) }]}
					contentContainerStyle={styles.chips}
				>
					{upNext ? <UpNextChip {...upNext} /> : null}
					{overdueCount > 0 ? (
						<Chip tone="warning" accessibilityLabel={`${overdueCount} overdue tasks`}>
							<AlertTriangle size={15} strokeWidth={2} color={colors.warning} />
							<Text maxFontSizeMultiplier={1.4} style={[styles.chipText, { color: colors.foreground }]}>
								{overdueCount} overdue
							</Text>
						</Chip>
					) : null}
				</ScrollView>
			) : null}
		</View>
	);
}

function UpNextChip({ title, time, onPress }: UpNext) {
	const { colors } = useInk();
	return (
		<Chip
			onPress={onPress}
			accessibilityLabel={`Up next: ${title}, ${time}`}
			accessibilityHint={onPress ? 'Opens the task' : undefined}
		>
			<Clock size={15} strokeWidth={2} color={colors.accent} />
			<Text maxFontSizeMultiplier={1.4} style={[styles.chipText, { color: colors.foreground }]}>
				Up next
			</Text>
			<Text
				numberOfLines={1}
				maxFontSizeMultiplier={1.4}
				style={[styles.chipText, styles.chipQuiet, { color: colors.mutedForeground }]}
			>
				{title}
			</Text>
			<Stamp>{time}</Stamp>
		</Chip>
	);
}

/** A 34pt pill: card face, border, ink shadow. A stat unless it has `onPress`. */
function Chip({
	tone = 'plain',
	onPress,
	accessibilityLabel,
	accessibilityHint,
	children
}: {
	tone?: 'plain' | 'warning';
	onPress?: () => void;
	accessibilityLabel: string;
	accessibilityHint?: string;
	children: ReactNode;
}) {
	const ink = useInk();
	const { colors } = ink;
	const warning = tone === 'warning';
	const face = {
		backgroundColor: warning ? colorMix(colors.warning, colors.card, 0.12) : colors.card,
		borderColor: warning ? colorMix(colors.warning, colors.border, 0.4) : colors.border,
		boxShadow: ink.shadows.ink
	};

	if (!onPress) {
		return (
			<View accessible accessibilityLabel={accessibilityLabel} style={[styles.chip, face]}>
				{children}
			</View>
		);
	}
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			accessibilityHint={accessibilityHint}
			hitSlop={CHIP_SLOP}
			onPress={() => {
				playHaptic('selection');
				onPress();
			}}
			style={({ pressed }) => [styles.chip, face, pressed && { backgroundColor: colors.muted }]}
		>
			{children}
		</Pressable>
	);
}

// Chips are 34pt tall; slop reaches 44.
const CHIP_SLOP = { top: 5, bottom: 5, left: 0, right: 0 } as const;

const styles = StyleSheet.create({
	counts: { marginTop: 5 },
	count: { fontWeight: '600', fontVariant: ['tabular-nums'] },
	// Full bleed so chips scroll to the screen edge; the hairline runs edge to edge too.
	chipRow: { marginHorizontal: -SCREEN_PADDING, marginTop: 12, borderBottomWidth: 1 },
	chips: {
		gap: 8,
		paddingHorizontal: SCREEN_PADDING,
		// Room for the chips' shadow inside the scroll view's clip.
		paddingTop: 2,
		paddingBottom: 12
	},
	chip: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		minHeight: 34,
		paddingHorizontal: 12,
		borderRadius: 17,
		borderWidth: 1
	},
	chipText: { fontSize: 13.5, lineHeight: 18, fontWeight: '600' },
	chipQuiet: { fontWeight: '400', maxWidth: 170, flexShrink: 1 }
});
