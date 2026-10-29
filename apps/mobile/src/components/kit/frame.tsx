// apps/mobile/src/components/kit/frame.tsx
// The website's frame: a grainy bench (behind the status bar, nav and tab bar) with the page
// lying on it as a sheet.
import { StyleSheet, Text, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useInk } from '@/providers/theme-provider';
import { typeScale } from '@/theme';

import { Grain } from './textures';

/** Bench surface: the bench color plus fine grain. Children render above the grain. */
export function Bench({ children, style, ...props }: ViewProps) {
	const { colors } = useInk();
	return (
		<View {...props} style={[{ backgroundColor: colors.bench }, style]}>
			<Grain />
			{children}
		</View>
	);
}

/** The page: background color, a hairline edge where it meets the bench, and a soft top highlight. */
export function Sheet({ children, style, ...props }: ViewProps) {
	const ink = useInk();
	return (
		<View
			{...props}
			style={[
				styles.sheet,
				{
					backgroundColor: ink.colors.background,
					borderTopColor: ink.edge,
					boxShadow: `inset 0 1px 0 ${ink.highlight}`
				},
				style
			]}
		>
			{children}
		</View>
	);
}

/** Page title (26, tight) with an optional muted aside on the same baseline, e.g. the date. */
export function PageTitle({
	title,
	aside,
	style
}: {
	title: string;
	aside?: string;
	style?: StyleProp<ViewStyle>;
}) {
	const { colors } = useInk();
	return (
		<View
			style={[styles.title, style]}
			accessible
			accessibilityRole="header"
			accessibilityLabel={aside ? `${title}, ${aside}` : title}
		>
			<Text maxFontSizeMultiplier={1.3} style={[typeScale.pageTitle, { color: colors.foreground }]}>
				{title}
			</Text>
			{aside ? (
				<Text
					maxFontSizeMultiplier={1.4}
					style={[typeScale.meta, { color: colors.mutedForeground }]}
				>
					{aside}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	sheet: { borderTopWidth: StyleSheet.hairlineWidth },
	title: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		alignItems: 'baseline',
		columnGap: 8,
		rowGap: 2
	}
});
