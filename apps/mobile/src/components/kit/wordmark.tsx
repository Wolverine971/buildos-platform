// apps/mobile/src/components/kit/wordmark.tsx
import { type StyleProp, StyleSheet, Text, type TextStyle, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/providers/theme-provider';

import { usePatternId } from './textures';

/**
 * "Build" + accent "OS", the website's nav wordmark (`.logo-os`): weight 900, tight tracking,
 * a soft accent bloom and 3pt halftone dots behind "OS". Fixed size (ignores Dynamic Type) so
 * it fits the nav bar.
 */
export function Wordmark({ size = 24, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
	const colors = useTheme();
	const glowId = usePatternId('os-glow');
	const dotsId = usePatternId('os-dots');

	const text: TextStyle = {
		fontSize: size,
		lineHeight: Math.round(size * 1.15),
		fontWeight: '900',
		letterSpacing: -0.045 * size
	};
	const padV = Math.round(size * 0.08);
	const corner = Math.round(size * 0.17);

	return (
		<View style={[styles.row, style]} accessible accessibilityRole="text" accessibilityLabel="BuildOS">
			<Text allowFontScaling={false} style={[text, { color: colors.foreground }]}>
				Build
			</Text>
			<View
				style={{
					paddingHorizontal: Math.round(size * 0.125),
					paddingVertical: padV,
					marginVertical: -padV
				}}
			>
				<Svg
					style={[StyleSheet.absoluteFill, styles.decor]}
					width="100%"
					height="100%"
					accessibilityElementsHidden
					importantForAccessibility="no-hide-descendants"
				>
					<Defs>
						<RadialGradient id={glowId} cx="50%" cy="55%" fx="50%" fy="55%" rx="71%" ry="74%">
							<Stop offset="0" stopColor={colors.accent} stopOpacity={0.22} />
							<Stop offset="0.55" stopColor={colors.accent} stopOpacity={0.09} />
							<Stop offset="0.78" stopColor={colors.accent} stopOpacity={0} />
						</RadialGradient>
						<Pattern id={dotsId} patternUnits="userSpaceOnUse" x={0} y={0} width={3} height={3}>
							<Circle cx={1.5} cy={1.5} r={0.8} fill={colors.accent} fillOpacity={0.28} />
						</Pattern>
					</Defs>
					<Rect width="100%" height="100%" rx={corner} ry={corner} fill={`url(#${glowId})`} />
					<Rect
						width="100%"
						height="100%"
						rx={corner}
						ry={corner}
						fill={`url(#${dotsId})`}
						opacity={0.6}
					/>
				</Svg>
				<Text allowFontScaling={false} style={[text, { color: colors.accent }]}>
					OS
				</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	row: { flexDirection: 'row', alignItems: 'center' },
	decor: { pointerEvents: 'none' }
});
