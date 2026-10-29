// apps/mobile/src/components/kit/label.tsx
import { Text, type TextProps } from 'react-native';

import { useInk, useTheme } from '@/providers/theme-provider';
import { type Ink, type ThemeColors, typeScale } from '@/theme';

export type LabelTone = 'muted' | 'accent';

/** The web's `.micro-label`: mono 11, uppercase, tracked. Accent for NEXT / NEXT STEP. */
export function MicroLabel({
	tone = 'muted',
	style,
	...props
}: TextProps & { tone?: LabelTone }) {
	const colors = useTheme();
	return (
		<Text
			maxFontSizeMultiplier={1.4}
			{...props}
			style={[
				typeScale.microLabel,
				{ color: tone === 'accent' ? colors.accent : colors.mutedForeground },
				style
			]}
		/>
	);
}

export type StampTone =
	| 'muted'
	| 'foreground'
	| 'accent'
	| 'destructive'
	| 'warning'
	| 'success'
	| 'info';

const STAMP_COLOR: Record<Exclude<StampTone, 'warning'>, keyof ThemeColors> = {
	muted: 'mutedForeground',
	foreground: 'foreground',
	accent: 'accent',
	destructive: 'destructive',
	success: 'success',
	info: 'info'
};

/** A stamp's text color. Warning uses the readable warning text, not the raw token. */
function stampColor(tone: StampTone, ink: Ink): string {
	return tone === 'warning' ? ink.warningText : ink.colors[STAMP_COLOR[tone]];
}

/** The web's `.stamp`: mono, tabular numbers, for counts, dates and fact tags. */
export function Stamp({
	size = 12,
	tone = 'muted',
	style,
	...props
}: TextProps & { size?: number; tone?: StampTone }) {
	const ink = useInk();
	return (
		<Text
			maxFontSizeMultiplier={1.4}
			{...props}
			style={[
				typeScale.stamp,
				{
					fontSize: size,
					lineHeight: Math.round(size * 1.35),
					color: stampColor(tone, ink)
				},
				style
			]}
		/>
	);
}
