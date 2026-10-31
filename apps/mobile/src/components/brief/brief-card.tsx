// apps/mobile/src/components/brief/brief-card.tsx
// The brief's card at the top of Today: who it is for, its first line, and Listen when the
// narration exists. Tap anywhere to read; tap Listen to open the page already speaking.
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
	BoltSpinner,
	ChevronRight,
	hitSlopFor,
	MicroLabel,
	Play,
	playHaptic,
	Stamp,
	Sunrise
} from '@/components/kit';
import { useTodayBrief } from '@/hooks/use-brief';
import { briefCardLabel, briefHref, briefLead, isWriting, listenLabel } from '@/lib/brief';
import { civilDay } from '@/lib/due-date';
import { useInk } from '@/providers/theme-provider';
import { typeScale, withAlpha } from '@/theme';

const WRITING_COPY = 'BuildOS is writing it now. It takes a couple of minutes.';

export function BriefCard() {
	const ink = useInk();
	const { colors } = ink;
	const today = civilDay(new Date());
	const { card } = useTodayBrief(today);
	if (!card) return null;

	const { brief } = card;
	const label = briefCardLabel(brief.brief_date, today);
	const writing = isWriting(brief.generation_status);
	const lead = writing ? WRITING_COPY : (briefLead(brief.summary_content) ?? 'Open your brief');
	const audioMs =
		'audio_status' in brief && brief.audio_status === 'ready' ? brief.audio_duration_ms : null;
	const date = card.today ? null : brief.brief_date;
	const open = (autoplay = false) => router.push(briefHref({ date, autoplay }));

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${label.title}, ${label.aside}. ${lead}`}
			accessibilityHint="Opens your brief"
			onPress={() => {
				playHaptic('selection');
				open();
			}}
			style={({ pressed }) => [
				styles.card,
				{
					backgroundColor: pressed ? colors.muted : colors.card,
					borderColor: colors.border,
					boxShadow: ink.shadows.ink
				}
			]}
		>
			<View
				style={[
					styles.glyph,
					{
						backgroundColor: withAlpha(colors.accent, 0.1),
						borderColor: withAlpha(colors.accent, 0.2)
					}
				]}
			>
				{writing ? (
					<BoltSpinner size={18} label="Writing your brief" />
				) : (
					<Sunrise size={18} strokeWidth={2} color={colors.accent} />
				)}
			</View>
			<View style={styles.body}>
				<View style={styles.head}>
					<MicroLabel tone="accent">{label.title}</MicroLabel>
					<Stamp>{label.aside}</Stamp>
				</View>
				<Text
					numberOfLines={2}
					maxFontSizeMultiplier={1.4}
					style={[
						styles.lead,
						{ color: writing ? colors.mutedForeground : colors.foreground }
					]}
				>
					{lead}
				</Text>
				{audioMs !== null ? (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={listenLabel(audioMs).replace(' · ', ', ')}
						accessibilityHint="Opens your brief and plays it"
						hitSlop={hitSlopFor(0, 30)}
						onPress={() => {
							playHaptic('light');
							open(true);
						}}
						style={({ pressed }) => [
							styles.listen,
							{
								backgroundColor: withAlpha(colors.accent, pressed ? 0.2 : 0.1),
								borderColor: withAlpha(colors.accent, 0.25)
							}
						]}
					>
						<Play size={12} strokeWidth={2.4} color={colors.accent} />
						<Text
							maxFontSizeMultiplier={1.3}
							style={[styles.listenText, { color: colors.accent }]}
						>
							{listenLabel(audioMs)}
						</Text>
					</Pressable>
				) : null}
			</View>
			<ChevronRight size={18} strokeWidth={2} color={colors.mutedForeground} />
		</Pressable>
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
	glyph: {
		width: 36,
		height: 36,
		borderRadius: 9,
		borderCurve: 'continuous',
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center'
	},
	body: { flex: 1, minWidth: 0, gap: 3 },
	head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
	lead: { fontSize: 14.5, lineHeight: 20 },
	listen: {
		alignSelf: 'flex-start',
		flexDirection: 'row',
		alignItems: 'center',
		gap: 5,
		minHeight: 30,
		paddingHorizontal: 10,
		marginTop: 5,
		borderRadius: 15,
		borderWidth: 1
	},
	listenText: { ...typeScale.stamp, fontSize: 12.5, fontWeight: '600' }
});
