// apps/mobile/src/components/today/pick-card.tsx
// The one thing to work on, on top of Today (the web's TodayPickCard): "Start here" in the
// morning, "Next up" later or after a Done. Open it, mark it Done, or "Not this" for the next
// suggestion. After noon, "Today went sideways" clears the plan for the day without pushing
// anything onto tomorrow.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Check, Key, MicroLabel } from '@/components/kit';
import { useAnnounce } from '@/hooks/use-announce';
import { useInk } from '@/providers/theme-provider';
import { typeScale, withAlpha } from '@/theme';

import { PICK_TAGS, type TimeOfDay, type TodayPick } from './picks';

export function PickCard({
	picks,
	time,
	sideways,
	lastDone,
	onOpen,
	onDone,
	onSideways,
	onBack
}: {
	picks: TodayPick[];
	time: TimeOfDay;
	sideways: boolean;
	/** Title of the pick just marked done, shown once above the next one. */
	lastDone: string | null;
	onOpen: (pick: TodayPick) => void;
	onDone: (pick: TodayPick) => void;
	onSideways: () => void;
	onBack: () => void;
}) {
	const ink = useInk();
	const { colors } = ink;
	const [skipped, setSkipped] = useState<string[]>([]);
	const live = picks.filter((pick) => !skipped.includes(pick.key));
	const pick = live[0] ?? null;
	const heading = lastDone ? 'Next up' : time === 'morning' ? 'Start here' : 'Next up';
	useAnnounce(lastDone ? `Marked done: ${lastDone}` : null);

	const card = [
		styles.card,
		{ backgroundColor: colors.card, borderColor: colors.border, boxShadow: ink.shadows.ink }
	];

	if (sideways) {
		return (
			<View style={card} accessibilityLabel="What to work on">
				<MicroLabel>Plan cleared for today</MicroLabel>
				<Text
					maxFontSizeMultiplier={1.5}
					style={[styles.title, { color: colors.foreground }]}
				>
					OK. Today's off. Nothing gets pushed onto tomorrow.
				</Text>
				<Text
					maxFontSizeMultiplier={1.6}
					style={[typeScale.meta, { color: colors.mutedForeground }]}
				>
					Your tasks keep their own dates. Come back whenever you're ready.
				</Text>
				<View style={styles.keys}>
					<Key title="Actually, I'm back" size="sm" onPress={onBack} />
				</View>
			</View>
		);
	}

	return (
		<View style={card}>
			{lastDone ? (
				<View style={styles.doneLine}>
					<Check size={13} strokeWidth={2.5} color={colors.success} />
					<Text
						numberOfLines={1}
						maxFontSizeMultiplier={1.4}
						style={[typeScale.small, styles.shrink, { color: colors.mutedForeground }]}
					>
						Marked done: {lastDone}
					</Text>
				</View>
			) : null}
			{pick ? (
				<>
					<View style={styles.head}>
						<MicroLabel tone="accent">{heading}</MicroLabel>
						<View
							style={[
								styles.tag,
								{
									backgroundColor: withAlpha(colors.accent, 0.1),
									borderColor: withAlpha(colors.accent, 0.22)
								}
							]}
						>
							<View style={[styles.tagDot, { backgroundColor: colors.accent }]} />
							<Text
								maxFontSizeMultiplier={1.3}
								style={[styles.tagText, { color: colors.accent }]}
							>
								{PICK_TAGS[pick.kind]}
							</Text>
						</View>
					</View>
					<Text
						accessibilityRole="header"
						maxFontSizeMultiplier={1.5}
						style={[styles.title, { color: colors.foreground }]}
					>
						{pick.title}
					</Text>
					<Text
						maxFontSizeMultiplier={1.6}
						style={[typeScale.meta, { color: colors.mutedForeground }]}
					>
						{pick.projectName ? `${pick.projectName} · ` : ''}
						{pick.why}
					</Text>
					<View style={styles.keys}>
						<Key
							title="Open it"
							variant="primary"
							size="sm"
							haptic="selection"
							onPress={() => onOpen(pick)}
						/>
						<Key
							title="Done"
							icon={Check}
							size="sm"
							haptic="success"
							onPress={() => onDone(pick)}
						/>
						<Key
							title="Not this"
							variant="ghost"
							size="sm"
							haptic="selection"
							onPress={() => setSkipped((current) => [...current, pick.key])}
						/>
						{time !== 'morning' ? (
							<Key
								title="Today went sideways"
								variant="ghost"
								size="sm"
								onPress={onSideways}
							/>
						) : null}
					</View>
				</>
			) : (
				<>
					<MicroLabel>
						{picks.length > 0 ? "That's all I'd suggest" : 'Nothing pressing'}
					</MicroLabel>
					<Text
						maxFontSizeMultiplier={1.5}
						style={[styles.quiet, { color: colors.foreground }]}
					>
						Nothing else stands out. Pick anything below, or capture what's on your
						mind.
					</Text>
					{skipped.length > 0 ? (
						<View style={styles.keys}>
							<Key
								title="Show the suggestions again"
								variant="ghost"
								size="sm"
								onPress={() => setSkipped([])}
							/>
						</View>
					) : null}
				</>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	card: { gap: 8, padding: 14, borderRadius: 12, borderWidth: 1 },
	head: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
	tag: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 5,
		paddingHorizontal: 7,
		paddingVertical: 2,
		borderRadius: 6,
		borderWidth: 1
	},
	tagDot: { width: 5, height: 5, borderRadius: 3 },
	tagText: { fontSize: 11.5, lineHeight: 15, fontWeight: '600' },
	title: { fontSize: 19, lineHeight: 24, fontWeight: '700', letterSpacing: -0.3 },
	quiet: { fontSize: 15, lineHeight: 21, fontWeight: '500' },
	keys: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
	doneLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	shrink: { flexShrink: 1 }
});
