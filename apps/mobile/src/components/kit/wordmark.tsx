// apps/mobile/src/components/kit/wordmark.tsx
import { useState } from 'react';
import {
	type StyleProp,
	StyleSheet,
	Text,
	type TextStyle,
	View,
	type ViewStyle
} from 'react-native';
import Svg, { Circle, Defs, Mask, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

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
	const fadeId = usePatternId('os-fade');
	const maskId = usePatternId('os-mask');
	const dotsId = usePatternId('os-dots');
	// The glow is drawn at the measured size of the "OS" box, so it sits exactly behind the
	// letters instead of trusting percentage sizes inside an absolutely placed Svg.
	const [box, setBox] = useState<{ width: number; height: number } | null>(null);

	const text: TextStyle = {
		fontSize: size,
		lineHeight: Math.round(size * 1.15),
		fontWeight: '900',
		letterSpacing: -0.045 * size
	};
	const corner = Math.round(size * 0.17);

	return (
		<View
			style={[styles.row, style]}
			accessible
			accessibilityRole="text"
			accessibilityLabel="BuildOS"
		>
			<Text allowFontScaling={false} style={[text, { color: colors.foreground }]}>
				Build
			</Text>
			<View
				style={{
					paddingHorizontal: Math.round(size * 0.125),
					marginLeft: Math.round(size * 0.04)
				}}
				onLayout={(event) => {
					const { width, height } = event.nativeEvent.layout;
					setBox((current) =>
						current && current.width === width && current.height === height
							? current
							: { width, height }
					);
				}}
			>
				{box ? (
					<Svg
						style={styles.decor}
						width={box.width}
						height={box.height}
						accessibilityElementsHidden
						importantForAccessibility="no-hide-descendants"
					>
						<Defs>
							<RadialGradient id={glowId} cx="50%" cy="55%" rx="62%" ry="66%">
								<Stop offset="0" stopColor={colors.accent} stopOpacity={0.22} />
								<Stop offset="0.6" stopColor={colors.accent} stopOpacity={0.09} />
								<Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
							</RadialGradient>
							{/* Mask luminance (white = show), not a visible color: fades the dots out. */}
							<RadialGradient id={fadeId} cx="50%" cy="55%" rx="55%" ry="60%">
								<Stop offset="0" stopColor="#ffffff" stopOpacity={1} />
								<Stop offset="0.7" stopColor="#ffffff" stopOpacity={0.5} />
								<Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
							</RadialGradient>
							<Mask id={maskId} x={0} y={0} width={box.width} height={box.height}>
								<Rect
									width={box.width}
									height={box.height}
									fill={`url(#${fadeId})`}
								/>
							</Mask>
							<Pattern
								id={dotsId}
								patternUnits="userSpaceOnUse"
								x={0}
								y={0}
								width={3}
								height={3}
							>
								<Circle
									cx={1.5}
									cy={1.5}
									r={0.8}
									fill={colors.accent}
									fillOpacity={0.28}
								/>
							</Pattern>
						</Defs>
						<Rect
							width={box.width}
							height={box.height}
							rx={corner}
							ry={corner}
							fill={`url(#${glowId})`}
						/>
						<Rect
							width={box.width}
							height={box.height}
							rx={corner}
							ry={corner}
							fill={`url(#${dotsId})`}
							mask={`url(#${maskId})`}
							opacity={0.6}
						/>
					</Svg>
				) : null}
				<Text allowFontScaling={false} style={[text, { color: colors.accent }]}>
					OS
				</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	row: { flexDirection: 'row', alignItems: 'center' },
	decor: { position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }
});
