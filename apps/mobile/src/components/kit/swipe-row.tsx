// apps/mobile/src/components/kit/swipe-row.tsx
// A row you can swipe: right for its yes (Done), left for its no (Not today, Remove), like Mail.
// The action shows under the row as it slides; a tick of haptic marks the point where letting
// go will act, and the row springs back either way (the caller changes what the row shows).
// Built on React Native's own PanResponder so it needs no native module (Expo Go safe). The
// row's keys stay: swiping is a shortcut, and VoiceOver gets the same two actions in its menu.
import { type ReactNode, useMemo, useRef } from 'react';
import {
	Animated,
	PanResponder,
	type StyleProp,
	StyleSheet,
	Text,
	useAnimatedValue,
	View,
	type ViewStyle
} from 'react-native';

import { useInk, useReducedMotion } from '@/providers/theme-provider';
import { withAlpha } from '@/theme';

import type { Icon } from './icons';
import { playHaptic } from './key';
import { claimsSwipe, KEY_SPRING, SWIPE, type SwipeSide, swipeOffset, swipeOutcome } from './math';

export type SwipeAction = {
	label: string;
	icon: Icon;
	/** success = green (Done), muted = grey (Not today, Remove). */
	tone: 'success' | 'muted';
	onSwipe: () => void;
};

export function SwipeRow({
	right,
	left,
	disabled = false,
	face,
	style,
	children
}: {
	/** Swipe right (finger moves right): the row's yes. */
	right?: SwipeAction;
	/** Swipe left: the row's no. */
	left?: SwipeAction;
	disabled?: boolean;
	/** The row's face, which must be opaque to hide the action under it. Default: page color. */
	face?: string;
	style?: StyleProp<ViewStyle>;
	children: ReactNode;
}) {
	const { colors } = useInk();
	const reduceMotion = useReducedMotion();
	const x = useAnimatedValue(0);
	// Latest props for the responder, which is created once.
	const live = useRef({ right, left, disabled, reduceMotion });
	live.current = { right, left, disabled, reduceMotion };
	const armed = useRef<SwipeSide | null>(null);

	const responder = useMemo(() => {
		const enabled = () => ({
			right: !live.current.disabled && Boolean(live.current.right),
			left: !live.current.disabled && Boolean(live.current.left)
		});
		const settle = () => {
			armed.current = null;
			if (live.current.reduceMotion) x.setValue(0);
			else Animated.spring(x, { toValue: 0, ...KEY_SPRING, useNativeDriver: true }).start();
		};
		return PanResponder.create({
			onMoveShouldSetPanResponder: (_event, g) =>
				!live.current.disabled && claimsSwipe(g.dx, g.dy),
			onPanResponderTerminationRequest: () => false,
			onPanResponderMove: (_event, g) => {
				const on = enabled();
				x.setValue(swipeOffset(g.dx, on));
				const next = swipeOutcome(g.dx, on);
				if (next !== armed.current) {
					armed.current = next;
					if (next) playHaptic('selection');
				}
			},
			onPanResponderRelease: (_event, g) => {
				const side = swipeOutcome(g.dx, enabled());
				settle();
				if (!side) return;
				const action = side === 'right' ? live.current.right : live.current.left;
				if (!action) return;
				playHaptic(action.tone === 'success' ? 'success' : 'light');
				action.onSwipe();
			},
			onPanResponderTerminate: settle
		});
	}, [x]);

	const tint = (action: SwipeAction | undefined) =>
		action?.tone === 'success' ? colors.success : colors.mutedForeground;
	const actions = [right, left].filter((action): action is SwipeAction => Boolean(action));

	return (
		<View
			style={[styles.wrap, style]}
			accessibilityActions={actions.map((action) => ({
				name: action.label,
				label: action.label
			}))}
			onAccessibilityAction={(event) =>
				actions.find((action) => action.label === event.nativeEvent.actionName)?.onSwipe()
			}
		>
			{right ? (
				<Animated.View
					pointerEvents="none"
					style={[
						styles.under,
						styles.underLeft,
						{
							backgroundColor: withAlpha(tint(right), 0.14),
							opacity: x.interpolate({
								inputRange: [0, 24, SWIPE.trigger],
								outputRange: [0, 0.6, 1],
								extrapolate: 'clamp'
							})
						}
					]}
				>
					<right.icon size={16} strokeWidth={2.5} color={tint(right)} />
					<Text style={[styles.label, { color: tint(right) }]}>{right.label}</Text>
				</Animated.View>
			) : null}
			{left ? (
				<Animated.View
					pointerEvents="none"
					style={[
						styles.under,
						styles.underRight,
						{
							backgroundColor: withAlpha(tint(left), 0.14),
							opacity: x.interpolate({
								inputRange: [-SWIPE.trigger, -24, 0],
								outputRange: [1, 0.6, 0],
								extrapolate: 'clamp'
							})
						}
					]}
				>
					<Text style={[styles.label, { color: tint(left) }]}>{left.label}</Text>
					<left.icon size={16} strokeWidth={2.5} color={tint(left)} />
				</Animated.View>
			) : null}
			<Animated.View
				{...responder.panHandlers}
				style={[
					{ backgroundColor: face ?? colors.background, transform: [{ translateX: x }] }
				]}
			>
				{children}
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { overflow: 'hidden', borderRadius: 8 },
	under: {
		position: 'absolute',
		top: 0,
		right: 0,
		bottom: 0,
		left: 0,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
		paddingHorizontal: 16,
		borderRadius: 8
	},
	underLeft: { justifyContent: 'flex-start' },
	underRight: { justifyContent: 'flex-end' },
	label: { fontSize: 14, lineHeight: 18, fontWeight: '600' }
});
