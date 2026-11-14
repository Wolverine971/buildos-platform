// apps/mobile/src/components/chat/continue-chip.tsx
// "Continue in Wayne Strategies →" under the newest message of a Workspace chat, when the last
// turn's context finder picked exactly one project with confidence (the web's chip). Tapping it
// moves this chat into that project: same messages, and the next reply gets the project's
// context and tools.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BoltSpinner, ChevronRight, playHaptic } from '@/components/kit';
import { useInk } from '@/providers/theme-provider';
import { typeScale, withAlpha } from '@/theme';

export function ContinueChip({
	name,
	busy,
	error,
	onPress
}: {
	name: string;
	busy: boolean;
	error: string | null;
	onPress: () => void;
}) {
	const { colors } = useInk();
	return (
		<View style={styles.wrap}>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={`Continue in ${name}`}
				accessibilityHint="Moves this chat into the project; the next reply uses its context"
				accessibilityState={{ busy }}
				disabled={busy}
				onPress={() => {
					playHaptic('selection');
					onPress();
				}}
				style={({ pressed }) => [
					styles.chip,
					{
						borderColor: withAlpha(colors.accent, 0.35),
						backgroundColor: withAlpha(colors.accent, pressed ? 0.16 : 0.08)
					}
				]}
			>
				{busy ? <BoltSpinner size={14} label="" /> : null}
				<Text
					numberOfLines={1}
					maxFontSizeMultiplier={1.4}
					style={[styles.text, { color: colors.accent }]}
				>
					Continue in {name}
				</Text>
				<ChevronRight size={14} strokeWidth={2.4} color={colors.accent} />
			</Pressable>
			{error ? (
				<Text
					accessibilityLiveRegion="polite"
					style={[typeScale.small, { color: colors.destructive }]}
				>
					{error}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { alignItems: 'flex-start', gap: 4, paddingTop: 4 },
	chip: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		maxWidth: '100%',
		minHeight: 36,
		paddingHorizontal: 12,
		borderRadius: 18,
		borderWidth: 1
	},
	text: { flexShrink: 1, fontSize: 14, lineHeight: 18, fontWeight: '600' }
});
