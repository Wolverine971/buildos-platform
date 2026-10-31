// apps/mobile/src/components/brief/brief-player.tsx
// Listen: one key, the clock, a thin progress line. Plays on while the page scrolls.
import { StyleSheet, Text, View } from 'react-native';

import { Key, Pause, Play, Stamp } from '@/components/kit';
import type { BriefAudio } from '@/hooks/use-brief-audio';
import { formatElapsed } from '@/lib/brief';
import { useInk } from '@/providers/theme-provider';
import { typeScale } from '@/theme';

export function BriefPlayer({ audio }: { audio: BriefAudio }) {
	const ink = useInk();
	const { colors } = ink;
	const progress =
		audio.duration > 0 ? Math.min(1, Math.max(0, audio.elapsed / audio.duration)) : 0;
	const clock = `${formatElapsed(audio.elapsed)} / ${formatElapsed(audio.duration)}`;

	return (
		<View
			style={[
				styles.card,
				{
					backgroundColor: colors.card,
					borderColor: colors.border,
					boxShadow: ink.shadows.ink
				}
			]}
		>
			<Key
				icon={audio.playing ? Pause : Play}
				variant="primary"
				loading={audio.loading}
				accessibilityLabel={audio.playing ? 'Pause your brief' : 'Listen to your brief'}
				accessibilityHint={audio.playing ? undefined : 'Reads the brief aloud'}
				onPress={audio.toggle}
			/>
			<View style={styles.body}>
				<View style={styles.row}>
					<Text
						numberOfLines={1}
						maxFontSizeMultiplier={1.4}
						style={[typeScale.section, styles.title, { color: colors.foreground }]}
					>
						{audio.playing ? 'Playing your brief' : 'Listen to your brief'}
					</Text>
					<Stamp
						accessibilityLabel={`${formatElapsed(audio.elapsed)} of ${formatElapsed(audio.duration)}`}
					>
						{clock}
					</Stamp>
				</View>
				<View
					accessible
					accessibilityRole="progressbar"
					accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
					style={[styles.track, { backgroundColor: colors.muted }]}
				>
					<View
						style={[
							styles.fill,
							{ width: `${progress * 100}%`, backgroundColor: colors.accent }
						]}
					/>
				</View>
				{audio.error ? (
					<Text
						selectable
						maxFontSizeMultiplier={1.4}
						style={[typeScale.meta, { color: colors.destructive }]}
					>
						{audio.error}
					</Text>
				) : null}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		padding: 12,
		borderRadius: 12,
		borderCurve: 'continuous',
		borderWidth: 1
	},
	body: { flex: 1, minWidth: 0, gap: 8 },
	row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
	title: { flexShrink: 1 },
	track: { height: 3, borderRadius: 2, overflow: 'hidden' },
	fill: { height: 3, borderRadius: 2 }
});
