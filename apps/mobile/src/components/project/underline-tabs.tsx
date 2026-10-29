// apps/mobile/src/components/project/underline-tabs.tsx
// The website's underline tabs (Tasks | Docs) on the header's card: mono counts and a 3pt
// accent underline that slides to the chosen tab.
import { useEffect, useRef, useState } from 'react';
import {
	Animated,
	Platform,
	Pressable,
	type StyleProp,
	StyleSheet,
	Text,
	useAnimatedValue,
	View,
	type ViewStyle
} from 'react-native';

import { GraphPaper, playHaptic } from '@/components/kit';
import { useInk, useReducedMotion } from '@/providers/theme-provider';
import { fontFamily, withAlpha } from '@/theme';

export type UnderlineTab<T extends string> = { value: T; label: string; count?: number };

export type UnderlineTabsProps<T extends string> = {
	value: T;
	options: readonly UnderlineTab<T>[];
	onChange: (value: T) => void;
	/**
	 * How far the header's 12pt graph paper had run when it reached these tabs (its height
	 * mod 12), so the grid lines continue across the seam.
	 */
	gridOffset?: number;
	style?: StyleProp<ViewStyle>;
};

const TAB_HEIGHT = 46;
const UNDERLINE = 3;
// Near-critical: the underline glides over without wobbling.
const SLIDE_SPRING = { stiffness: 520, damping: 42, mass: 1 } as const;

export function UnderlineTabs<T extends string>({
	value,
	options,
	onChange,
	gridOffset = 0,
	style
}: UnderlineTabsProps<T>) {
	const { colors } = useInk();
	const reduceMotion = useReducedMotion();
	const [width, setWidth] = useState(0);
	const x = useAnimatedValue(0);
	const placed = useRef(false);
	const index = Math.max(
		0,
		options.findIndex((option) => option.value === value)
	);
	const cell = options.length ? width / options.length : 0;

	useEffect(() => {
		if (!cell) return;
		const target = index * cell;
		// The first placement and Reduce Motion jump; later changes slide.
		if (!placed.current || reduceMotion) {
			placed.current = true;
			x.setValue(target);
			return;
		}
		Animated.spring(x, { toValue: target, ...SLIDE_SPRING, useNativeDriver: true }).start();
	}, [cell, index, reduceMotion, x]);

	return (
		<View
			accessibilityRole="tablist"
			onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
			style={[
				styles.bar,
				{ backgroundColor: colors.card, borderBottomColor: colors.border },
				style
			]}
		>
			<GraphPaper cell={12} style={gridOffset ? { top: -gridOffset } : undefined} />
			{options.map((option, i) => {
				const selected = option.value === value;
				const spoken = [
					option.label,
					option.count !== undefined ? String(option.count) : ''
				]
					.filter(Boolean)
					.join(', ');
				return (
					<Pressable
						key={option.value}
						// RN gives iOS no "tab" trait; say it in the label like the tab bar does.
						accessibilityRole={Platform.OS === 'ios' ? 'button' : 'tab'}
						accessibilityLabel={
							Platform.OS === 'ios'
								? `${spoken}, tab, ${i + 1} of ${options.length}`
								: spoken
						}
						accessibilityState={{ selected }}
						onPress={() => {
							if (selected) return;
							playHaptic('selection');
							onChange(option.value);
						}}
						style={({ pressed }) => [
							styles.tab,
							{
								backgroundColor: selected
									? withAlpha(colors.card, 0.72)
									: pressed
										? withAlpha(colors.muted, 0.6)
										: 'transparent'
							}
						]}
					>
						<Text
							numberOfLines={1}
							maxFontSizeMultiplier={1.3}
							style={[
								styles.label,
								{ color: selected ? colors.foreground : colors.mutedForeground }
							]}
						>
							{option.label}
						</Text>
						{option.count !== undefined ? (
							<Text
								maxFontSizeMultiplier={1.3}
								style={[styles.count, { color: colors.mutedForeground }]}
							>
								{option.count}
							</Text>
						) : null}
					</Pressable>
				);
			})}
			{cell ? (
				<Animated.View
					style={[
						styles.underline,
						{
							width: cell,
							backgroundColor: colors.accent,
							transform: [{ translateX: x }]
						}
					]}
				/>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	bar: {
		flexDirection: 'row',
		borderBottomWidth: 1,
		overflow: 'hidden'
	},
	tab: {
		flex: 1,
		minHeight: TAB_HEIGHT,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
		paddingHorizontal: 8
	},
	label: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
	count: {
		fontFamily: fontFamily.mono,
		fontSize: 12,
		lineHeight: 16,
		fontVariant: ['tabular-nums']
	},
	underline: {
		position: 'absolute',
		left: 0,
		bottom: 0,
		height: UNDERLINE,
		pointerEvents: 'none'
	}
});
