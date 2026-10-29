// apps/mobile/src/components/reader/state-switcher.tsx
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, useAnimatedValue, View } from 'react-native';

import {
	Circle,
	CircleCheck,
	CircleDot,
	CircleSlash,
	type Icon,
	playHaptic
} from '@/components/kit';
import { useInk, useReducedMotion } from '@/providers/theme-provider';

import { TASK_STATES, type TaskStateKey } from './task-state';

/** The website's state glyphs. */
export const STATE_ICON: Record<TaskStateKey, Icon> = {
	todo: Circle,
	in_progress: CircleDot,
	blocked: CircleSlash,
	done: CircleCheck
};

const PAD = 3;
const GAP = 2;
const THUMB_SPRING = { stiffness: 520, damping: 40, mass: 1 } as const;

/**
 * To do / In progress / Blocked / Done in one muted track. The raised thumb slides to the
 * chosen state; a tap saves at once (the change shows everywhere before the server answers).
 */
export function StateSwitcher({
	value,
	onChange,
	disabled = false
}: {
	value: string;
	onChange: (next: TaskStateKey) => void;
	disabled?: boolean;
}) {
	const ink = useInk();
	const { colors } = ink;
	const reduceMotion = useReducedMotion();
	const [width, setWidth] = useState(0);
	const index = TASK_STATES.findIndex((state) => state.key === value);
	const count = TASK_STATES.length;
	const segment = width > 0 ? (width - PAD * 2 - GAP * (count - 1)) / count : 0;
	const x = useAnimatedValue(0);
	const placed = useRef(false);

	useEffect(() => {
		if (!segment || index < 0) return;
		const to = index * (segment + GAP);
		// First placement (and Reduce Motion) jumps; later changes slide.
		if (!placed.current || reduceMotion) {
			x.stopAnimation();
			x.setValue(to);
			placed.current = true;
			return;
		}
		Animated.spring(x, { toValue: to, ...THUMB_SPRING, useNativeDriver: true }).start();
	}, [index, segment, reduceMotion, x]);

	return (
		<View
			accessibilityLabel="Task state"
			onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
			style={[
				styles.track,
				{ backgroundColor: colors.muted, opacity: disabled ? 0.5 : 1 }
			]}
		>
			{segment > 0 && index >= 0 ? (
				<Animated.View
					style={[
						styles.thumb,
						{
							width: segment,
							backgroundColor: colors.background,
							boxShadow: ink.shadows.ink,
							transform: [{ translateX: x }]
						}
					]}
				/>
			) : null}
			{TASK_STATES.map((state) => {
				const selected = state.key === value;
				const Glyph = STATE_ICON[state.key];
				const tint = selected ? colors.foreground : colors.mutedForeground;
				return (
					<Pressable
						key={state.key}
						accessibilityRole="button"
						accessibilityLabel={state.label}
						accessibilityState={{ selected, disabled }}
						disabled={disabled}
						hitSlop={{ top: 3, bottom: 3 }}
						onPress={() => {
							if (selected) return;
							playHaptic('selection');
							onChange(state.key);
						}}
						style={({ pressed }) => [
							styles.segment,
							{ opacity: pressed && !selected ? 0.55 : 1 }
						]}
					>
						<Glyph size={12} color={tint} strokeWidth={2.25} />
						<Text
							numberOfLines={1}
							adjustsFontSizeToFit
							minimumFontScale={0.8}
							maxFontSizeMultiplier={1.2}
							style={[styles.label, { color: tint }]}
						>
							{state.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	track: { flexDirection: 'row', padding: PAD, gap: GAP, borderRadius: 11 },
	thumb: {
		position: 'absolute',
		top: PAD,
		bottom: PAD,
		left: PAD,
		borderRadius: 8,
		pointerEvents: 'none'
	},
	segment: {
		flex: 1,
		minWidth: 0,
		height: 38,
		borderRadius: 8,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 4,
		paddingHorizontal: 2
	},
	label: { fontSize: 12, fontWeight: '600', flexShrink: 1 }
});
