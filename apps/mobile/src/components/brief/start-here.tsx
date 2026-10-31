// apps/mobile/src/components/brief/start-here.tsx
// The brief's priority actions as numbered rows in an accent tile (the project page's NEXT
// STEP block, with more than one step). A row with a task behind it opens the reader.
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChevronRight, MicroLabel, playHaptic, Stamp } from '@/components/kit';
import type { BriefAction } from '@/lib/brief';
import { useInk } from '@/providers/theme-provider';
import { colorMix, withAlpha } from '@/theme';

export function StartHere({
	actions,
	onOpen
}: {
	actions: BriefAction[];
	onOpen: (href: string) => void;
}) {
	const { colors } = useInk();
	return (
		<View
			style={[
				styles.tile,
				{
					borderColor: colorMix(colors.accent, colors.border, 0.35),
					backgroundColor: colorMix(colors.accent, colors.background, 0.06)
				}
			]}
		>
			<MicroLabel tone="accent" accessibilityRole="header" style={styles.label}>
				Start here
			</MicroLabel>
			{actions.map((action, index) => {
				const content = (
					<>
						<Stamp tone="accent" style={styles.index}>
							{index + 1}
						</Stamp>
						<Text
							maxFontSizeMultiplier={1.4}
							style={[styles.text, { color: colors.foreground }]}
						>
							{action.text}
						</Text>
						{action.href ? (
							<ChevronRight
								size={16}
								strokeWidth={2}
								color={colors.mutedForeground}
							/>
						) : null}
					</>
				);
				const href = action.href;
				return (
					<Fragment key={`${index}-${action.text}`}>
						{index > 0 ? (
							<View
								style={[
									styles.rule,
									{ backgroundColor: withAlpha(colors.border, 0.8) }
								]}
							/>
						) : null}
						{href ? (
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={`${index + 1}. ${action.text}`}
								accessibilityHint="Opens the task"
								onPress={() => {
									playHaptic('selection');
									onOpen(href);
								}}
								style={({ pressed }) => [
									styles.row,
									pressed
										? { backgroundColor: withAlpha(colors.accent, 0.08) }
										: null
								]}
							>
								{content}
							</Pressable>
						) : (
							<View
								accessible
								accessibilityLabel={`${index + 1}. ${action.text}`}
								style={styles.row}
							>
								{content}
							</View>
						)}
					</Fragment>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	tile: {
		paddingVertical: 10,
		paddingHorizontal: 12,
		borderRadius: 10,
		borderCurve: 'continuous',
		borderWidth: 1
	},
	label: { marginBottom: 2 },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		minHeight: 44,
		paddingVertical: 8,
		marginHorizontal: -6,
		paddingHorizontal: 6,
		borderRadius: 7,
		borderCurve: 'continuous'
	},
	index: { minWidth: 14, textAlign: 'right' },
	text: { flex: 1, fontSize: 14.5, lineHeight: 20 },
	rule: { height: StyleSheet.hairlineWidth }
});
