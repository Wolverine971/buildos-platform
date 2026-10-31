// apps/mobile/src/components/brief/notices.tsx
// The brief page's quiet states: no brief for a day, and a brief still being written.
import { StyleSheet, Text, View } from 'react-native';

import { BoltSpinner, Sunrise } from '@/components/kit';
import { useInk } from '@/providers/theme-provider';
import { typeScale, withAlpha } from '@/theme';

export function BriefNotice({ variant, today }: { variant: 'none' | 'writing'; today: boolean }) {
	const ink = useInk();
	const { colors } = ink;
	const copy =
		variant === 'writing'
			? {
					title: 'Being written now',
					body: 'BuildOS is reading through your projects. This page fills in on its own in a couple of minutes.'
				}
			: today
				? {
						title: 'No brief yet today',
						body: 'Briefs are written each morning. Today’s will show up here as soon as it is ready.'
					}
				: {
						title: 'No brief for this day',
						body: 'Nothing was written for this day. Step to another day to keep reading.'
					};

	return (
		<View
			accessible
			accessibilityLabel={`${copy.title}. ${copy.body}`}
			style={[
				styles.card,
				{
					backgroundColor: colors.card,
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
				{variant === 'writing' ? (
					<BoltSpinner size={18} label="Being written" />
				) : (
					<Sunrise size={18} strokeWidth={2} color={colors.accent} />
				)}
			</View>
			<Text
				maxFontSizeMultiplier={1.6}
				style={[typeScale.section, styles.center, { color: colors.foreground }]}
			>
				{copy.title}
			</Text>
			<Text
				maxFontSizeMultiplier={1.6}
				style={[styles.body, styles.center, { color: colors.mutedForeground }]}
			>
				{copy.body}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		alignItems: 'center',
		gap: 8,
		paddingVertical: 24,
		paddingHorizontal: 20,
		borderRadius: 12,
		borderCurve: 'continuous',
		borderWidth: 1
	},
	glyph: {
		width: 40,
		height: 40,
		borderRadius: 10,
		borderCurve: 'continuous',
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 4
	},
	body: { fontSize: 13.5, lineHeight: 20, maxWidth: 300 },
	center: { textAlign: 'center' }
});
