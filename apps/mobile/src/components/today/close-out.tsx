// apps/mobile/src/components/today/close-out.tsx
// Closing out the day (the web's TodayCloseOut and its evening prompt): what BuildOS saw today,
// then today's picks with Done / Some progress / Not today / Let it go. Nothing changes until
// Apply. "Tell it" opens chat with the close-out line typed and the keyboard up (the web has a
// text box here; on the phone chat's composer has the mic and sits above the keyboard).
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Key, MicroLabel, Mic, playHaptic } from '@/components/kit';
import { useInk } from '@/providers/theme-provider';
import { typeScale, withAlpha } from '@/theme';

import {
	CLOSE_OUT_OPTIONS,
	type CloseOutAnswer,
	type DaySeen,
	seenYouLine,
	type TodayPick
} from './picks';

/** The evening line under the pick card: "Close out the day?" with Close out and Not now. */
export function CloseOutPrompt({ onOpen, onHide }: { onOpen: () => void; onHide: () => void }) {
	const ink = useInk();
	const { colors } = ink;
	return (
		<View
			style={[
				styles.prompt,
				{
					backgroundColor: colors.card,
					borderColor: colors.border,
					boxShadow: ink.shadows.ink
				}
			]}
		>
			<Text
				maxFontSizeMultiplier={1.5}
				style={[styles.promptText, { color: colors.foreground }]}
			>
				<Text style={styles.strong}>Close out the day?</Text> Say what happened. About 30
				seconds.
			</Text>
			<View style={styles.keys}>
				<Key title="Close out" size="sm" haptic="selection" onPress={onOpen} />
				<Key title="Not now" variant="ghost" size="sm" onPress={onHide} />
			</View>
		</View>
	);
}

export function CloseOut({
	picks,
	seen,
	onApply,
	onTalk,
	onHide
}: {
	picks: TodayPick[];
	/** Null while loading. */
	seen: DaySeen | null;
	/** Resolves with how many changes were saved. */
	onApply: (answers: { pick: TodayPick; answer: CloseOutAnswer }[]) => Promise<number>;
	/** Open chat to say what else happened. */
	onTalk: () => void;
	onHide: () => void;
}) {
	const ink = useInk();
	const { colors } = ink;
	const [answers, setAnswers] = useState<Record<string, CloseOutAnswer>>({});
	const [applying, setApplying] = useState(false);
	const [applied, setApplied] = useState<number | null>(null);
	const answered = picks.filter((pick) => answers[pick.key]);

	const choose = (pick: TodayPick, value: CloseOutAnswer) => {
		if (applied !== null) return;
		playHaptic('selection');
		setAnswers((current) => {
			if (current[pick.key] === value) {
				const { [pick.key]: _removed, ...rest } = current;
				return rest;
			}
			return { ...current, [pick.key]: value };
		});
	};

	const apply = async () => {
		if (applying || answered.length === 0) return;
		setApplying(true);
		try {
			setApplied(
				await onApply(answered.map((pick) => ({ pick, answer: answers[pick.key]! })))
			);
		} finally {
			setApplying(false);
		}
	};

	return (
		<View
			accessibilityLabel="Close out the day"
			style={[
				styles.card,
				{
					backgroundColor: colors.card,
					borderColor: colors.border,
					boxShadow: ink.shadows.ink
				}
			]}
		>
			<View style={styles.head}>
				<Text
					accessibilityRole="header"
					maxFontSizeMultiplier={1.4}
					style={[typeScale.section, { color: colors.foreground }]}
				>
					Close out the day
				</Text>
				<Key title="Not now" variant="ghost" size="xs" onPress={onHide} />
			</View>

			<View style={[styles.seen, { backgroundColor: withAlpha(colors.muted, 0.6) }]}>
				<MicroLabel>What BuildOS saw today</MicroLabel>
				<Text
					maxFontSizeMultiplier={1.5}
					style={[typeScale.meta, { color: colors.foreground }]}
				>
					{seenYouLine(seen?.you ?? null)}
				</Text>
				{(seen?.agents ?? []).map((line) => (
					<Text
						key={line}
						maxFontSizeMultiplier={1.5}
						style={[typeScale.small, { color: colors.mutedForeground }]}
					>
						{line}
					</Text>
				))}
			</View>

			{picks.length > 0 ? (
				<>
					<MicroLabel>Today's picks · did they happen?</MicroLabel>
					{picks.map((pick) => (
						<View
							key={pick.key}
							style={[styles.pick, { borderTopColor: withAlpha(colors.border, 0.7) }]}
						>
							<Text
								maxFontSizeMultiplier={1.5}
								style={[typeScale.row, { color: colors.foreground }]}
							>
								{pick.title}
							</Text>
							{pick.projectName ? (
								<Text
									numberOfLines={1}
									style={[typeScale.small, { color: colors.mutedForeground }]}
								>
									{pick.projectName}
								</Text>
							) : null}
							<View accessibilityRole="radiogroup" style={styles.options}>
								{CLOSE_OUT_OPTIONS.map((option) => {
									const on = answers[pick.key] === option.value;
									return (
										<Pressable
											key={option.value}
											accessibilityRole="radio"
											accessibilityState={{
												selected: on,
												disabled: applied !== null
											}}
											accessibilityLabel={`${option.label}: ${pick.title}`}
											disabled={applied !== null}
											onPress={() => choose(pick, option.value)}
											style={({ pressed }) => [
												styles.option,
												on
													? {
															backgroundColor: colors.foreground,
															borderColor: colors.foreground
														}
													: {
															backgroundColor: pressed
																? colors.muted
																: colors.background,
															borderColor: colors.border
														},
												applied !== null && styles.dim
											]}
										>
											<Text
												maxFontSizeMultiplier={1.3}
												style={[
													styles.optionText,
													{
														color: on
															? colors.background
															: colors.foreground
													}
												]}
											>
												{option.label}
											</Text>
										</Pressable>
									);
								})}
							</View>
						</View>
					))}
					<View style={styles.applyRow}>
						{applied !== null ? (
							<Text
								accessibilityLiveRegion="polite"
								maxFontSizeMultiplier={1.5}
								style={[
									typeScale.meta,
									styles.shrink,
									{ color: colors.foreground }
								]}
							>
								Updated {applied} thing{applied === 1 ? '' : 's'}. Tomorrow starts
								from here.
							</Text>
						) : (
							<>
								<Text
									maxFontSizeMultiplier={1.5}
									style={[
										typeScale.small,
										styles.shrink,
										{ color: colors.mutedForeground }
									]}
								>
									Skip anything. Nothing changes until you apply.
								</Text>
								<Key
									title={`Apply${answered.length ? ` ${answered.length}` : ''}`}
									variant="primary"
									size="sm"
									haptic="success"
									loading={applying}
									disabled={answered.length === 0}
									onPress={() => void apply()}
								/>
							</>
						)}
					</View>
				</>
			) : null}

			<View style={styles.talk}>
				<Text
					maxFontSizeMultiplier={1.5}
					style={[typeScale.meta, styles.shrink, { color: colors.mutedForeground }]}
				>
					Anything else happen? BuildOS will update your projects.
				</Text>
				<Key
					title="Tell it"
					icon={Mic}
					size="sm"
					haptic="selection"
					accessibilityHint="Opens chat to say what happened, by voice or typing"
					onPress={onTalk}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	prompt: { gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
	promptText: { fontSize: 14.5, lineHeight: 20 },
	strong: { fontWeight: '600' },
	keys: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
	card: { gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
	head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
	seen: { gap: 4, padding: 10, borderRadius: 8 },
	pick: { gap: 4, paddingTop: 10, borderTopWidth: 1 },
	options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
	// Two by two: four answers never fit one row on a phone, and an even grid scans faster.
	option: {
		flexBasis: '45%',
		flexGrow: 1,
		minHeight: 40,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 10,
		borderRadius: 8,
		borderWidth: 1
	},
	optionText: { fontSize: 14, lineHeight: 18 },
	dim: { opacity: 0.6 },
	applyRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: 10
	},
	shrink: { flex: 1, minWidth: 0 },
	talk: { flexDirection: 'row', alignItems: 'center', gap: 10 }
});
